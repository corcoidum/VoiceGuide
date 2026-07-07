import type {
  GuidePack,
  GuidePackTask,
  GuideStep,
  ScreenContext,
} from './types.js';
import type { GuideLLMRequest } from './providers.js';

/* ------------------------- Guide Pack planning ------------------------- */

/** Finds the pack task that best matches the user's goal, or null. */
export function matchTask(pack: GuidePack, goal: string): GuidePackTask | null {
  const lower = goal.toLowerCase();
  let best: { task: GuidePackTask; score: number } | null = null;
  for (const task of pack.commonTasks) {
    const score = task.keywords.filter((k) =>
      lower.includes(k.toLowerCase()),
    ).length;
    if (score > 0 && (best === null || score > best.score)) {
      best = { task, score };
    }
  }
  return best?.task ?? null;
}

/** Builds the single next step of a pack task. */
export function buildPackStep(
  pack: GuidePack,
  task: GuidePackTask,
  stepIndex: number,
  context: ScreenContext | null,
): GuideStep | null {
  const raw = task.steps[stepIndex];
  if (!raw) return null;
  const where =
    context?.browser?.title ?? context?.activeWindowTitle ?? pack.toolName;
  const situation =
    stepIndex === 0
      ? `${pack.toolName}에서 "${task.title}" 작업을 시작합니다. 현재 화면: ${where}`
      : `"${task.title}" 진행 중 — ${task.steps.length}단계 중 ${stepIndex + 1}번째 단계입니다.`;
  return {
    situation,
    action: raw.instruction,
    uiHint: raw.uiHint,
    successCheck: raw.successCheck,
    fallback: raw.fallback,
    confirmQuestion:
      stepIndex === task.steps.length - 1
        ? '여기까지 완료되면 "완료했어"라고 말해주세요. 이것이 마지막 단계입니다.'
        : '완료되면 "완료했어", 찾지 못하면 "못 찾겠어"라고 말해주세요.',
  };
}

/* ------------------------- Generic Guide Mode -------------------------- */

const GOAL_STOPWORDS = new Set([
  '어떻게',
  '하려면',
  '해야',
  '어디',
  '뭘',
  '무엇',
  '해줘',
  '알려줘',
  '싶어',
  'how',
  'do',
  'i',
  'the',
  'a',
  'to',
  'where',
  'what',
]);

function goalKeywords(goal: string): string[] {
  return goal
    .split(/[\s?.,!]+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 2 && !GOAL_STOPWORDS.has(w));
}

export interface GenericPlanResult {
  step: GuideStep;
  confidence: number;
  evidence: string[];
  askedForClarification: boolean;
}

/**
 * Generic Guide Mode: works on any website using only observed DOM data.
 * If the DOM does not contain an element matching the goal, it says so and
 * asks the user instead of inventing a button.
 */
