import { describe, expect, it } from 'vitest';
import {
  InMemoryProgressStorage,
  LearningProgressTracker,
} from '../src/learningProgressTracker.js';

describe('LearningProgressTracker', () => {
  it('records completed steps and exposes a resume point', () => {
    const t = new LearningProgressTracker(new InMemoryProgressStorage());
    t.recordStepCompleted('github', 'create-repo', 'repo-1', 0);
    t.recordStepCompleted('github', 'create-repo', 'repo-2', 1);
    expect(t.getProgress('github')?.completedStepIds).toEqual(['repo-1', 'repo-2']);
    expect(t.getResumePoint('github')).toEqual({ taskId: 'create-repo', stepIndex: 1 });
  });

  it('clears the resume point when the task completes and raises skill level over time', () => {
    const t = new LearningProgressTracker(new InMemoryProgressStorage());
    t.recordStepCompleted('github', 'create-repo', 'repo-1', 0);
    t.recordTaskCompleted('github', 'create-repo');
    expect(t.getResumePoint('github')).toBeNull();
    expect(t.getProgress('github')?.skillLevel).toBe('beginner');
    t.recordTaskCompleted('github', 'create-issue');
    t.recordTaskCompleted('github', 'fork-repo');
    expect(t.getProgress('github')?.skillLevel).toBe('intermediate');
  });

  it('collects review candidates from repeatedly stuck steps', () => {
    const t = new LearningProgressTracker(new InMemoryProgressStorage());
    t.recordStuck('github', 'repo-3');
    t.recordStuck('github', 'repo-3');
    expect(t.getReviewCandidates('github')).toEqual([]);
    t.recordStuck('github', 'repo-3');
    expect(t.getReviewCandidates('github')).toEqual(['repo-3']);
  });

  it('supports user data deletion per tool and entirely', () => {
    const t = new LearningProgressTracker(new InMemoryProgressStorage());
    t.recordStuck('github', 's');
    t.recordStuck('chatgpt', 's');
    t.clear('github');
    expect(t.getProgress('github')).toBeNull();
    expect(t.getProgress('chatgpt')).not.toBeNull();
    t.clear();
    expect(t.getProgress('chatgpt')).toBeNull();
  });
});
