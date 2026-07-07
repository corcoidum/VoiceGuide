import type {
  ConversationTurn,
  GuideMode,
  GuidePack,
  GuidePackTask,
  GuideResponse,
  RedactionFinding,
  ScreenContext,
  ToolDetection,
} from './types.js';
import { classifyIntent } from './intentClassifier.js';
import { PrivacyRedactor } from './privacyRedactor.js';
import { ToolDetector } from './toolDetector.js';
import { ToolGuideRegistry } from './toolGuideRegistry.js';
import { LearningProgressTracker } from './learningProgressTracker.js';
import {
  buildPackStep,
  matchTask,
  renderStepMessage,
} from './stepPlanner.js';
import type { LLMProvider } from './providers.js';

const DESTRUCTIVE_KEYWORDS =
  /삭제|지우|결제|구매|전송|보내|배포|초기화|탈퇴|delete|remove|pay|purchase|send|publish|deploy|reset|format/i;

export interface OrchestratorDeps {
  registry: ToolGuideRegistry;
  llm: LLMProvider;
  redactor?: PrivacyRedactor;
  progress?: LearningProgressTracker;
}

export interface HandleOptions {
  userSelectedToolId?: string;
  mode?: GuideMode;
}

export interface OrchestratorSnapshot {
  mode: GuideMode;
  goal: string;
  detection: ToolDetection;
  activeTaskTitle: string | null;
  stepIndex: number;
  totalSteps: number | null;
  history: ConversationTurn[];
  redactionFindings: RedactionFinding[];
  redactedContext: ScreenContext | null;
}

/**
 * The conversation state machine: one utterance in, one guide step out.
 * Prefers deterministic Guide Pack workflows; falls back to the LLM
 * provider (mock by default) for Generic Guide Mode.
 */
export class GuideOrchestrator {
  private readonly registry: ToolGuideRegistry;
  private readonly llm: LLMProvider;
  private readonly redactor: PrivacyRedactor;
  private readonly progress: LearningProgressTracker | null;

  private mode: GuideMode = 'ask';
  private goal = '';
  private detection: ToolDetection = {
    toolId: null,
    toolName: '알 수 없음',
    confidence: 0,
    evidence: [],
  };
  private activePack: GuidePack | null = null;
  private activeTask: GuidePackTask | null = null;
  private stepIndex = 0;
  private genericStepIndex = 0;
  private history: ConversationTurn[] = [];
  private lastResponse: GuideResponse | null = null;
  private redactionFindings: RedactionFinding[] = [];
  private redactedContext: ScreenContext | null = null;

  constructor(deps: OrchestratorDeps) {
    this.registry = deps.registry;
    this.llm = deps.llm;
    this.redactor = deps.redactor ?? new PrivacyRedactor();
    this.progress = deps.progress ?? null;
  }

  getSnapshot(): OrchestratorSnapshot {
    return {
      mode: this.mode,
      goal: this.goal,
      detection: this.detection,
      activeTaskTitle: this.activeTask?.title ?? null,
      stepIndex: this.stepIndex,
      totalSteps: this.activeTask?.steps.length ?? null,
      history: [...this.history],
      redactionFindings: [...this.redactionFindings],
      redactedContext: this.redactedContext,
    };
  }

  /** User control: wipe conversation and context immediately. */
  clearHistory(): void {
    this.history = [];
    this.lastResponse = null;
  }

  clearContext(): void {
    this.redactedContext = null;
    this.redactionFindings = [];
    this.detection = {
      toolId: null,
      toolName: '알 수 없음',
      confidence: 0,
      evidence: [],
    };
  }

