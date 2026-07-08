/// <reference types="chrome" />
/* VoiceGuide Live — content script (모든 http/https 페이지에 주입)
 *
 * 역할 3가지:
 *  1. 스냅샷: 요청 시점의 화면 요소(라벨·역할·위치·상태)를 수집.
 *     입력 필드의 "값"은 어떤 경우에도 수집하지 않는다 (라벨/placeholder만).
 *  2. 하이라이트: 가이드가 지목한 요소에 시각적 표시 + 스크롤 이동.
 *  3. 변화 감지: 직전 스냅샷과 비교해 "무엇이 나타나고 사라졌는지" 요약
 *     → 사용자가 "완료했어"라고 했을 때 실제로 화면이 바뀌었는지 검증하는 근거.
 */
import type {
  ContentMessage,
  PageSnapshot,
  SnapshotDiff,
  SnapshotElement,
  SnapshotResponse,
} from './shared/types.js';

// 중복 주입 방지 (scripting.executeScript로 재주입될 수 있음)
const FLAG = '__voiceguideLiveInjected';
const w = window as unknown as Record<string, unknown>;
if (!w[FLAG]) {
  w[FLAG] = true;
  init();
}

function init(): void {
  /* ------------------------------ 수집 ------------------------------ */

  const INTERACTIVE = [
    'a[href]',
    'button',
    'input:not([type=hidden])',
    'select',
    'textarea',
    'summary',
    '[role=button]',
    '[role=link]',
    '[role=tab]',
    '[role=menuitem]',
    '[role=menuitemcheckbox]',
    '[role=menuitemradio]',
    '[role=option]',
    '[role=checkbox]',
    '[role=radio]',
    '[role=switch]',
    '[role=combobox]',
    '[contenteditable=true]',
  ].join(', ');

  let refMap = new Map<string, Element>();
  let lastSignature: Set<string> | null = null;
  let lastUrl = '';
  let lastTitle = '';

  const clean = (s: string | null | undefined): string =>
    (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);

  function labelOf(el: Element): string {
    const he = el as HTMLElement;
    const aria = clean(he.getAttribute('aria-label'));
    if (aria) return aria;
    const tag = he.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      // 값(value)이 아닌 라벨만 수집한다.
      const id = he.getAttribute('id');
      const forLabel = id
        ? clean(document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent)
        : '';
      return (
        forLabel ||
        clean(he.getAttribute('placeholder')) ||
        clean(he.getAttribute('name')) ||
        clean(he.getAttribute('title'))
      );
    }
    const text = clean(he.innerText);
    if (text) return text;
    const img = he.querySelector('img[alt]');
    if (img) return clean(img.getAttribute('alt'));
    return clean(he.getAttribute('title'));
  }

  function roleOf(el: Element): string {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'input') {
      const t = (el as HTMLInputElement).type || 'text';
      return ['submit', 'button', 'image'].includes(t) ? 'button' : `input(${t})`;
    }
    if (tag === 'textarea') return 'input(textarea)';
    if (tag === 'select') return 'select';
    if (el.getAttribute('contenteditable') === 'true') return 'input(editor)';
    return tag;
  }

  function posOf(rect: DOMRect): string {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (cy < 0) return '위(스크롤 필요)';
    if (cy > vh) return '아래(스크롤 필요)';
    const h = cx < vw / 3 ? '좌' : cx > (vw * 2) / 3 ? '우' : '';
    const v = cy < vh / 3 ? '상단' : cy > (vh * 2) / 3 ? '하단' : '';
    if (!h && !v) return '중앙';
    if (!h) return v;
    if (!v) return `${h}측`;
    return `${h}${v}`;
  }

  function stateOf(el: Element): string[] {
    const s: string[] = [];
    const he = el as HTMLInputElement;
    if (he.disabled) s.push('비활성');
    if (he.checked) s.push('체크됨');
    const expanded = el.getAttribute('aria-expanded');
    if (expanded === 'true') s.push('펼쳐짐');
    else if (expanded === 'false') s.push('접힘');
    if (el.getAttribute('aria-selected') === 'true') s.push('선택됨');
    if (el.getAttribute('aria-current')) s.push('현재 위치');
    if (
      (he.tagName === 'INPUT' || he.tagName === 'TEXTAREA') &&
      typeof he.value === 'string' &&
      he.value.length > 0
    ) {
      s.push('입력값 있음'); // 값 자체는 절대 포함하지 않음
    }
    return s;
  }

  function isVisible(el: Element): boolean {
    const he = el as HTMLElement;
    const rect = he.getBoundingClientRect();
    if (rect.width < 3 || rect.height < 3) return false;
    if (typeof he.checkVisibility === 'function') return he.checkVisibility();
    const style = getComputedStyle(he);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }

  /** shadow DOM(open)까지 한 번의 순회로 수집 */
  function collectInteractive(root: ParentNode, out: Element[], depth: number): void {
    if (depth > 4 || out.length > 800) return;
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (out.length > 800) break;
      if (el.matches(INTERACTIVE)) out.push(el);
      const sr = (el as HTMLElement).shadowRoot;
      if (sr) collectInteractive(sr, out, depth + 1);
    }
  }

  function buildSnapshot(): PageSnapshot {
    refMap = new Map();
    const raw: Element[] = [];
    collectInteractive(document, raw, 0);

    const seen = new Set<string>();
    const inView: SnapshotElement[] = [];
    const outView: SnapshotElement[] = [];
    let counter = 0;

    for (const el of raw) {
      if (!isVisible(el)) continue;
      const label = labelOf(el);
      if (!label) continue;
      const rect = el.getBoundingClientRect();
      const pos = posOf(rect);
      const role = roleOf(el);
      const sig = `${role}|${label}|${pos}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      const ref = `e${++counter}`;
      refMap.set(ref, el);
      const state = stateOf(el);
      const item: SnapshotElement = {
        ref,
        role,
        label,
        pos,
        ...(state.length > 0 ? { state } : {}),
      };
      const visible = rect.top < window.innerHeight && rect.bottom > 0;
      (visible ? inView : outView).push(item);
    }

    const MAX_IN = 90;
    const MAX_OUT = 30;
    const elements = [...inView.slice(0, MAX_IN), ...outView.slice(0, MAX_OUT)];
    const truncated = inView.length > MAX_IN || outView.length > MAX_OUT;

    const headings: string[] = [];
    for (const h of Array.from(document.querySelectorAll('h1, h2, h3'))) {
      if (headings.length >= 12) break;
      if (!isVisible(h)) continue;
      const t = clean((h as HTMLElement).innerText);
      if (t && !headings.includes(t)) headings.push(t);
    }

    const doc = document.documentElement;
    const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
    const scrollPercent = Math.round((window.scrollY / maxScroll) * 100);

    return {
      url: location.href,
      title: document.title,
      headings,
      elements,
      scrollPercent: Math.min(100, Math.max(0, scrollPercent)),
      hasMoreBelow: doc.scrollHeight - window.innerHeight - window.scrollY > 200,
      iframes: document.querySelectorAll('iframe').length,
      truncated,
    };
  }

  /** 직전 스냅샷과 비교 — "완료했어" 검증의 근거 */
  function makeDiff(current: PageSnapshot): SnapshotDiff | null {
    const signature = new Set(current.elements.map((e) => `${e.role}:${e.label}`));
    if (lastSignature === null) {
      lastSignature = signature;
      lastUrl = current.url;
      lastTitle = current.title;
      return null;
    }
    const appeared: string[] = [];
    const disappeared: string[] = [];
    for (const s of signature) {
      if (!lastSignature.has(s) && appeared.length < 10) appeared.push(s);
    }
    for (const s of lastSignature) {
      if (!signature.has(s) && disappeared.length < 10) disappeared.push(s);
    }
    const diff: SnapshotDiff = {
      urlChanged: current.url !== lastUrl,
      titleChanged: current.title !== lastTitle,
      appeared,
      disappeared,
    };
    lastSignature = signature;
    lastUrl = current.url;
    lastTitle = current.title;
    return diff;
  }

  /* ---------------------------- 하이라이트 ---------------------------- */

  let hlBox: HTMLDivElement | null = null;
  let hlChip: HTMLDivElement | null = null;
  let hlTarget: Element | null = null;
  let hlTimer: number | undefined;
  let hlInterval: number | undefined;

  function clearHighlight(): void {
    hlBox?.remove();
    hlChip?.remove();
    hlBox = null;
    hlChip = null;
    hlTarget = null;
    if (hlTimer) window.clearTimeout(hlTimer);
    if (hlInterval) window.clearInterval(hlInterval);
  }

  function reposition(): void {
    if (!hlTarget || !hlBox || !hlChip) return;
    const rect = hlTarget.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      clearHighlight(); // 요소가 사라짐
      return;
    }
    const pad = 5;
    hlBox.style.left = `${rect.left - pad}px`;
    hlBox.style.top = `${rect.top - pad}px`;
    hlBox.style.width = `${rect.width + pad * 2}px`;
    hlBox.style.height = `${rect.height + pad * 2}px`;
    const chipTop = rect.top - 38;
    hlChip.style.left = `${Math.max(8, rect.left)}px`;
    hlChip.style.top = `${chipTop < 4 ? rect.bottom + 10 : chipTop}px`;
  }

  function highlight(ref: string): boolean {
    const el = refMap.get(ref);
    if (!el || !el.isConnected) return false;
    clearHighlight();
    hlTarget = el;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    hlBox = document.createElement('div');
    hlBox.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'pointer-events:none',
      'border:3px solid #ff5a36',
      'border-radius:10px',
      'box-shadow:0 0 0 4px rgba(255,90,54,.25), 0 0 24px rgba(255,90,54,.45)',
      'transition:all .15s ease',
      'animation:vgpulse 1.2s ease-in-out infinite',
    ].join(';');

    hlChip = document.createElement('div');
    hlChip.textContent = '👆 여기예요';
    hlChip.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'pointer-events:none',
      'background:#ff5a36',
      'color:#fff',
      'font:600 13px/1 sans-serif',
      'padding:7px 10px',
      'border-radius:8px',
      'box-shadow:0 2px 8px rgba(0,0,0,.3)',
    ].join(';');

    if (!document.getElementById('vg-style')) {
      const style = document.createElement('style');
      style.id = 'vg-style';
      style.textContent =
        '@keyframes vgpulse{0%,100%{opacity:1}50%{opacity:.45}}';
      document.documentElement.appendChild(style);
    }
    document.documentElement.appendChild(hlBox);
    document.documentElement.appendChild(hlChip);
    reposition();
    hlInterval = window.setInterval(reposition, 200);
    hlTimer = window.setTimeout(clearHighlight, 15000);
    return true;
  }

  window.addEventListener('scroll', reposition, { passive: true, capture: true });
  window.addEventListener('resize', reposition, { passive: true });

  /* ------------------------------ 메시지 ------------------------------ */

  chrome.runtime.onMessage.addListener(
    (msg: ContentMessage, _sender, sendResponse: (r: SnapshotResponse) => void) => {
      try {
        switch (msg?.type) {
          case 'vg:ping':
            sendResponse({ ok: true });
            break;
          case 'vg:snapshot': {
            const snapshot = buildSnapshot();
            sendResponse({ ok: true, snapshot, diff: makeDiff(snapshot) });
            break;
          }
          case 'vg:highlight':
            sendResponse({ ok: highlight(msg.ref) });
            break;
          case 'vg:clearHighlight':
            clearHighlight();
            sendResponse({ ok: true });
            break;
          default:
            sendResponse({ ok: false, error: 'unknown message' });
        }
      } catch (err) {
        sendResponse({ ok: false, error: (err as Error).message });
      }
      return false; // 동기 응답
    },
  );
}
