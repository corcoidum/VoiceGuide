/* Claude API 클라이언트 + 프롬프트 조립.
 * 모든 텍스트는 전송 전 PrivacyRedactor로 마스킹된다 (core 재사용).
 * 스크린샷은 마스킹이 불가능하므로 UI에서 별도 경고를 표시한다. */
import { PrivacyRedactor } from '../../../../packages/core/src/privacyRedactor.js';
import type { RedactionFinding } from '../../../../packages/core/src/types.js';
import type { GuideTurn, PageSnapshot, SnapshotDiff } from '../shared/types.js';

export const MODELS = [
  { id: 'claude-sonnet-5', label: 'Sonnet (권장 — 품질/속도 균형)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku (빠르고 저렴)' },
  { id: 'claude-opus-4-8', label: 'Opus (최고 품질, 느림/비쌈)' },
] as const;

const redactor = new PrivacyRedactor();

const SYSTEM_PROMPT = `당신은 VoiceGuide — 사용자가 지금 브라우저에서 보고 있는 웹페이지의 사용법을 음성으로 안내하는 한국어 가이드입니다.

매 턴마다 사용자의 말과 함께 현재 페이지의 라이브 스냅샷(URL, 제목, 화면 요소 목록)이 주어집니다.
요소는 "[e12] button "저장" (우상단)" 형식이며, ref(e12)로 지칭합니다.
"직전 대비 변화" 정보가 있으면 사용자의 이전 행동이 성공했는지 판단하는 근거로 사용하세요.

규칙:
1. 한 번에 딱 한 단계만 안내합니다. 여러 단계를 나열하지 않습니다.
2. 스냅샷에 실제로 존재하는 요소만 지목합니다. 추측은 금지입니다.
   필요한 요소가 목록에 없으면 솔직히 없다고 말하고 — 스크롤이나 메뉴 열기를 안내하거나, need_screenshot을 true로 설정해 화면 캡처를 요청하세요.
3. speak는 TTS로 읽힐 문장입니다. 짧고 자연스러운 구어체 한국어 1~3문장, 마크다운·특수기호·영어 약어 남발 금지.
4. 사용자가 "완료했어"라고 하면 변화 정보와 새 스냅샷으로 실제 성공 여부를 확인한 뒤 다음 단계로 넘어가세요. 화면이 안 바뀌었으면 솔직히 말하세요.
5. 삭제·결제·전송·게시처럼 되돌리기 어려운 행동은 warning에 경고를 적으세요. 당신은 설명만 하고 절대 대신 실행하지 않습니다.
6. 사용자가 "더 쉽게"라고 하면 같은 단계를 더 쉬운 말로, "못 찾겠어"라고 하면 위치 묘사를 더 구체적으로 + 대안 경로를 제시하세요.

반드시 아래 JSON 형식으로만 응답하세요 (코드펜스 없이):
{"speak":"음성으로 읽을 문장","detail":"화면에만 표시할 부가 설명 또는 null","target_ref":"지목할 요소 ref 또는 null","success_check":"이 단계가 성공하면 보일 것 또는 null","warning":"경고 또는 null","need_screenshot":false}`;

/** 스냅샷 → LLM에게 보여줄 압축 텍스트 */
export function serializeSnapshot(
  snap: PageSnapshot,
  diff: SnapshotDiff | null,
): string {
  const lines: string[] = [];
  lines.push(`URL: ${snap.url}`);
  lines.push(`제목: ${snap.title}`);
  lines.push(
    `스크롤: ${snap.scrollPercent}%${snap.hasMoreBelow ? ' (아래에 더 있음)' : ''}`,
  );
  if (snap.headings.length > 0) lines.push(`제목 요소: ${snap.headings.join(' | ')}`);
  if (snap.iframes > 0)
    lines.push(`iframe ${snap.iframes}개 — 내부 내용은 이 목록에 없음`);
  if (diff && (diff.urlChanged || diff.appeared.length || diff.disappeared.length)) {
    lines.push('--- 직전 대비 변화 ---');
    if (diff.urlChanged) lines.push('· URL이 바뀜');
    if (diff.titleChanged) lines.push('· 페이지 제목이 바뀜');
    if (diff.appeared.length) lines.push(`· 새로 나타남: ${diff.appeared.join(', ')}`);
    if (diff.disappeared.length) lines.push(`· 사라짐: ${diff.disappeared.join(', ')}`);
  }
  lines.push('--- 화면 요소 ---');
  for (const e of snap.elements) {
    const state = e.state?.length ? ` [${e.state.join(', ')}]` : '';
    lines.push(`[${e.ref}] ${e.role} "${e.label}" (${e.pos})${state}`);
  }
  if (snap.truncated) lines.push('(요소가 많아 일부 생략됨)');
  return lines.join('\n');
}

