import type {
  ConversationTurn,
  GuideMode,
  GuidePack,
  GuideResponse,
  Intent,
  ScreenContext,
  ToolDetection,
} from './types.js';
import { planGenericStep, renderStepMessage } from './stepPlanner.js';

/* --------------------------------- LLM --------------------------------- */

/** Everything a language model needs to produce a guide answer.
 *  Context must already be redacted before it reaches a provider. */
export interface GuideLLMRequest {
  utterance: string;
  intent: Intent;
  mode: GuideMode;
  goal: string;
  redactedContext: ScreenContext | null;
  detection: ToolDetection;
  pack: GuidePack | null;
  history: ConversationTurn[];
  /** How many generic steps were already given in this session. */
  genericStepIndex: number;
  simplify: boolean;
}

export interface LLMProvider {
  readonly name: string;
  generateGuide(request: GuideLLMRequest): Promise<GuideResponse>;
}

/**
 * Deterministic, fully offline provider. Produces honest generic guidance
 * from the redacted DOM summary only — it never invents UI elements that
 * were not observed.
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';

  generateGuide(request: GuideLLMRequest): Promise<GuideResponse> {
    const { step, confidence, evidence, askedForClarification } =
      planGenericStep(request);
    const message = renderStepMessage(step, request.simplify);
    return Promise.resolve({
      mode: request.mode,
      usedGuidePack: null,
      step,
      message,
      simplified: request.simplify || undefined,
      confidence,
      evidence,
      needsUserConfirmation: true,
      askedForClarification,
    });
  }
}

/* --------------------------------- STT --------------------------------- */

export interface STTResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

export interface STTProvider {
  readonly name: string;
  start(onResult: (result: STTResult) => void, onError: (err: Error) => void): void;
  stop(): void;
  readonly isListening: boolean;
}

/** Test/no-hardware STT: the caller feeds transcripts programmatically. */
export class MockSTTProvider implements STTProvider {
  readonly name = 'mock';
  private listening = false;
  private onResult: ((r: STTResult) => void) | null = null;

  get isListening(): boolean {
    return this.listening;
  }

  start(onResult: (result: STTResult) => void): void {
    this.listening = true;
    this.onResult = onResult;
  }

  stop(): void {
    this.listening = false;
    this.onResult = null;
  }

  /** Simulates a recognized utterance (used by tests and mock mode UI). */
  feed(transcript: string): void {
    this.onResult?.({ transcript, confidence: 1, isFinal: true });
  }
}

/* --------------------------------- TTS --------------------------------- */

export interface TTSOptions {
  rate?: number;
  lang?: string;
}

export interface TTSProvider {
  readonly name: string;
  speak(text: string, options?: TTSOptions): Promise<void>;
  /** Must take effect immediately — the user can always interrupt playback. */
  stop(): void;
  readonly isSpeaking: boolean;
}

/** Test/silent TTS: records what would have been spoken. */
export class MockTTSProvider implements TTSProvider {
  readonly name = 'mock';
  spoken: string[] = [];
  private speaking = false;

  get isSpeaking(): boolean {
    return this.speaking;
  }

  speak(text: string): Promise<void> {
    this.speaking = true;
    this.spoken.push(text);
    this.speaking = false;
    return Promise.resolve();
  }

  stop(): void {
    this.speaking = false;
  }
}
