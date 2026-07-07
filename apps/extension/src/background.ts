/// <reference types="chrome" />

interface BackgroundCollectedContext {
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

interface BackgroundTargetTab {
  tabId: number;
  windowId?: number;
  url?: string;
  title?: string;
  grantedAt: string;
}

interface RuntimeRequest {
  type?: string;
}

const BACKGROUND_CONTEXT_KEY = 'voiceguideContext';
const BACKGROUND_TARGET_KEY = 'voiceguideTarget';

function collectDomSummaryForVoiceGuideTarget(): BackgroundCollectedContext['domSummary'] {
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

function safeBackgroundPageUrl(rawUrl: string): string {
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

function isSupportedPage(rawUrl: string | undefined): rawUrl is string {
  return typeof rawUrl === 'string' && /^https?:\/\//i.test(rawUrl);
}

async function getStorage<T>(key: string): Promise<T | undefined> {
  const items = await chrome.storage.local.get(key);
  return items[key] as T | undefined;
}

async function collectFromTab(tab: chrome.tabs.Tab): Promise<BackgroundCollectedContext> {
  const rawUrl = tab.url;
  if (!tab.id || !isSupportedPage(rawUrl)) {
    throw new Error('http/https 페이지에서만 현재 탭을 읽을 수 있습니다.');
  }
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: collectDomSummaryForVoiceGuideTarget,
  });
  return {
    url: safeBackgroundPageUrl(rawUrl),
    title: tab.title ?? '',
    domSummary: result?.result as BackgroundCollectedContext['domSummary'],
    capturedAt: new Date().toISOString(),
  };
}

async function refreshStoredTarget(): Promise<BackgroundCollectedContext> {
  const target = await getStorage<BackgroundTargetTab>(BACKGROUND_TARGET_KEY);
  if (!target?.tabId) {
    throw new Error('연결된 Chrome 탭이 없습니다. 안내받을 사이트에서 확장 아이콘을 먼저 눌러주세요.');
  }
  const tab = await chrome.tabs.get(target.tabId);
  const context = await collectFromTab({
    ...tab,
    url: tab.url ?? target.url,
    title: tab.title ?? target.title,
  });
  await chrome.storage.local.set({
    [BACKGROUND_CONTEXT_KEY]: context,
    [BACKGROUND_TARGET_KEY]: {
      ...target,
      url: context.url,
      title: context.title,
    },
  });
  return context;
}

chrome.runtime.onMessage.addListener(
  (message: RuntimeRequest, _sender, sendResponse) => {
    if (message?.type === 'voiceguide:get-latest-context') {
      void getStorage<BackgroundCollectedContext>(BACKGROUND_CONTEXT_KEY)
        .then((context) => sendResponse({ ok: true, context: context ?? null }))
        .catch((err) => sendResponse({ ok: false, error: (err as Error).message }));
      return true;
    }

    if (message?.type === 'voiceguide:refresh-target-context') {
      void refreshStoredTarget()
        .then((context) => sendResponse({ ok: true, context }))
        .catch((err) => sendResponse({ ok: false, error: (err as Error).message }));
      return true;
    }

    if (message?.type === 'voiceguide:clear-context') {
      void chrome.storage.local
        .remove([BACKGROUND_CONTEXT_KEY, BACKGROUND_TARGET_KEY])
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: (err as Error).message }));
      return true;
    }

    return false;
  },
);
