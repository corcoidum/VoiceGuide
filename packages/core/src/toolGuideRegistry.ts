import type { GuidePack } from './types.js';

export interface GuidePackValidationIssue {
  toolId: string;
  field: string;
  problem: string;
}

/** Structural validation so a broken pack fails loudly at load time. */
export function validateGuidePack(pack: GuidePack): GuidePackValidationIssue[] {
  const issues: GuidePackValidationIssue[] = [];
  const id = pack.toolId || '(missing toolId)';
  const push = (field: string, problem: string): void => {
    issues.push({ toolId: id, field, problem });
  };

  if (!pack.toolId) push('toolId', 'toolId is required');
  if (!pack.toolName) push('toolName', 'toolName is required');
  if (!pack.version) push('version', 'version is required');
  if (!Array.isArray(pack.supportedDomains))
    push('supportedDomains', 'must be an array');
  if (!Array.isArray(pack.commonTasks) || pack.commonTasks.length === 0)
    push('commonTasks', 'must contain at least one task');

  for (const task of pack.commonTasks ?? []) {
    if (!task.taskId) push('commonTasks', 'task without taskId');
    if (!task.keywords || task.keywords.length === 0)
      push('commonTasks', `task ${task.taskId}: needs at least one keyword`);
    if (!task.steps || task.steps.length === 0)
      push('commonTasks', `task ${task.taskId}: needs at least one step`);
    for (const step of task.steps ?? []) {
      for (const field of [
        'id',
        'instruction',
        'uiHint',
        'successCheck',
        'fallback',
      ] as const) {
        if (!step[field])
          push('commonTasks', `task ${task.taskId} step: missing ${field}`);
      }
    }
  }
  return issues;
}

/**
 * Plugin registry: packs can be added at runtime without touching the rest
 * of the codebase. Invalid packs are rejected with actionable errors.
 */
export class ToolGuideRegistry {
  private readonly packs = new Map<string, GuidePack>();

  register(pack: GuidePack): void {
    const issues = validateGuidePack(pack);
    if (issues.length > 0) {
      const detail = issues.map((i) => `${i.field}: ${i.problem}`).join('; ');
      throw new Error(`Invalid Guide Pack "${pack.toolId}": ${detail}`);
    }
    this.packs.set(pack.toolId, pack);
  }

  get(toolId: string | null): GuidePack | null {
    if (!toolId) return null;
    return this.packs.get(toolId) ?? null;
  }

  list(): GuidePack[] {
    return [...this.packs.values()];
  }
}
