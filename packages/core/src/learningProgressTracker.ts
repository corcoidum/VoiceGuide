import type {
  ProgressData,
  SkillLevel,
  ToolProgress,
} from './types.js';

/** Storage is injected so web (localStorage), server (file/db) and tests
 *  (in-memory) can all reuse the same tracker logic. */
export interface ProgressStorage {
  load(): ProgressData;
  save(data: ProgressData): void;
}

export class InMemoryProgressStorage implements ProgressStorage {
  private data: ProgressData = { tools: {} };
  load(): ProgressData {
    return this.data;
  }
  save(data: ProgressData): void {
    this.data = data;
  }
}

const STUCK_THRESHOLD = 3;

export class LearningProgressTracker {
  constructor(private readonly storage: ProgressStorage) {}

  private getOrCreate(data: ProgressData, toolId: string): ToolProgress {
    const existing = data.tools[toolId];
    if (existing) return existing;
    const fresh: ToolProgress = {
      toolId,
      completedTaskIds: [],
      completedStepIds: [],
      stuckCounts: {},
      skillLevel: 'beginner',
      updatedAt: new Date().toISOString(),
    };
    data.tools[toolId] = fresh;
    return fresh;
  }

  recordStepCompleted(toolId: string, taskId: string, stepId: string, stepIndex: number): void {
    const data = this.storage.load();
    const p = this.getOrCreate(data, toolId);
    if (!p.completedStepIds.includes(stepId)) p.completedStepIds.push(stepId);
    p.lastTaskId = taskId;
    p.lastStepIndex = stepIndex;
    p.updatedAt = new Date().toISOString();
    this.storage.save(data);
  }

  recordTaskCompleted(toolId: string, taskId: string): void {
    const data = this.storage.load();
    const p = this.getOrCreate(data, toolId);
    if (!p.completedTaskIds.includes(taskId)) p.completedTaskIds.push(taskId);
    p.lastTaskId = undefined;
    p.lastStepIndex = undefined;
    // Simple skill model: finishing tasks raises the explanation level.
    p.skillLevel = this.skillLevelFor(p.completedTaskIds.length);
    p.updatedAt = new Date().toISOString();
    this.storage.save(data);
  }

  recordStuck(toolId: string, stepId: string): void {
    const data = this.storage.load();
    const p = this.getOrCreate(data, toolId);
    p.stuckCounts[stepId] = (p.stuckCounts[stepId] ?? 0) + 1;
    p.updatedAt = new Date().toISOString();
    this.storage.save(data);
  }

  getProgress(toolId: string): ToolProgress | null {
    return this.storage.load().tools[toolId] ?? null;
  }

  /** Steps the user repeatedly got stuck on — candidates for review later. */
  getReviewCandidates(toolId: string): string[] {
    const p = this.getProgress(toolId);
    if (!p) return [];
    return Object.entries(p.stuckCounts)
      .filter(([, count]) => count >= STUCK_THRESHOLD)
      .map(([stepId]) => stepId);
  }

  /** Where to resume: last task/step if a task was left unfinished. */
  getResumePoint(toolId: string): { taskId: string; stepIndex: number } | null {
    const p = this.getProgress(toolId);
    if (!p || !p.lastTaskId || p.lastStepIndex === undefined) return null;
    return { taskId: p.lastTaskId, stepIndex: p.lastStepIndex };
  }

  clear(toolId?: string): void {
    if (!toolId) {
      this.storage.save({ tools: {} });
      return;
    }
    const data = this.storage.load();
    delete data.tools[toolId];
    this.storage.save(data);
  }

  private skillLevelFor(completedTasks: number): SkillLevel {
    if (completedTasks >= 6) return 'advanced';
    if (completedTasks >= 3) return 'intermediate';
    return 'beginner';
  }
}
