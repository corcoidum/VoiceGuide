import type { GuideLLMRequest, GuideResponse, LLMProvider } from '@voiceguide/core';
import { MockLLMProvider } from '@voiceguide/core';

/**
 * Sends generic-mode requests to the local VoiceGuide server (which holds
 * any real API keys). Falls back to the in-browser mock provider whenever
 * the server is unreachable, so Mock Mode always works offline.
 */
export class ServerLLMProvider implements LLMProvider {
  readonly name = 'server';
  private readonly fallback = new MockLLMProvider();
  private serverHealthy: boolean | null = null;
  private lastFailureAt = 0;
  private readonly retryAfterMs = 5000;

  async generateGuide(request: GuideLLMRequest): Promise<GuideResponse> {
    if (
      this.serverHealthy === false &&
      Date.now() - this.lastFailureAt < this.retryAfterMs
    ) {
      return this.fallback.generateGuide(request);
    }
    try {
      const res = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) throw new Error(`server ${res.status}`);
      this.serverHealthy = true;
      return (await res.json()) as GuideResponse;
    } catch {
      this.serverHealthy = false;
      this.lastFailureAt = Date.now();
      return this.fallback.generateGuide(request);
    }
  }
}
