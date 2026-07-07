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

/** Runs inside the inspected page via chrome.scripting.executeScript.
 *  Must be self-contained. Never reads input values — labels only. */
function collectDomSummaryInPage(): CollectedContext['domSummary'] {
  const clean = (s: string | null | undefined): string =>
    (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const takeVisibleTexts = (selector: string, limit: number): string[] => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll(selector))) {
      if (out.length >= limit) break;
      const he = el as HTMLElement;
      if (he.offsetParent === null && he.tagName !== 'BODY') continue;
      const label =
        clean(he.innerText) ||
        clean(he.getAttribute('aria-label')) ||
        clean(he.getAttribute('title'));
      if (label && !out.includes(label)) out.push(label);
    }
    return out;
  };
  const inputs: string[] = [];
  for (const el of Array.from(
    document.querySelectorAll('input:not([type=password]):not([type=hidden]), textarea, select'),
  )) {
    if (inputs.length >= 15) break;
    const he = el as HTMLInputElement;
    // Only field labels/placeholders — never the value the user typed.
    const label =
      clean(he.getAttribute('aria-label')) ||
      clean(he.getAttribute('placeholder')) ||
      clean(he.getAttribute('name'));
    if (label && !inputs.includes(label)) inputs.push(label);
  }
  return {
    headings: takeVisibleTexts('h1, h2, h3', 10),
    buttons: takeVisibleTexts('button, [role=button], input[type=submit]', 25),
    links: takeVisibleTexts('a[href]', 25),
    inputs,
    landmarks: takeVisibleTexts('nav, main, aside, header, footer', 0).length
      ? Array.from(
          new Set(
            Array.from(
              document.querySelectorAll('nav, main, aside, header, footer'),
            ).map((el) => el.tagName.toLowerCase()),
          ),
        )
      : [],
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
      previewEl.style.display = 'block';
      previewEl.textContent = JSON.stringify(collected, null, 2);
      sendBtn.disabled = false;
      statusEl.textContent = '수집 완료. 내용을 확인한 뒤 전송하세요.';
    } catch (err) {
      statusEl.textContent = `수집 실패: ${(err as Error).message}`;
    }
  })();
});

sendBtn.addEventListener('click', () => {
  void (async () => {
    if (!collected) return;
    await chrome.storage.local.set({ voiceguideContext: collected });
    statusEl.textContent = 'VoiceGuide로 전달했습니다. VoiceGuide 탭을 확인하세요.';
  })();
});

openBtn.addEventListener('click', () => {
  void chrome.tabs.create({ url: 'http://localhost:5173' });
});