const SNAPSHOT_MARKER = '\n[현재 화면 스냅샷]\n';

export interface HistoryEntry {
  role: 'user' | 'assistant';
  text: string; // user: 발화+스냅샷 / assistant: 원본 JSON
  imageBase64?: string; // jpeg, data: 접두어 없는 base64
}

export function buildUserText(utterance: string, snapshotText: string): string {
  return `[사용자] ${utterance}${SNAPSHOT_MARKER}${snapshotText}`;
}

/** 과거 턴의 스냅샷은 토큰 절약을 위해 제거 (마지막 user 턴만 유지) */
function stripOldSnapshots(history: HistoryEntry[]): HistoryEntry[] {
  const lastUserIdx = history.map((h) => h.role).lastIndexOf('user');
  return history.map((h, i) => {
    if (h.role !== 'user' || i === lastUserIdx) return h;
    const cut = h.text.indexOf(SNAPSHOT_MARKER);
    return {
      role: h.role,
      text: cut === -1 ? h.text : h.text.slice(0, cut),
    };
  });
}

export interface LlmResult {
  raw: string;
  turn: GuideTurn;
  findings: RedactionFinding[];
}

export async function callGuide(
  apiKey: string,
  model: string,
  history: HistoryEntry[],
): Promise<LlmResult> {
  // 최근 16턴만 유지 + 과거 스냅샷 제거 + 전송 직전 마스킹
  const trimmed = stripOldSnapshots(history.slice(-16));
  const allFindings: RedactionFinding[] = [];

  const messages = trimmed.map((h) => {
    const { redacted, findings } = redactor.redact(h.text);
    allFindings.push(...findings);
    const content: unknown[] = [{ type: 'text', text: redacted }];
    if (h.imageBase64) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: h.imageBase64 },
      });
    }
    return { role: h.role, content };
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages,
    }),
  });

  if (!res.ok) {
    const status = res.status;
    let detail = '';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? '';
    } catch {
      /* ignore */
    }
    if (status === 401) throw new Error('API 키가 잘못되었습니다. 설정에서 확인해주세요.');
    if (status === 429) throw new Error('요청 한도 초과입니다. 잠시 후 다시 시도해주세요.');
    if (status === 529) throw new Error('Anthropic 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.');
    throw new Error(`API 오류 (${status}) ${detail}`.trim());
  }

  const body = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const raw =
    body.content
      ?.filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('') ?? '';

  return { raw, turn: parseTurn(raw), findings: allFindings };
}

/** 모델 출력에서 JSON 추출 — 실패하면 전체 텍스트를 speak로 취급 */
export function parseTurn(raw: string): GuideTurn {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<GuideTurn>;
      if (typeof parsed.speak === 'string' && parsed.speak.trim()) {
        return {
          speak: parsed.speak.trim(),
          detail: parsed.detail ?? null,
          target_ref: parsed.target_ref ?? null,
          success_check: parsed.success_check ?? null,
          warning: parsed.warning ?? null,
          need_screenshot: parsed.need_screenshot === true,
        };
      }
    } catch {
      /* fall through */
    }
  }
  return { speak: raw.trim() || '응답을 이해하지 못했습니다. 다시 말씀해주세요.' };
}
