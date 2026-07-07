import { beforeEach, describe, expect, it } from 'vitest';
import { GuideOrchestrator } from '../src/guideOrchestrator.js';
import { ToolGuideRegistry } from '../src/toolGuideRegistry.js';
import { MockLLMProvider, MockTTSProvider } from '../src/providers.js';
import {
  InMemoryProgressStorage,
  LearningProgressTracker,
} from '../src/learningProgressTracker.js';
import { builtinPacks } from '../src/packs/index.js';
import type { ScreenContext } from '../src/types.js';

function githubContext(): ScreenContext {
  return {
    source: 'browser-extension',
    capturedAt: new Date().toISOString(),
    browser: {
      url: 'https://github.com',
      title: 'GitHub · Home',
      domSummary: {
        headings: ['Home'],
        buttons: ['New', 'Search'],
        links: ['Pull requests', 'Issues'],
        inputs: ['Search GitHub'],
        landmarks: ['nav', 'main'],
      },
    },
  };
}

describe('End-to-end guide conversation (mock providers, no API keys)', () => {
  let orchestrator: GuideOrchestrator;
  let progress: LearningProgressTracker;

  beforeEach(() => {
    const registry = new ToolGuideRegistry();
    for (const pack of builtinPacks) registry.register(pack);
    progress = new LearningProgressTracker(new InMemoryProgressStorage());
    orchestrator = new GuideOrchestrator({
      registry,
      llm: new MockLLMProvider(),
      progress,
    });
  });

  it('question → pack detection → one step at a time → done branches to next step', async () => {
    const ctx = githubContext();
    const r1 = await orchestrator.handleUtterance(
      '여기서 새 저장소를 만들려면 어떻게 해야 해?',
      ctx,
    );
    expect(r1.usedGuidePack).toBe('github');
    expect(r1.step?.action).toContain('+');
    expect(r1.confidence).toBeGreaterThan(0.5);
    expect(r1.evidence.length).toBeGreaterThan(0);

    // "완료했어" advances exactly one step.
    const r2 = await orchestrator.handleUtterance('완료했어', ctx);
    expect(r2.step?.action).toContain('New repository');
    expect(orchestrator.getSnapshot().stepIndex).toBe(1);
  });

  it('"못 찾겠어" branches to the fallback and records a stuck step', async () => {
    const ctx = githubContext();
    await orchestrator.handleUtterance('새 저장소 만들고 싶어', ctx);
    const r = await orchestrator.handleUtterance('못 찾겠어', ctx);
    expect(r.message).toContain('대안');
    expect(r.askedForClarification).toBe(true);
    expect(progress.getProgress('github')?.stuckCounts['repo-1']).toBe(1);
  });

  it('"다시 설명해줘" repeats and "쉽게" re-renders simpler', async () => {
    const ctx = githubContext();
    const first = await orchestrator.handleUtterance('새 저장소 만들기', ctx);
    const repeated = await orchestrator.handleUtterance('다시 설명해줘', ctx);
    expect(repeated.message).toBe(first.message);
    const simpler = await orchestrator.handleUtterance('더 쉽게 말해줘', ctx);
    expect(simpler.message).toContain('지금 할 일은 하나예요');
  });

  it('completing every step finishes the task and saves progress', async () => {
    const ctx = githubContext();
    await orchestrator.handleUtterance('새 저장소 만들어줘 어떻게?', ctx);
    let last = await orchestrator.handleUtterance('완료했어', ctx);
    // create-repo has 4 steps; keep confirming until the finish message.
    for (let i = 0; i < 5 && last.step; i += 1) {
      last = await orchestrator.handleUtterance('완료했어', ctx);
    }
    expect(last.message).toContain('모든 단계를 완료');
    expect(progress.getProgress('github')?.completedTaskIds).toContain('create-repo');
  });

  it('generic mode answers on a site without a Guide Pack, from observed DOM only', async () => {
    const ctx: ScreenContext = {
      source: 'browser-extension',
      capturedAt: new Date().toISOString(),
      browser: {
        url: 'https://random-saas.example',
        title: 'Random SaaS',
        domSummary: {
          headings: ['대시보드'],
          buttons: ['프로젝트 만들기', '설정'],
          links: [],
          inputs: [],
          landmarks: ['main'],
        },
      },
    };
    const r = await orchestrator.handleUtterance('새 프로젝트 만들려면?', ctx);
    expect(r.usedGuidePack).toBeNull();
    expect(r.step?.action).toContain('프로젝트 만들기');
    expect(r.evidence.join(' ')).toContain('직접 확인');
  });

  it('never guesses without screen info — asks for context instead', async () => {
    const r = await orchestrator.handleUtterance('다음에 뭘 눌러야 해?', null);
    expect(r.askedForClarification).toBe(true);
    expect(r.confidence).toBeLessThanOrEqual(0.2);
  });

  it('troubleshooting uses pack rules when the error matches', async () => {
    const ctx = githubContext();
    const r = await orchestrator.handleUtterance('404 오류가 왜 생겼어?', ctx);
    expect(r.mode).toBe('troubleshooting');
    expect(r.message).toContain('가능한 원인');
    expect(r.usedGuidePack).toBe('github');
  });

  it('destructive-sounding guidance always carries a safety warning', async () => {
    const ctx: ScreenContext = {
      source: 'browser-extension',
      capturedAt: new Date().toISOString(),
      browser: {
        url: 'https://random-app.example',
        title: 'App',
        domSummary: {
          headings: [],
          buttons: ['계정 삭제'],
          links: [],
          inputs: [],
          landmarks: [],
        },
      },
    };
    const r = await orchestrator.handleUtterance('계정 삭제는 어떻게 해?', ctx);
    expect(r.safetyWarning).toBeDefined();
    expect(r.needsUserConfirmation).toBe(true);
  });

  it('sensitive data in the utterance and context never reaches history or the provider', async () => {
    const ctx = githubContext();
    ctx.browser!.title = '내 계정 hong@test.com — GitHub';
    await orchestrator.handleUtterance(
      '내 비밀번호: abc1234! 인데 로그인이 안 돼',
      ctx,
    );
    const snapshot = orchestrator.getSnapshot();
    const flatHistory = JSON.stringify(snapshot.history);
    expect(flatHistory).not.toContain('abc1234!');
    expect(JSON.stringify(snapshot.redactedContext)).not.toContain('hong@test.com');
    expect(snapshot.redactionFindings.length).toBeGreaterThan(0);
  });

  it('clearContext and clearHistory wipe user data immediately', async () => {
    const ctx = githubContext();
    await orchestrator.handleUtterance('새 저장소 만들기', ctx);
    orchestrator.clearHistory();
    orchestrator.clearContext();
    const s = orchestrator.getSnapshot();
    expect(s.history).toHaveLength(0);
    expect(s.redactedContext).toBeNull();
    expect(s.detection.confidence).toBe(0);
  });

  it('mock TTS provider can be interrupted (stop is immediate)', async () => {
    const tts = new MockTTSProvider();
    await tts.speak('안내 문장');
    tts.stop();
    expect(tts.isSpeaking).toBe(false);
    expect(tts.spoken).toContain('안내 문장');
  });
});
