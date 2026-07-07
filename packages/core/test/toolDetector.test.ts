import { describe, expect, it } from 'vitest';
import { ToolDetector } from '../src/toolDetector.js';
import { builtinPacks } from '../src/packs/index.js';
import type { ScreenContext } from '../src/types.js';

const detector = new ToolDetector(builtinPacks);

function ctx(partial: Partial<ScreenContext>): ScreenContext {
  return { source: 'browser-extension', capturedAt: new Date().toISOString(), ...partial };
}

describe('ToolDetector', () => {
  it('user selection wins with confidence 1', () => {
    const d = detector.detect(null, 'github');
    expect(d.toolId).toBe('github');
    expect(d.confidence).toBe(1);
    expect(d.evidence.length).toBeGreaterThan(0);
  });

  it('detects a tool from its domain with high confidence', () => {
    const d = detector.detect(
      ctx({ browser: { url: 'https://github.com/user/repo', title: 'repo' } }),
    );
    expect(d.toolId).toBe('github');
    expect(d.confidence).toBe(0.9);
    expect(d.evidence[0]).toContain('github.com');
  });

  it('detects subdomains of a supported domain', () => {
    const d = detector.detect(
      ctx({ browser: { url: 'https://gist.github.com/x', title: '' } }),
    );
    expect(d.toolId).toBe('github');
  });

  it('falls back to title keyword match with lower confidence', () => {
    const d = detector.detect(ctx({ activeWindowTitle: 'ChatGPT - Chrome' }));
    expect(d.toolId).toBe('chatgpt');
    expect(d.confidence).toBe(0.6);
  });

  it('unknown site → generic mode with evidence, not a guess', () => {
    const d = detector.detect(
      ctx({ browser: { url: 'https://unknown-tool.example', title: 'Unknown Tool' } }),
    );
    expect(d.toolId).toBeNull();
    expect(d.confidence).toBeLessThanOrEqual(0.3);
    expect(d.evidence.join(' ')).toContain('Generic Guide Mode');
  });

  it('no context at all → confidence 0', () => {
    const d = detector.detect(null);
    expect(d.toolId).toBeNull();
    expect(d.confidence).toBe(0);
  });
});