  /** Redacts and stores context; returns what the AI would see (preview). */
  ingestContext(raw: ScreenContext | null, userSelectedToolId?: string): {
    context: ScreenContext | null;
    findings: RedactionFinding[];
    detection: ToolDetection;
  } {
    if (raw) {
      const { context, findings } = this.redactor.redactContext(raw);
      this.redactedContext = context;
      this.redactionFindings = findings;
    }
    const detector = new ToolDetector(this.registry.list());
    this.detection = detector.detect(this.redactedContext, userSelectedToolId);
    return {
      context: this.redactedContext,
      findings: this.redactionFindings,
      detection: this.detection,
    };
  }

  async handleUtterance(
    utterance: string,
    rawContext: ScreenContext | null,
    options: HandleOptions = {},
  ): Promise<GuideResponse> {
    this.ingestContext(rawContext, options.userSelectedToolId);
    if (options.mode) this.mode = options.mode;

    const safeUtterance = this.redactor.redact(utterance).redacted;
    this.history.push({
      role: 'user',
      text: safeUtterance,
      at: new Date().toISOString(),
    });

    const intent = classifyIntent(safeUtterance);
    const response = await this.route(intent, safeUtterance);

    this.history.push({
      role: 'guide',
      text: response.message,
      at: new Date().toISOString(),
    });
    this.lastResponse = response;
    return response;
  }

  /* ------------------------------ Routing ------------------------------ */

  private async route(
    intent: ReturnType<typeof classifyIntent>,
    utterance: string,
  ): Promise<GuideResponse> {
    switch (intent) {
      case 'repeat':
        if (this.lastResponse) return { ...this.lastResponse };
        return this.startGoal(utterance, false);

      case 'simplify':
        if (this.lastResponse?.step) {
          return {
            ...this.lastResponse,
            message: renderStepMessage(this.lastResponse.step, true),
            simplified: true,
          };
        }
        return this.startGoal(utterance, true);

      case 'done':
        return this.advance(utterance);

      case 'not_found':
        return this.handleStuck();

      case 'error_help':
        return this.troubleshoot(utterance);

      case 'start_tutorial':
        this.mode = 'tutorial';
        return this.startGoal(utterance, false);

      case 'verify':
        return this.verifyCurrentStep();

      case 'explore':
        this.mode = 'explore';
        return this.explore();

      case 'ask_how':
      case 'unknown':
      default:
        return this.startGoal(utterance, false);
    }
  }

  /* --------------------------- Goal handling --------------------------- */

  private async startGoal(
    utterance: string,
    simplify: boolean,
  ): Promise<GuideResponse> {
    this.goal = utterance;
    const pack = this.registry.get(this.detection.toolId);
    this.activePack = pack;

    if (pack) {
      const task =
        this.mode === 'tutorial' && !matchTask(pack, utterance)
          ? (pack.commonTasks[0] ?? null)
          : matchTask(pack, utterance);
      if (task) {
        this.activeTask = task;
        // Resume where the user left off if we have saved progress.
        const resume = this.progress?.getResumePoint(pack.toolId);
        this.stepIndex =
          resume && resume.taskId === task.taskId ? resume.stepIndex : 0;
        return this.emitPackStep(simplify);
      }
    }

    // Generic Guide Mode via the LLM provider (mock = deterministic).
    this.activeTask = null;
    const response = await this.llm.generateGuide({
      utterance,
      intent: 'ask_how',
      mode: this.mode,
      goal: this.goal,
      redactedContext: this.redactedContext,
      detection: this.detection,
      pack: null,
      history: this.history,
      genericStepIndex: this.genericStepIndex,
      simplify,
    });
    return this.withSafety(response);
  }