export function planGenericStep(request: GuideLLMRequest): GenericPlanResult {
  const context = request.redactedContext;
  const dom = context?.browser?.domSummary;
  const where =
    context?.browser?.title ??
    context?.activeWindowTitle ??
    '알 수 없는 화면';
  const keywords = goalKeywords(request.goal || request.utterance);

  // Try to find a visible button/link whose label matches the goal.
  if (dom) {
    const candidates = [...dom.buttons, ...dom.links];
    const hit = candidates.find((label) =>
      keywords.some((k) => label.toLowerCase().includes(k)),
    );
    if (hit) {
      const isButton = dom.buttons.includes(hit);
      return {
        step: {
          situation: `현재 "${where}" 화면입니다. 목표와 관련된 요소를 화면에서 확인했습니다.`,
          action: `화면에서 "${hit}" ${isButton ? '버튼' : '링크'}을 찾아 눌러보세요.`,
          uiHint: `"${hit}"라는 문구가 표시된 ${isButton ? '버튼' : '링크'}입니다.`,
          successCheck: '누른 뒤 화면이 바뀌거나 새 창/영역이 나타나야 합니다.',
          fallback:
            '보이지 않으면 화면을 아래로 스크롤하거나, 메뉴(☰) 아이콘을 열어 같은 이름의 항목을 찾아보세요.',
          confirmQuestion: '눌렀다면 "완료했어", 찾지 못했다면 "못 찾겠어"라고 말해주세요.',
        },
        confidence: 0.75,
        evidence: [
          `페이지 DOM에서 "${hit}" 요소를 직접 확인했습니다.`,
          `현재 페이지: ${where}`,
        ],
        askedForClarification: false,
      };
    }

    // DOM available but nothing matches: be honest, suggest observed entry points.
    const entryPoints = [...dom.buttons.slice(0, 3), ...dom.landmarks.slice(0, 2)];
    return {
      step: {
        situation: `현재 "${where}" 화면입니다. 목표("${request.goal || request.utterance}")와 직접 일치하는 요소는 화면에서 확인하지 못했습니다.`,
        action:
          entryPoints.length > 0
            ? `화면에 실제로 보이는 항목은 ${entryPoints.map((e) => `"${e}"`).join(', ')} 등입니다. 이 중 목표와 가장 관련 있어 보이는 것을 알려주시거나, 화면 상단의 메뉴/설정 아이콘을 열어보세요.`
            : '화면 상단이나 좌측의 메뉴를 열어 관련 항목이 있는지 확인해보세요.',
        uiHint: '보통 메뉴는 화면 상단 바 또는 좌측 사이드바에 있습니다.',
        successCheck: '메뉴가 열리면 항목 목록이 나타납니다.',
        fallback: '메뉴가 없다면 현재 화면의 스크린샷을 공유해주시면 더 정확히 안내할 수 있습니다.',
        confirmQuestion: '어떤 항목들이 보이는지 말씀해주시겠어요?',
      },
      confidence: 0.4,
      evidence: [
        '페이지 DOM을 분석했지만 목표와 일치하는 버튼/링크를 찾지 못했습니다.',
        '확인되지 않은 UI는 추측하지 않습니다.',
      ],
      askedForClarification: true,
    };
  }

  // No screen information at all: ask, never guess.
  return {
    step: {
      situation: '아직 화면 정보가 공유되지 않아 현재 상태를 확인할 수 없습니다.',
      action:
        '브라우저 확장으로 페이지 정보를 공유하거나, 화면 공유/스크린샷 업로드를 허용해주세요. 또는 지금 화면에 무엇이 보이는지 말로 설명해주셔도 됩니다.',
      uiHint: 'VoiceGuide 화면의 "컨텍스트" 패널에서 공유를 켤 수 있습니다.',
      successCheck: '공유가 되면 상단에 감지된 프로그램 이름이 표시됩니다.',
      fallback: '화면 공유가 어려우면 사용 중인 프로그램 이름과 보이는 메뉴를 말해주세요.',
      confirmQuestion: '지금 어떤 화면이 보이시나요?',
    },
    confidence: 0.1,
    evidence: ['공유된 화면 정보가 없습니다. 추측 대신 확인을 요청합니다.'],
    askedForClarification: true,
  };
}

/* ----------------------------- Rendering ------------------------------- */

/** Renders a structured step into one natural spoken/text message. */
export function renderStepMessage(step: GuideStep, simplify = false): string {
  if (simplify) {
    return [
      step.situation,
      `지금 할 일은 하나예요: ${step.action}`,
      `찾을 곳: ${step.uiHint}`,
      step.confirmQuestion,
    ].join('\n');
  }
  return [
    step.situation,
    step.action,
    `화면에서 찾을 것: ${step.uiHint}`,
    `성공하면: ${step.successCheck}`,
    `잘 안 되면: ${step.fallback}`,
    step.confirmQuestion,
  ].join('\n');
}
