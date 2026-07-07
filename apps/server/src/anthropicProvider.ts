import type {
  GuideLLMRequest,
  GuideResponse,
  LLMProvider,
} from '@voiceguide/core';
import { MockLLMProvider } from '@voiceguide/core';

const SYSTEM_PROMPT = `You are VoiceGuide, a voice assistant that teaches people how to use unfamiliar software, one step at a time, in Korean.

Hard rules:
- Give exactly ONE actionable next step per answer.
- NEVER mention a button, menu, or UI element unless it appears in the provided screen context. If the context has no matching element, say you could not verify it and ask the user what they see.
- Use beginner-friendly language.
- Warn before any destructive or hard-to-undo action; never tell the user you will perform actions yourself.
- The context you receive is already redacted; never ask for passwords, verification codes, or payment data.

Respond ONLY with JSON matching:
{"situation": string, "action": string, "uiHint": string, "successCheck": string, "fallback": string, "confirmQuestion": string, "confidence": number, "evidence": string[]}`;

/**
 * Real LLM provider. Lives server-side only so the API key never reaches
 * client code. Falls back to the mock provider on any failure so the app
 * keeps working.
 */
export class AnthropicLLMProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly fallback = new MockLLMProvider();

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generateGuide(request: GuideLLMRequest): Promise<GuideResponse> {
    try {
      const userContent = JSON.stringify({
        utterance: request.utterance,
        goal: request.goal,
        intent: request.intent,
        mode: request.mode,
        detection: request.detection,
        screenContext: request.redactedContext,
        recentHistory: request.history.slice(-6),
        simplify: request.simplify,
      });

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic API ${res.status}`);

      const data = (await res.json()) as {
        content: { type: string; text?: string }[];
      };
      const text = data.content.find((c) => c.type === 'text')?.text ?? '';
      const parsed = JSON.parse(text) as {
        situation: string;
        action: string;
        uiHint: string;
        successCheck: string;
        fallback: string;
        confirmQuestion: string;
        confidence: number;
        evidence: string[];
      };

      const step = {
        situation: parsed.situation,
        action: parsed.action,
        uiHint: parsed.uiHint,
        successCheck: parsed.successCheck,
        fallback: parsed.fallback,
        confirmQuestion: parsed.confirmQuestion,
      };
      return {
        mode: request.mode,
        usedGuidePack: null,
        step,
        message: [
          step.situation,
          step.action,
          `화면에서 찾을 것: ${step.uiHint}`,
          `성공하면: ${step.successCheck}`,
          `잘 안 되면: ${step.fallback}`,
          step.confirmQuestion,
        ].join('\n'),
        confidence: Math.max(0, Math.min(1, parsed.confidence)),
        evidence: parsed.evidence ?? [],
        needsUserConfirmation: true,
      };
    } catch (err) {
      console.warn('[voiceguide] anthropic provider failed, using mock:', err);
      return this.fallback.generateGuide(request);
    }
  }
}