  private emitPackStep(simplify: boolean): GuideResponse {
    const pack = this.activePack;
    const task = this.activeTask;
    if (!pack || !task) {
      throw new Error('emitPackStep called without an active pack task');
    }
    const step = buildPackStep(pack, task, this.stepIndex, this.redactedContext);
    if (!step) {
      // Task finished.
      this.progress?.recordTaskCompleted(pack.toolId, task.taskId);
      const finished: GuideResponse = {
        mode: this.mode,
        usedGuidePack: pack.toolId,
        message: `"${task.title}" 작업의 모든 단계를 완료했습니다. 잘 하셨어요! 다른 작업이 필요하면 말씀해주세요.`,
        confidence: 0.9,
        evidence: [`${pack.toolName} Guide Pack의 "${task.title}" 워크플로 완료`],
        needsUserConfirmation: false,
      };
      this.activeTask = null;
      this.stepIndex = 0;
      return finished;
    }
    return this.withSafety({
      mode: this.mode,
      usedGuidePack: pack.toolId,
      step,
      message: renderStepMessage(step, simplify),
      simplified: simplify || undefined,
      confidence: this.detection.confidence >= 0.9 ? 0.85 : 0.6,
      evidence: [
        `${pack.toolName} Guide Pack v${pack.version}의 "${task.title}" 워크플로 사용`,
        ...this.detection.evidence,
      ],
      needsUserConfirmation: true,
    });
  }

  private async advance(utterance: string): Promise<GuideResponse> {
    if (this.activePack && this.activeTask) {
      const currentStep = this.activeTask.steps[this.stepIndex];
      if (currentStep) {
        this.progress?.recordStepCompleted(
          this.activePack.toolId,
          this.activeTask.taskId,
          currentStep.id,
          this.stepIndex,
        );
      }
      this.stepIndex += 1;
      this.mode = this.mode === 'ask' ? 'coach' : this.mode;
      return this.emitPackStep(false);
    }
    // Generic mode: re-plan against the (possibly changed) screen.
    this.genericStepIndex += 1;
    const response = await this.llm.generateGuide({
      utterance,
      intent: 'done',
      mode: this.mode,
      goal: this.goal,
      redactedContext: this.redactedContext,
      detection: this.detection,
      pack: null,
      history: this.history,
      genericStepIndex: this.genericStepIndex,
      simplify: false,
    });
    return this.withSafety(response);
  }

  private handleStuck(): GuideResponse {
    const last = this.lastResponse;
    if (this.activePack && this.activeTask) {
      const currentStep = this.activeTask.steps[this.stepIndex];
      if (currentStep) {
        this.progress?.recordStuck(this.activePack.toolId, currentStep.id);
      }
    }
    if (last?.step) {
      return {
        ...last,
        message: [
          '괜찮습니다. 다른 방법을 안내할게요.',
          `대안: ${last.step.fallback}`,
          '그래도 찾기 어려우면 지금 화면에 보이는 메뉴 이름들을 말해주시거나 스크린샷을 공유해주세요.',
        ].join('\n'),
        needsUserConfirmation: true,
        askedForClarification: true,
      };
    }
    return {
      mode: this.mode,
      usedGuidePack: null,
      message:
        '어떤 것을 찾고 계신지 조금 더 알려주세요. 지금 화면에 보이는 제목이나 메뉴 이름을 말씀해주시면 도움이 됩니다.',
      confidence: 0.2,
      evidence: ['이전 단계 정보가 없어 확인을 요청합니다.'],
      needsUserConfirmation: true,
      askedForClarification: true,
    };
  }

  private async troubleshoot(utterance: string): Promise<GuideResponse> {
    this.mode = 'troubleshooting';
    const pack = this.registry.get(this.detection.toolId);
    if (pack) {
      const lower = utterance.toLowerCase();
      const rule = pack.troubleshooting.find((r) =>
        lower.includes(r.pattern.toLowerCase()),
      );
      if (rule) {
        return {
          mode: 'troubleshooting',
          usedGuidePack: pack.toolId,
          message: [
            `가능한 원인: ${rule.cause}`,
            `해결 방법: ${rule.solution}`,
            '해결되면 "완료했어", 여전히 문제가 있으면 오류 메시지를 그대로 읽어주세요.',
          ].join('\n'),
          confidence: 0.7,
          evidence: [
            `${pack.toolName} Guide Pack의 문제 해결 규칙("${rule.pattern}")과 일치`,
          ],
          needsUserConfirmation: true,
        };
      }
    }
    const response = await this.llm.generateGuide({
      utterance,
      intent: 'error_help',
      mode: 'troubleshooting',
      goal: this.goal || utterance,
      redactedContext: this.redactedContext,
      detection: this.detection,
      pack: null,
      history: this.history,
      genericStepIndex: this.genericStepIndex,
      simplify: false,
    });
    return this.withSafety(response);
  }

