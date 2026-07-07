/// <reference types="chrome" />
/* Popup script (global script, no modules — MV3 friendly).
 * Collection happens ONLY when the user clicks the consent button;
 * the extension has no host permissions and cannot read pages on its own. */

interface CollectedContext {
  url: string;
  title: string;
  domSummary: {
    headings: string[];
    buttons: string[];
    links: string[];
    inputs: string[];
    landmarks: string[];
  };
  capturedAt: string;
}

interface TargetTab {
  tabId: number;
  windowId?: number;
  url?: string;
  title?: string;
  grantedAt: string;
}

const POPUP_CONTEXT_KEY = 'voiceguideContext';
const POPUP_TARGET_KEY = 'voiceguideTarget';

/** Runs inside the inspected page via chrome.scripting.executeScript.
 *  Must be self-contained. Never reads input values — labels only. */
function collectDomSummaryInPage(): CollectedContext['domSummary'] {
  const clean = (s: string | null | undefined): string =>
    (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 90);
  const isVisible = (el: Element): boolean => {
    const he = el as HTMLElement;
    const style = window.getComputedStyle(he);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      he.getClientRects().length > 0
    );
  };
  const takeVisibleTexts = (selector: string, limit: number): string[] => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll(selector))) {
      if (out.length >= limit) break;
      if (!isVisible(el)) continue;
      const he = el as HTMLElement;
      const label =
        clean(he.innerText) ||
        clean(he.getAttribute('aria-label')) ||
        clean(he.getAttribute('title')) ||
        clean(he.getAttribute('value'));
      if (label && !out.includes(label)) out.push(label);
    }
    return out;
  };
  const inputs: string[] = [];
  for (const el of Array.from(
    document.querySelectorAll('input:not([type=hidden]), textarea, select'),
  )) {
    if (inputs.length >= 20) break;
    if (!isVisible(el)) continue;
    const he = el as HTMLInputElement;
    // Only field labels/placeholders — never the value the user typed.
    const label =
      clean(he.getAttribute('aria-label')) ||
      clean(he.getAttribute('placeholder')) ||
      clean(he.getAttribute('name')) ||
      (he.type === 'password' ? 'Password' : '');
    if (label && !inputs.includes(label)) inputs.push(label);
  }
  return {
    headings: takeVisibleTexts('h1, h2, h3', 12),
    buttons: takeVisibleTexts('button, [role=button], input[type=submit], input[type=button]', 30),
    links: takeVisibleTexts('a[href]', 30),
    inputs,
    landmarks: Array.from(
      new Set(
        Array.from(
          document.querySelectorAll('nav, main, aside, header, footer, [role=navigation], [role=main]'),
        )
          .filter(isVisible)
          .map((el) => {
            const role = el.getAttribute('role');
            return role ? `role=${role}` : el.tagName.toLowerCase();
          }),
      ),
    ).slice(0, 10),
  };
}

const titleEl = document.getElementById('tab-title')!;
const urlEl = document.getElementById('tab-url')!;
const previewEl = document.getElementById('preview') as HTMLPreElement;
const collectBtn = document.getElementById('collect') as HTMLButtonElement;
const sendBtn = document.getElementById('send') as HTMLButtonElement;
const openBtn = document.getElementById('open') as HTMLButtonElement;
const statusEl = document.getElementById('status')!;

let collected: CollectedContext | null = null;
let target: TargetTab | null = null;

function safePageUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return rawUrl.split(/[?#]/, 1)[0] ?? rawUrl;
  }
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

void activeTab().then((tab) => {
  titleEl.textContent = tab?.title ?? '(제목 없음)';
  urlEl.textContent = tab?.url ? safePageUrl(tab.url) : '';
});

collectBtn.addEventListener('click', () => {
  void (async () => {
    const tab = await activeTab();
    if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
      statusEl.textContent = '이 페이지에서는 수집할 수 없습니다 (http/https 페이지만 지원).';
      return;
    }
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: collectDomSummaryInPage,
      });
      collected = {
        url: safePageUrl(tab.url),
        title: tab.title ?? '',
        domSummary: result?.result as CollectedContext['domSummary'],
        capturedAt: new Date().toISOString(),
      };
      target = {
        tabId: tab.id,
        windowId: tab.windowId,
        url: collected.url,
        title: collected.title,
        grantedAt: new Date().toISOString(),
      };
      previewEl.style.display = 'block';
      previewEl.textContent = JSON.stringify(collected, null, 2);
      sendBtn.disabled = false;
      statusEl.textContent = '현재 탭을 읽었습니다. VoiceGuide로 연결할 수 있습니다.';
    } catch (err) {
      statusEl.textContent = `수집 실패: ${(err as Error).message}`;
    }
  })();
});

sendBtn.addEventListener('click', () => {
  void (async () => {
    if (!collected || !target) return;
    await chrome.storage.local.set({
      [POPUP_CONTEXT_KEY]: collected,
      [POPUP_TARGET_KEY]: target,
    });
    statusEl.textContent = 'VoiceGuide에 연결했습니다.';
    await chrome.tabs.create({ url: 'http://localhost:5173' });
  })();
});

openBtn.addEventListener('click', () => {
  void chrome.tabs.create({ url: 'http://localhost:5173' });
});
