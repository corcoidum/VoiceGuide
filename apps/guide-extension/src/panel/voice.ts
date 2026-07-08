/* 음성 입출력 — 푸시투토크 STT(Web Speech) + 중단 가능한 TTS(chrome.tts).
 * 게이팅 원칙: 마이크를 켜는 순간 TTS를 즉시 멈춘다 (피드백 루프 방지). */

/* ---------- Web Speech API 최소 타입 선언 (lib.dom에 없음) ---------- */
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
}
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResult };
}
interface SpeechRecognitionErrorEvent {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed':
    '마이크 권한이 거부되었습니다. 주소창의 사이트 설정에서 마이크를 허용해주세요.',
  'no-speech': '음성이 감지되지 않았습니다. 다시 시도해주세요.',
  'audio-capture': '마이크를 찾을 수 없습니다. 연결 상태를 확인해주세요.',
  network: '음성 인식 네트워크 오류입니다. 인터넷 연결을 확인해주세요.',
  aborted: '',
};

export class PushToTalk {
  private rec: SpeechRecognitionLike | null = null;
  listening = false;

  static isSupported(): boolean {
    return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  }

  start(
    onInterim: (text: string) => void,
    onFinal: (text: string) => void,
    onError: (message: string) => void,
    onEnd: () => void,
  ): void {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      onError('이 브라우저는 음성 인식을 지원하지 않습니다. 텍스트로 입력해주세요.');
      return;
    }
    this.stop();
    const rec = new Ctor();
    rec.lang = 'ko-KR';
    rec.continuous = false; // 푸시투토크: 한 발화만
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) onInterim(interim);
      if (final.trim()) onFinal(final.trim());
    };
    rec.onerror = (e) => {
      const msg = ERROR_MESSAGES[e.error];
      if (msg !== '') onError(msg ?? `음성 인식 오류: ${e.error}`);
    };
    rec.onend = () => {
      this.listening = false;
      this.rec = null;
      onEnd();
    };
    this.rec = rec;
    this.listening = true;
    rec.start();
  }

  stop(): void {
    this.rec?.stop();
    this.rec = null;
    this.listening = false;
  }
}

export class Speaker {
  speaking = false;
  private onStateChange: (speaking: boolean) => void;

  constructor(onStateChange: (speaking: boolean) => void) {
    this.onStateChange = onStateChange;
  }

  speak(text: string, rate: number): void {
    this.stop();
    this.speaking = true;
    this.onStateChange(true);
    chrome.tts.speak(text, {
      lang: 'ko-KR',
      rate,
      enqueue: false,
      onEvent: (event) => {
        if (['end', 'interrupted', 'cancelled', 'error'].includes(event.type)) {
          this.speaking = false;
          this.onStateChange(false);
        }
      },
    });
  }

  stop(): void {
    chrome.tts.stop();
    if (this.speaking) {
      this.speaking = false;
      this.onStateChange(false);
    }
  }
}

/** 최초 1회 마이크 권한 프롬프트를 띄우기 위한 헬퍼 */
export async function ensureMicPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}