  private verifyCurrentStep(): GuideResponse {
    const step = this.lastResponse?.step;
    if (step) {
      return {
        mode: this.mode,
        usedGuidePack: this.lastResponse?.usedGuidePack ?? null,
        step,
        message: [
          '확인해볼게요.',
          `제대로 되었다면 지금 화면에 이렇게 보여야 합니다: ${step.successCheck}`,
          '그렇게 보이면 "완료했어", 다르게 보이면 지금 화면 상태를 말씀해주세요.',
        ].join('\n'),
        confidence: 0.6,
        evidence: ['직전 단계의 성공 조건과 비교하도록 안내'],
        needsUserConfirmation: true,
      };
    }
    return {
      mode: this.mode,
      usedGuidePack: null,
      message:
        '아직 진행한 단계가 없어서 확인할 기준이 없습니다. 어떤 작업을 하셨는지 말씀해주시겠어요?',
      confidence: 0.2,
      evidence: ['확인할 이전 단계가 없습니다.'],
      needsUserConfirmation: true,
      askedForClarification: true,
    };
  }

  private explore(): GuideResponse {
    const pack = this.registry.get(this.detection.toolId);
    const dom = this.redactedContext?.browser?.domSummary;
    const lines: string[] = [];
    const evidence: string[] = [];

    if (pack) {
      lines.push(`${pack.toolName}에서 자주 하는 작업들입니다:`);
      for (const task of pack.commonTasks) lines.push(`- ${task.title}`);
      evidence.push(`${pack.toolName} Guide Pack의 작업 목록`);
    }
    if (dom) {
      const visible = [...dom.headings.slice(0, 3), ...dom.buttons.slice(0, 5)];
      if (visible.length > 0) {
        lines.push(
          `지금 화면에서 확인된 요소: ${visible.map((v) => `"${v}"`).join(', ')}`,
        );
        evidence.push('페이지 DOM에서 직접 확인한 요소만 나열했습니다.');
      }
    }
    if (lines.length === 0) {
      lines.push(
        '화면 정보가 공유되지 않아 기능을 나열할 수 없습니다. 페이지 컨텍스트 공유를 켜주시겠어요?',
      );
      evidence.push('공유된 화면 정보 없음 — 추측하지 않습니다.');
    }
    lines.push('궁금한 기능을 말씀해주시면 한 단계씩 안내해드릴게요.');

    return {
      mode: 'explore',
      usedGuidePack: pack?.toolId ?? null,
      message: lines.join('\n'),
      confidence: pack ? 0.8 : dom ? 0.6 : 0.2,
      evidence,
      needsUserConfirmation: false,
      askedForClarification: !pack && !dom,
    };
  }

  /* ------------------------------ Safety ------------------------------- */

  /** Destructive-sounding steps always get an explicit warning. */
  private withSafety(response: GuideResponse): GuideResponse {
    const actionText = response.step?.action ?? response.message;
    if (DESTRUCTIVE_KEYWORDS.test(actionText)) {
      return {
        ...response,
        safetyWarning:
          '이 작업은 되돌리기 어려울 수 있습니다. 실행 전에 대상이 맞는지 다시 확인하세요. VoiceGuide는 설명만 하며 자동으로 실행하지 않습니다.',
        needsUserConfirmation: true,
      };
    }
    return response;
  }
}
