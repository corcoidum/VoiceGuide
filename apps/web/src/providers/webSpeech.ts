import type { STTProvider, STTResult, TTSOptions, TTSProvider } from '@voiceguide/core';

/**
 * Browser STT via the Web Speech API. Free, no API key. The microphone is
 * only opened while `start()` is active and the UI always shows the state.
 */
export class WebSpeechSTTProvider implements STTProvider {
  readonly name = 'web-speech';
  private recognition: SpeechRecognitionLike | null = null;
  private listening = false;

  static isSupported(): boolean {
    return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  }

  get isListening(): boolean {
    return this.listening;
  }

  constructor(
    private readonly lang: string = 'ko-KR',
    private readonly continuous: boolean = false,
  ) {}

  start(onResult: (r: STTResult) => void, onError: (err: Error) => void): void {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      onError(new Error('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge를 사용해주세요.'));
      return;
    }
    this.stop();
    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = this.continuous;
    rec.interimResults = true;
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        onResult({
          transcript: result[0].transcript,
          confidence: result[0].confidence,
          isFinal: result.isFinal,
        });
      }
    };
    rec.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      onError(new Error(`음성 인식 오류: ${event.error}`));
    };
    rec.onend = () => {
      if (this.continuous && this.listening) {
        // Hands-free mode: keep listening until the user turns it off.
        try {
          rec.start();
        } catch {
          this.listening = false;
        }
      } else {
        this.listening = false;
      }
    };
    this.recognition = rec;
    this.listening = true;
    rec.start();
  }

  stop(): void {
    this.listening = false;
    if (this.recognition) {
      this.recognition.onend = null;
      try {
        this.recognition.stop();
      } catch {
        /* already stopped */
      }
      this.recognition = null;
    }
  }
}

/** Browser TTS via speechSynthesis. Stop is always immediate. */
export class WebSpeechTTSProvider implements TTSProvider {
  readonly name = 'web-speech';
  private speaking = false;

  get isSpeaking(): boolean {
    return this.speaking;
  }

  speak(text: string, options?: TTSOptions): Promise<void> {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = options?.lang ?? 'ko-KR';
      utterance.rate = options?.rate ?? 1;
      utterance.onend = () => {
        this.speaking = false;
        resolve();
      };
      utterance.onerror = () => {
        this.speaking = false;
        resolve();
      };
      this.speaking = true;
      window.speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    this.speaking = false;
    window.speechSynthesis.cancel();
  }
}
