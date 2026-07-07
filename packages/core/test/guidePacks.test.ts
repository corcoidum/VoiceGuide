import { describe, expect, it } from 'vitest';
import { builtinPacks } from '../src/packs/index.js';
import {
  ToolGuideRegistry,
  validateGuidePack,
} from '../src/toolGuideRegistry.js';
import type { GuidePack } from '../src/types.js';

describe('Guide Pack validation', () => {
  it('ships at least 3 valid built-in packs', () => {
    expect(builtinPacks.length).toBeGreaterThanOrEqual(3);
    for (const pack of builtinPacks) {
      expect(validateGuidePack(pack), pack.toolId).toHaveLength(0);
    }
  });

  it('every built-in pack has domains, version, and safety warnings defined', () => {
    for (const pack of builtinPacks) {
      expect(pack.supportedDomains.length).toBeGreaterThan(0);
      expect(pack.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(Array.isArray(pack.safetyWarnings)).toBe(true);
      expect(pack.docSources.length).toBeGreaterThan(0);
    }
  });

  it('rejects a structurally broken pack at registration', () => {
    const broken = {
      toolId: 'broken',
      toolName: '',
      description: '',
      supportedDomains: [],
      supportedPlatforms: [],
      uiHints: {},
      commonTasks: [],
      troubleshooting: [],
      docSources: [],
      safetyWarnings: [],
      version: '',
    } as GuidePack;
    const registry = new ToolGuideRegistry();
    expect(() => registry.register(broken)).toThrow(/Invalid Guide Pack/);
  });

  it('registry registers and lists packs as plugins', () => {
    const registry = new ToolGuideRegistry();
    for (const pack of builtinPacks) registry.register(pack);
    expect(registry.list()).toHaveLength(builtinPacks.length);
    expect(registry.get('github')?.toolName).toBe('GitHub');
    expect(registry.get('nonexistent')).toBeNull();
    expect(registry.get(null)).toBeNull();
  });
});
