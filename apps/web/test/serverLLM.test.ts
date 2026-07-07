import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerLLMProvider } from '../src/providers/serverLLM';
import type { GuideLLMRequest } from '@voiceguide/core';

function request(): GuideLLMRequest {
  return {
    utterance: '다음에 뭘 눌러야 해?',
    intent: 'ask_how',
    mode: 'ask',
    goal: '다음에 뭘 눌러야 해?',
    redactedContext: null,
    detection: { toolId: null, toolName: 'x', confidence: 0, evidence: [] },
    pack: null,
    history: [],
    genericStepIndex: 0,
    simplify: false,
  };
}

describe('ServerLLMProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('falls back to the local mock when the server is unreachable (Mock Mode)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const provider = new ServerLLMProvider();
    const res = await provider.generateGuide(request());
    expect(res.message.length).toBeGreaterThan(0);
    expect(res.askedForClarification).toBe(true); // no context → asks, no guessing
  });

  it('uses the server response when available', async () => {
    const fake = {
      mode: 'ask',
      usedGuidePack: null,
      message: '서버 응답',
      confidence: 0.5,
      evidence: [],
      needsUserConfirmation: true,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(fake) }),
    );
    const provider = new ServerLLMProvider();
    const res = await provider.generateGuide(request());
    expect(res.message).toBe('서버 응답');
  });
});
