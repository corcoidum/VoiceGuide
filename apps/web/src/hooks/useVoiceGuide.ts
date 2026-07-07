import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GuideOrchestrator,
  LearningProgressTracker,
  ToolGuideRegistry,
  builtinPacks,
  type DomSummary,
  type GuideMode,
  type GuideResponse,
  type RedactionFinding,
  type ScreenContext,
  type ToolDetection,
} from '@voiceguide/core';
import { WebSpeechSTTProvider, WebSpeechTTSProvider } from '../providers/webSpeech';
import { ServerLLMProvider } from '../providers/serverLLM';
import { LocalStorageProgressStorage } from '../storage';

export interface ChatMessage {
  id: number;
  role: 'user' | 'guide';
  text: string;
  response?: GuideResponse;
}

export interface ExtensionPageContext {
  url: string;
  title: string;
  domSummary?: DomSummary;
  capturedAt: string;
}

export interface ExtensionBridgeStatus {
  connected: boolean;
  refreshing: boolean;
  message: string;
  lastUpdatedAt: string | null;
}

let messageId = 0;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isExtensionPageContext(value: unknown): value is ExtensionPageContext {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const dom = record['domSummary'];
  const domOk =
    dom === undefined ||
    (typeof dom === 'object' &&
      dom !== null &&
      !Array.isArray(dom) &&
      isStringArray((dom as Record<string, unknown>)['headings']) &&
      isStringArray((dom as Record<string, unknown>)['buttons']) &&
      isStringArray((dom as Record<string, unknown>)['links']) &&
      isStringArray((dom as Record<string, unknown>)['inputs']) &&
      isStringArray((dom as Record<string, unknown>)['landmarks']));

  return (
    typeof record['url'] === 'string' &&
    typeof record['title'] === 'string' &&
    typeof record['capturedAt'] === 'string' &&
    domOk
  );
}

