/* 패널 ↔ content script가 주고받는 데이터의 공용 타입.
 * (content.ts, panel/*.ts 모두 esbuild로 번들되므로 자유롭게 import 가능) */

/** 화면에서 확인된 상호작용 요소 하나. 입력값(value)은 절대 포함하지 않는다. */
export interface SnapshotElement {
  ref: string; // "e12" — LLM이 이 ref로 요소를 지칭
  role: string; // button, link, input, tab ...
  label: string; // 보이는 텍스트/aria-label/placeholder (최대 60자)
  pos: string; // 좌상단/우하단/중앙/아래(스크롤 필요) ...
  state?: string[]; // 비활성, 선택됨, 펼쳐짐, 입력값 있음 ...
}

/** 현재 페이지의 라이브 스냅샷 (요청 시마다 새로 생성) */
export interface PageSnapshot {
  url: string;
  title: string;
  headings: string[];
  elements: SnapshotElement[];
  scrollPercent: number; // 0~100
  hasMoreBelow: boolean;
  iframes: number; // 내부를 볼 수 없는 iframe 개수
  truncated: boolean; // 요소가 너무 많아 잘렸는지
}

/** 직전 스냅샷 대비 변화 요약 — 단계 완료 검증에 사용 */
export interface SnapshotDiff {
  urlChanged: boolean;
  titleChanged: boolean;
  appeared: string[]; // 새로 나타난 요소 라벨 (최대 10)
  disappeared: string[]; // 사라진 요소 라벨 (최대 10)
}

export interface SnapshotResponse {
  ok: boolean;
  snapshot?: PageSnapshot;
  diff?: SnapshotDiff | null;
  error?: string;
}

export type ContentMessage =
  | { type: 'vg:ping' }
  | { type: 'vg:snapshot' }
  | { type: 'vg:highlight'; ref: string }
  | { type: 'vg:clearHighlight' };

/** LLM이 반환하는 한 턴의 가이드 (JSON) */
export interface GuideTurn {
  speak: string; // TTS로 읽을 짧은 구어체 문장
  detail?: string | null; // 화면에만 표시할 부가 설명
  target_ref?: string | null; // 하이라이트할 요소 ref
  success_check?: string | null; // 이 단계 성공 시 화면에 보일 것
  warning?: string | null; // 파괴적 행동 경고
  need_screenshot?: boolean; // DOM만으로 부족 — 스크린샷 요청
}
