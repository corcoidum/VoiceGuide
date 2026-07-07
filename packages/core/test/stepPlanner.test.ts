import { describe, expect, it } from 'vitest';
import { matchTask, buildPackStep, planGenericStep } from '../src/stepPlanner.js';
import { githubPack } from '../src/packs/github.js';
import type { GuideLLMRequest } from '../src/providers.js';
import type { ScreenContext } from '../src/types.js';

function genericRequest(context: ScreenContext | null, goal: string): GuideLLMRequest {
  return {
    utterance: goal,
    intent: 'ask_how',
    mode: 'ask',
    goal,
    redactedContext: context,
    detection: { toolId: null, toolName: 'x', confidence: 0.3, evidence: [] },
    pack: null,
    history: [],
    genericStepIndex: 0,
    simplify: false,
  };
}

describe('matchTask', () => {
  it('matches a task by Korean keyword', () => {
    const task = matchTask(githubPack, '새 저장소를 만들고 싶어');
    expect(task?.taskId).toBe('create-repo');
  });

  it('matches a task by English keyword', () => {
    const task = matchTask(githubPack, 'how do I fork this?');
    expect(task?.taskId).toBe('fork-repo');
  });

  it('returns null when nothing matches', () => {
    expect(matchTask(githubPack, '오늘 날씨 어때')).toBeNull();
  });
});

describe('buildPackStep', () => {
  it('builds one step at a time with all required fields', () => {
    const task = githubPack.commonTasks[0]!;
    const step = buildPackStep(githubPack, task, 0, null);
    expect(step).not.toBeNull();
    expect(step!.action.length).toBeGreaterThan(0);
    expect(step!.uiHint.length).toBeGreaterThan(0);
    expect(step!.successCheck.length).toBeGreaterThan(0);
    expect(step!.fallback.length).toBeGreaterThan(0);
    expect(step!.confirmQuestion).toContain('완료');
  });

  it('returns null past the last step (task finished)', () => {
    const task = githubPack.commonTasks[0]!;
    expect(buildPackStep(githubPack, task, task.steps.length, null)).toBeNull();
  });
});

describe('planGenericStep (Generic Guide Mode)', () => {
  const domContext: ScreenContext = {
    source: 'browser-extension',
    capturedAt: new Date().toISOString(),
    browser: {
      url: 'https://app.example.com',
      title: 'Example App',
      domSummary: {
        headings: ['프로젝트'],
        buttons: ['New Project', '설정'],
        links: ['도움말'],
        inputs: [],
        landmarks: ['nav', 'main'],
      },
    },
  };

  it('recommends an element actually observed in the DOM', () => {
    const r = planGenericStep(genericRequest(domContext, '새 project 만들려면?'));
    expect(r.step.action).toContain('New Project');
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
    expect(r.askedForClarification).toBe(false);
    expect(r.evidence.join(' ')).toContain('직접 확인');
  });

  it('never invents a button — asks the user when the DOM has no match', () => {
    const r = planGenericStep(genericRequest(domContext, '결제 수단을 바꾸고 싶어'));
    expect(r.askedForClarification).toBe(true);
    expect(r.confidence).toBeLessThan(0.5);
    // The action must only reference elements that exist in the DOM summary.
    expect(r.step.situation).toContain('확인하지 못했습니다');
  });

  it('asks for context sharing when no screen info exists', () => {
    const r = planGenericStep(genericRequest(null, '다음에 뭘 눌러야 해?'));
    expect(r.askedForClarification).toBe(true);
    expect(r.confidence).toBeLessThanOrEqual(0.2);
    expect(r.step.action).toContain('공유');
  });
});
