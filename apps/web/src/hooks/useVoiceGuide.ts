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

let messageId = 0;

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

  const [mode, setMode] = useState<GuideMode>('ask');
  const [selectedToolId, setSelectedToolId] = useState<string>('');

  const [extensionContext, setExtensionContext] =
    useState<ExtensionPageContext | null>(null);
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

  /* --------------------------- Context assembly -------------------------- */

  const buildRawContext = useCallback((): ScreenContext | null => {
    if (!contextSharingOn) return null;
    const hasAnything =
      extensionContext || manualDescription.trim() || screenshotName;
    if (!hasAnything) return null;
    return {
      source: extensionContext ? 'browser-extension' : screenshotName ? 'screenshot' : 'manual',
      capturedAt: new Date().toISOString(),
      browser: extensionContext
        ? {
            url: extensionContext.url,
            title: extensionContext.title,
            domSummary: extensionContext.domSummary,
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

  useEffect(() => {
    const listener = (event: MessageEvent): void => {
      const data = event.data as
        | { type?: string; payload?: ExtensionPageContext }
        | undefined;
      if (data?.type === 'voiceguide:context' && data.payload) {
        setExtensionContext(data.payload);
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

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
        const response = await orchestrator.handleUtterance(
          text,
          buildRawContext(),
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
    [busy, orchestrator, buildRawContext, autoDetect, selectedToolId, mode, tts, voiceRate, voiceOutputOn],
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