export function useVoiceGuide() {
  /* ----------------------------- Core setup ---------------------------- */
  const orchestrator = useMemo(() => {
    const registry = new ToolGuideRegistry();
    for (const pack of builtinPacks) registry.register(pack);
    return new GuideOrchestrator({
      registry,
      llm: new ServerLLMProvider(),
      progress: new LearningProgressTracker(new LocalStorageProgressStorage()),
    });
  }, []);
  const tts = useMemo(() => new WebSpeechTTSProvider(), []);

  /* ------------------------------- State -------------------------------- */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Privacy defaults: everything OFF until the user turns it on.
  const [micOn, setMicOn] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [screenShareOn, setScreenShareOn] = useState(false);
  const [contextSharingOn, setContextSharingOn] = useState(true);
  const [autoDetect, setAutoDetect] = useState(true);

  const [interimText, setInterimText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceRate, setVoiceRate] = useState(1);
  const [voiceOutputOn, setVoiceOutputOn] = useState(true);

  const [mode, setMode] = useState<GuideMode>('coach');
  const [selectedToolId, setSelectedToolId] = useState<string>('');

  const [extensionContext, setExtensionContext] =
    useState<ExtensionPageContext | null>(null);
  const [extensionBridgeStatus, setExtensionBridgeStatus] =
    useState<ExtensionBridgeStatus>({
      connected: false,
      refreshing: false,
      message: 'Chrome 탭 연결 대기 중',
      lastUpdatedAt: null,
    });
  const [manualDescription, setManualDescription] = useState('');
  const [screenshotName, setScreenshotName] = useState<string | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  const [detection, setDetection] = useState<ToolDetection>({
    toolId: null,
    toolName: '알 수 없음',
    confidence: 0,
    evidence: [],
  });
  const [redactedPreview, setRedactedPreview] = useState<ScreenContext | null>(null);
  const [findings, setFindings] = useState<RedactionFinding[]>([]);
  const [serverLLM, setServerLLM] = useState<string>('확인 중…');

  const sttRef = useRef<WebSpeechSTTProvider | null>(null);
  const lastResponseRef = useRef<GuideResponse | null>(null);
  const pendingExtensionRequestsRef = useRef(
    new Map<string, (context: ExtensionPageContext | null) => void>(),
  );
  const extensionRequestTimeoutsRef = useRef(new Map<string, number>());

  /* --------------------------- Context assembly -------------------------- */

  const buildRawContext = useCallback((overrideExtensionContext?: ExtensionPageContext | null): ScreenContext | null => {
    if (!contextSharingOn) return null;
    const activeExtensionContext =
      overrideExtensionContext === undefined ? extensionContext : overrideExtensionContext;
    const hasAnything =
      activeExtensionContext || manualDescription.trim() || screenshotName;
    if (!hasAnything) return null;
    return {
      source: activeExtensionContext ? 'browser-extension' : screenshotName ? 'screenshot' : 'manual',
      capturedAt: new Date().toISOString(),
      browser: activeExtensionContext
        ? {
            url: activeExtensionContext.url,
            title: activeExtensionContext.title,
            domSummary: activeExtensionContext.domSummary,
          }
        : undefined,
      activeWindowTitle: manualDescription.trim() || undefined,
      screenshotProvided: Boolean(screenshotName),
      screenshotDescription: screenshotName
        ? `사용자가 업로드한 스크린샷: ${screenshotName}`
        : undefined,
    };
  }, [contextSharingOn, extensionContext, manualDescription, screenshotName]);

  // Keep the "what the AI sees" preview in sync with the context sources.
  useEffect(() => {
    const raw = buildRawContext();
    const result = orchestrator.ingestContext(
      raw,
      autoDetect ? undefined : selectedToolId || undefined,
    );
    setRedactedPreview(result.context);
    setFindings(result.findings);
    setDetection(result.detection);
  }, [buildRawContext, orchestrator, autoDetect, selectedToolId]);

  /* --------------------------- Extension bridge -------------------------- */

  const resolveExtensionRequest = useCallback(
    (requestId: string, context: ExtensionPageContext | null): void => {
      const resolve = pendingExtensionRequestsRef.current.get(requestId);
      if (!resolve) return;
      pendingExtensionRequestsRef.current.delete(requestId);
      const timeout = extensionRequestTimeoutsRef.current.get(requestId);
      if (timeout !== undefined) window.clearTimeout(timeout);
      extensionRequestTimeoutsRef.current.delete(requestId);
      resolve(context);
    },
    [],
  );

  const requestExtensionContext = useCallback(
    (
      type: 'voiceguide:request-extension-context' | 'voiceguide:refresh-target-context',
      silent = false,
    ): Promise<ExtensionPageContext | null> => {
      const requestId = `vg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (!silent) {
        setExtensionBridgeStatus((prev) => ({
          ...prev,
          refreshing: true,
          message: type === 'voiceguide:refresh-target-context'
            ? '연결된 Chrome 탭을 다시 읽는 중'
            : 'Chrome 탭 컨텍스트를 불러오는 중',
        }));
      }
      return new Promise((resolve) => {
        pendingExtensionRequestsRef.current.set(requestId, resolve);
        const timeout = window.setTimeout(() => {
          resolveExtensionRequest(requestId, null);
          if (!silent) {
            setExtensionBridgeStatus((prev) => ({
              ...prev,
              refreshing: false,
              message: '확장 응답이 없습니다. 대상 사이트에서 VoiceGuide 확장 아이콘으로 탭을 연결하세요.',
            }));
          }
        }, 1500);
        extensionRequestTimeoutsRef.current.set(requestId, timeout);
        window.postMessage({ type, requestId }, window.location.origin);
      });
    },
    [resolveExtensionRequest],
  );

  const loadStoredExtensionContext = useCallback(
    (silent = false): Promise<ExtensionPageContext | null> =>
      requestExtensionContext('voiceguide:request-extension-context', silent),
    [requestExtensionContext],
  );

  const refreshActiveTabContext = useCallback(
    (silent = false): Promise<ExtensionPageContext | null> =>
      requestExtensionContext('voiceguide:refresh-target-context', silent),
    [requestExtensionContext],
  );

  useEffect(() => {
    const listener = (event: MessageEvent): void => {
      if (event.source !== window) return;
      const data = event.data as
        | { type?: string; payload?: unknown; requestId?: unknown; ok?: unknown; message?: unknown }
        | undefined;
      const requestId =
        typeof data?.requestId === 'string' ? data.requestId : undefined;
      if (
        data?.type === 'voiceguide:context' &&
        isExtensionPageContext(data.payload)
      ) {
        setExtensionContext(data.payload);
        setExtensionBridgeStatus({
          connected: true,
          refreshing: false,
          message: 'Chrome 탭 연결됨',
          lastUpdatedAt: data.payload.capturedAt,
        });
        if (requestId) resolveExtensionRequest(requestId, data.payload);
      }
      if (data?.type === 'voiceguide:extension-status') {
        const ok = data.ok === true;
        const message =
          typeof data.message === 'string'
            ? data.message
            : ok
              ? 'Chrome 확장 상태가 갱신되었습니다.'
              : 'Chrome 확장 요청에 실패했습니다.';
        setExtensionBridgeStatus((prev) => ({
          ...prev,
          connected: ok ? prev.connected : false,
          refreshing: false,
          message,
        }));
        if (!ok && requestId) resolveExtensionRequest(requestId, null);
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [resolveExtensionRequest]);

  useEffect(() => {
    void loadStoredExtensionContext(true);
    return () => {
      for (const timeout of extensionRequestTimeoutsRef.current.values()) {
        window.clearTimeout(timeout);
      }
      extensionRequestTimeoutsRef.current.clear();
      pendingExtensionRequestsRef.current.clear();
    };
  }, [loadStoredExtensionContext]);

  /* ------------------------------ Server ping ---------------------------- */

  useEffect(() => {
    fetch('/api/health')
      .then(async (r) => {
        const body = (await r.json()) as { llmProvider?: string };
        setServerLLM(body.llmProvider ?? 'mock');
      })
      .catch(() => setServerLLM('오프라인 (로컬 Mock 사용)'));
  }, []);

  /* ------------------------------ Ask flow ------------------------------- */

  const ask = useCallback(
    async (utterance: string): Promise<void> => {
      const text = utterance.trim();
      if (!text || busy) return;
      setError(null);
      setBusy(true);
      setMessages((prev) => [
        ...prev,
        { id: ++messageId, role: 'user', text },
      ]);
      try {
        let latestExtensionContext = extensionContext;
        if (contextSharingOn) {
          const refreshed = extensionContext
            ? await refreshActiveTabContext(true)
            : await loadStoredExtensionContext(true);
          if (refreshed) latestExtensionContext = refreshed;
        }
        const response = await orchestrator.handleUtterance(
          text,
          buildRawContext(latestExtensionContext),
          {
            userSelectedToolId: autoDetect ? undefined : selectedToolId || undefined,
            mode,
          },
        );
        lastResponseRef.current = response;
        const snapshot = orchestrator.getSnapshot();
        setDetection(snapshot.detection);
        setRedactedPreview(snapshot.redactedContext);
        setFindings(snapshot.redactionFindings);
        setMessages((prev) => [
          ...prev,
          { id: ++messageId, role: 'guide', text: response.message, response },
        ]);
        if (voiceOutputOn) {
          // Speak without blocking: the user can keep interacting (and can
          // interrupt playback) while TTS runs.
          setIsSpeaking(true);
          void tts
            .speak(response.message, { rate: voiceRate })
            .finally(() => setIsSpeaking(false));
        }
      } catch (err) {
        setError(
          `응답 생성에 실패했습니다: ${(err as Error).message}. 네트워크 상태를 확인해주세요.`,
        );
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      orchestrator,
      extensionContext,
      contextSharingOn,
      refreshActiveTabContext,
      loadStoredExtensionContext,
      buildRawContext,
      autoDetect,
      selectedToolId,
      mode,
      tts,
      voiceRate,
      voiceOutputOn,
    ],
  );

  /* ------------------------------ Microphone ----------------------------- */

  const stopMic = useCallback((): void => {
    sttRef.current?.stop();
    sttRef.current = null;
    setMicOn(false);
    setInterimText('');
  }, []);

  const startMic = useCallback((): void => {
    if (!WebSpeechSTTProvider.isSupported()) {
      setError('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome/Edge를 사용하거나 텍스트로 입력해주세요.');
      return;
    }
    stopMic();
    const stt = new WebSpeechSTTProvider('ko-KR', handsFree);
    sttRef.current = stt;
    setMicOn(true);
    stt.start(
      (result) => {
        if (result.isFinal) {
          setInterimText('');
          if (!handsFree) stopMic();
          void ask(result.transcript);
        } else {
          setInterimText(result.transcript);
        }
      },
      (err) => {
        setError(err.message);
        stopMic();
      },
    );
  }, [handsFree, stopMic, ask]);

  useEffect(() => () => stopMic(), [stopMic]);

  /* --------------------------------- TTS --------------------------------- */

  const stopSpeaking = useCallback((): void => {
    tts.stop();
    setIsSpeaking(false);
  }, [tts]);

  const replayLast = useCallback(async (): Promise<void> => {
    const last = lastResponseRef.current;
    if (!last) return;
    setIsSpeaking(true);
    await tts.speak(last.message, { rate: voiceRate });
    setIsSpeaking(false);
  }, [tts, voiceRate]);

  /* ----------------------------- Screen share ---------------------------- */

  const captureScreen = useCallback(async (): Promise<void> => {
    try {
      // Explicit user consent: the browser picker IS the consent dialog.
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setScreenShareOn(true);
      const track = stream.getVideoTracks()[0];
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      // Keep one frame on-device for the user's own preview; stop sharing
      // immediately after so nothing keeps recording.
      setScreenshotPreview(canvas.toDataURL('image/png'));
      setScreenshotName(`화면 캡처 ${new Date().toLocaleTimeString('ko-KR')}`);
      track?.stop();
      stream.getTracks().forEach((t) => t.stop());
      setScreenShareOn(false);
    } catch {
      setScreenShareOn(false);
      // User cancelled the picker — that is consent denied, not an error.
    }
  }, []);

  const stopScreenShare = useCallback((): void => {
    setScreenShareOn(false);
    setScreenshotName(null);
    setScreenshotPreview(null);
  }, []);

  const uploadScreenshot = useCallback((file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshotPreview(reader.result as string);
      setScreenshotName(file.name);
    };
    reader.readAsDataURL(file);
  }, []);

  /* ------------------------------- Clearing ------------------------------ */

  const clearHistory = useCallback((): void => {
    orchestrator.clearHistory();
    setMessages([]);
    lastResponseRef.current = null;
  }, [orchestrator]);

  const clearContext = useCallback((): void => {
    orchestrator.clearContext();
    setExtensionContext(null);
    setManualDescription('');
    setScreenshotName(null);
    setScreenshotPreview(null);
    setRedactedPreview(null);
    setFindings([]);
    setExtensionBridgeStatus({
      connected: false,
      refreshing: false,
      message: 'Chrome 탭 연결 대기 중',
      lastUpdatedAt: null,
    });
    window.postMessage({ type: 'voiceguide:clear-context' }, window.location.origin);
  }, [orchestrator]);

  return {
    // conversation
    messages,
    busy,
    error,
    ask,
    clearHistory,
    // mic
    micOn,
    handsFree,
    setHandsFree,
    startMic,
    stopMic,
    interimText,
    // tts
    isSpeaking,
    stopSpeaking,
    replayLast,
    voiceRate,
    setVoiceRate,
    voiceOutputOn,
    setVoiceOutputOn,
    // context & privacy
    contextSharingOn,
    setContextSharingOn,
    screenShareOn,
    captureScreen,
    stopScreenShare,
    uploadScreenshot,
    screenshotName,
    screenshotPreview,
    manualDescription,
    setManualDescription,
    extensionContext,
    extensionBridgeStatus,
    refreshActiveTabContext,
    loadStoredExtensionContext,
    clearContext,
    redactedPreview,
    findings,
    // detection & mode
    detection,
    autoDetect,
    setAutoDetect,
    selectedToolId,
    setSelectedToolId,
    mode,
    setMode,
    packs: builtinPacks,
    serverLLM,
    snapshot: orchestrator.getSnapshot(),
  };
}
