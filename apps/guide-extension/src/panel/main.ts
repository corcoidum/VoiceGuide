/// <reference types="chrome" />
/* 사이드패널 메인 — 대화 오케스트레이션.
 * 흐름: 발화 → 활성 탭 라이브 스냅샷 → 마스킹 → Claude → 단계 렌더 + TTS + 하이라이트 */
import {
  MODELS,
  buildUserText,
  callGuide,
  serializeSnapshot,
  type HistoryEntry,
} from './llm.js';
import { PushToTalk, Speaker, ensureMicPermission } from './voice.js';
import type {
  ContentMessage,
  GuideTurn,
  SnapshotResponse,
} from '../shared/types.js';

/* ------------------------------- DOM 참조 ------------------------------- */

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const chatEl = $('chat');
const emptyEl = $('empty-state');
const errorEl = $('error');
const privacyEl = $('privacy');
const tabTitleEl = $('tab-title');
const tabDotEl = $('tab-dot');
const settingsEl = $('settings');
const keyInput = $<HTMLInputElement>('set-key');
const modelSelect = $<HTMLSelectElement>('set-model');
const ttsCheck = $<HTMLInputElement>('set-tts');
const rateInput = $<HTMLInputElement>('set-rate');
const rateVal = $('set-rate-val');
const textInput = $<HTMLInputElement>('text-input');
const pttBtn = $<HTMLButtonElement>('ptt');
const sendBtn = $<HTMLButtonElement>('btn-send');
const shotBtn = $<HTMLButtonElement>('btn-shot');
const replayBtn = $<HTMLButtonElement>('btn-replay');
const stopTtsBtn = $<HTMLButtonElement>('btn-stop-tts');

/* -------------------------------- 상태 --------------------------------- */

interface Settings {
  apiKey: string;
  model: string;
  ttsOn: boolean;
  rate: number;
}

let settings: Settings = {
  apiKey: '',
  model: MODELS[0].id,
  ttsOn: true,
  rate: 1,
};
let history: HistoryEntry[] = [];
let busy = false;
let guidedTabId: number | null = null;
let lastSpoken = '';
let includeShotNext = false;
let interimEl: HTMLElement | null = null;

const ptt = new PushToTalk();
const speaker = new Speaker((speaking) => {
  stopTtsBtn.classList.toggle('hidden', !speaking);
  replayBtn.classList.toggle('hidden', speaking);
});

/* -------------------------------- 설정 --------------------------------- */

for (const m of MODELS) {
  const opt = document.createElement('option');
  opt.value = m.id;
  opt.textContent = m.label;
  modelSelect.appendChild(opt);
}

async function loadSettings(): Promise<void> {
  const stored = await chrome.storage.local.get('settings');
  if (stored['settings']) settings = { ...settings, ...stored['settings'] };
  keyInput.value = settings.apiKey;
  modelSelect.value = settings.model;
  ttsCheck.checked = settings.ttsOn;
  rateInput.value = String(settings.rate);
  rateVal.textContent = `${settings.rate.toFixed(1)}x`;
  settingsEl.classList.toggle('hidden', Boolean(settings.apiKey));
}

$('set-save').addEventListener('click', () => {
  settings = {
    apiKey: keyInput.value.trim(),
    model: modelSelect.value,
    ttsOn: ttsCheck.checked,
    rate: Number(rateInput.value),
  };
  void chrome.storage.local.set({ settings });
  settingsEl.classList.add('hidden');
  if (!settings.apiKey) showError('API 키가 없으면 가이드를 사용할 수 없습니다.');
  else clearError();
});

$('btn-settings').addEventListener('click', () =>
  settingsEl.classList.toggle('hidden'),
);
rateInput.addEventListener('input', () => {
  rateVal.textContent = `${Number(rateInput.value).toFixed(1)}x`;
});

/* ------------------------------ 탭 추적 -------------------------------- */

function isGuidablUrl(url: string | undefined): boolean {
  return Boolean(url && /^https?:/.test(url));
}

async function refreshTabInfo(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  guidedTabId = tab.id;
  tabTitleEl.textContent = tab.title ?? '(제목 없음)';
  tabTitleEl.title = tab.url ?? '';
  const ok = isGuidablUrl(tab.url);
  tabDotEl.className = `dot ${ok ? 'ok' : 'bad'}`;
  return tab;
}

chrome.tabs.onActivated.addListener(() => void refreshTabInfo());
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.title || info.url || info.status === 'complete') void refreshTabInfo();
});

/* --------------------------- content script 통신 ------------------------ */

async function sendToContent(
  tabId: number,
  msg: ContentMessage,
): Promise<SnapshotResponse> {
  try {
    return (await chrome.tabs.sendMessage(tabId, msg)) as SnapshotResponse;
  } catch {
    // 확장 설치 전에 열린 탭 등 — 주입 후 1회 재시도
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['dist/content.js'],
    });
    return (await chrome.tabs.sendMessage(tabId, msg)) as SnapshotResponse;
  }
}

/* ----------------------------- 스크린샷 -------------------------------- */

async function captureShot(windowId: number): Promise<string> {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
    format: 'jpeg',
    quality: 60,
  });
  return shrinkImage(dataUrl, 1200);
}

/** 토큰 절약: 폭 1200px 초과 시 축소. data: 접두어 제거한 base64 반환 */
async function shrinkImage(dataUrl: string, maxW: number): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = dataUrl;
  });
  let out = dataUrl;
  if (img.width > maxW) {
    const canvas = document.createElement('canvas');
    canvas.width = maxW;
    canvas.height = Math.round((img.height / img.width) * maxW);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    out = canvas.toDataURL('image/jpeg', 0.7);
  }
  return out.replace(/^data:image\/jpeg;base64,/, '');
}

/* ------------------------------ 렌더링 --------------------------------- */

function scrollChat(): void {
  chatEl.scrollTop = chatEl.scrollHeight;
}

function addUserMsg(text: string): void {
  emptyEl.classList.add('hidden');
  const div = document.createElement('div');
  div.className = 'msg user';
  div.textContent = text;
  chatEl.appendChild(div);
  scrollChat();
}

function addGuideMsg(turn: GuideTurn): void {
  const div = document.createElement('div');
  div.className = 'msg guide';

  const speak = document.createElement('p');
  speak.className = 'speak';
  speak.textContent = turn.speak;
  speak.style.margin = '0';
  div.appendChild(speak);

  if (turn.detail) {
    const d = document.createElement('p');
    d.className = 'detail';
    d.textContent = turn.detail;
    d.style.margin = '6px 0 0';
    div.appendChild(d);
  }
  if (turn.success_check) {
    const s = document.createElement('p');
    s.className = 'success';
    s.textContent = `✅ 성공하면: ${turn.success_check}`;
    s.style.margin = '6px 0 0';
    div.appendChild(s);
  }
  if (turn.warning) {
    const wd = document.createElement('div');
    wd.className = 'warning';
    wd.textContent = `⚠️ ${turn.warning}`;
    div.appendChild(wd);
  }
  if (turn.target_ref) {
    const btn = document.createElement('button');
    btn.className = 'target-btn';
    btn.textContent = '📍 화면에서 다시 가리키기';
    btn.addEventListener('click', () => {
      if (guidedTabId !== null && turn.target_ref) {
        void sendToContent(guidedTabId, {
          type: 'vg:highlight',
          ref: turn.target_ref,
        });
      }
    });
    div.appendChild(btn);
  }
  if (turn.need_screenshot) {
    const badges = document.createElement('div');
    badges.className = 'badge-row';
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = '📷 화면 캡처가 있으면 더 정확히 안내할 수 있어요 — 카메라 버튼을 눌러주세요';
    badges.appendChild(b);
    div.appendChild(badges);
  }
  chatEl.appendChild(div);
  scrollChat();
}

function addThinking(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'msg guide thinking';
  div.textContent = '화면을 읽고 생각하는 중…';
  chatEl.appendChild(div);
  scrollChat();
  return div;
}

function showError(message: string): void {
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}
function clearError(): void {
  errorEl.classList.add('hidden');
}

/* ------------------------------ 핵심 흐름 ------------------------------- */

async function ask(utterance: string): Promise<void> {
  const text = utterance.trim();
  if (!text || busy) return;
  if (!settings.apiKey) {
    settingsEl.classList.remove('hidden');
    showError('먼저 Anthropic API 키를 설정해주세요.');
    return;
  }
  clearError();
  speaker.stop(); // 새 질문 = 이전 음성 즉시 중단
  busy = true;
  sendBtn.disabled = true;
  addUserMsg(text);
  const thinking = addThinking();

  try {
    const tab = await refreshTabInfo();
    if (!tab?.id || !isGuidablUrl(tab.url)) {
      thinking.remove();
      addGuideMsg({
        speak:
          '이 페이지는 안내할 수 없어요. 크롬 설정 페이지나 웹스토어가 아닌 일반 웹사이트 탭을 열어주세요.',
      });
      return;
    }

    // 1) 라이브 스냅샷 (+ 직전 대비 변화)
    const snapRes = await sendToContent(tab.id, { type: 'vg:snapshot' });
    if (!snapRes.ok || !snapRes.snapshot) {
      throw new Error(snapRes.error ?? '페이지 정보를 읽지 못했습니다.');
    }
    const snapshotText = serializeSnapshot(snapRes.snapshot, snapRes.diff ?? null);

    // 2) (선택) 스크린샷
    let imageBase64: string | undefined;
    if (includeShotNext) {
      try {
        imageBase64 = await captureShot(tab.windowId);
      } catch {
        /* 캡처 실패는 치명적이지 않음 — DOM만으로 진행 */
      }
      includeShotNext = false;
      shotBtn.classList.remove('armed');
    }

    // 3) LLM 호출 (전송 직전 마스킹은 llm.ts에서 수행)
    const entry: HistoryEntry = {
      role: 'user',
      text: buildUserText(text, snapshotText),
      ...(imageBase64 ? { imageBase64 } : {}),
    };
    history.push(entry);
    const result = await callGuide(settings.apiKey, settings.model, history);
    history.push({ role: 'assistant', text: result.raw });

    // 4) 렌더 + 하이라이트 + TTS
    thinking.remove();
    addGuideMsg(result.turn);
    if (result.findings.length > 0) {
      privacyEl.textContent = `🔒 전송 전 마스킹됨: ${result.findings
        .map((f) => `${f.kind}×${f.count}`)
        .join(', ')}`;
      privacyEl.classList.remove('hidden');
    } else {
      privacyEl.classList.add('hidden');
    }
    if (result.turn.target_ref) {
      void sendToContent(tab.id, {
        type: 'vg:highlight',
        ref: result.turn.target_ref,
      });
    }
    lastSpoken = result.turn.speak;
    if (settings.ttsOn) speaker.speak(result.turn.speak, settings.rate);
  } catch (err) {
    thinking.remove();
    showError((err as Error).message);
    // 실패한 턴은 히스토리에서 제거 (user 뒤에 assistant 응답이 없는 상태 방지)
    if (history[history.length - 1]?.role === 'user') history.pop();
  } finally {
    busy = false;
    sendBtn.disabled = false;
  }
}

/* ------------------------------ 입력 배선 ------------------------------- */

sendBtn.addEventListener('click', () => {
  void ask(textInput.value);
  textInput.value = '';
});
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) {
    void ask(textInput.value);
    textInput.value = '';
  }
});

for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-say]'))) {
  btn.addEventListener('click', () => void ask(btn.dataset['say'] ?? ''));
}
for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('.example'))) {
  btn.addEventListener('click', () => void ask(btn.textContent ?? ''));
}

shotBtn.addEventListener('click', () => {
  includeShotNext = !includeShotNext;
  shotBtn.classList.toggle('armed', includeShotNext);
  if (includeShotNext) {
    showError(
      '📷 다음 질문에 화면 스크린샷이 포함됩니다. 스크린샷은 마스킹되지 않으니 민감한 화면이면 취소하세요.',
    );
  } else {
    clearError();
  }
});

replayBtn.addEventListener('click', () => {
  if (lastSpoken) speaker.speak(lastSpoken, settings.rate);
});
stopTtsBtn.addEventListener('click', () => speaker.stop());

$('btn-new').addEventListener('click', () => {
  history = [];
  chatEl.querySelectorAll('.msg').forEach((m) => m.remove());
  emptyEl.classList.remove('hidden');
  privacyEl.classList.add('hidden');
  clearError();
  speaker.stop();
  if (guidedTabId !== null) {
    void sendToContent(guidedTabId, { type: 'vg:clearHighlight' }).catch(() => undefined);
  }
});

/* ------------------------------ 푸시투토크 ------------------------------ */

function setPttUi(listening: boolean): void {
  pttBtn.classList.toggle('listening', listening);
  pttBtn.textContent = listening ? '⏹' : '🎙️';
}

pttBtn.addEventListener('click', () => {
  if (ptt.listening) {
    ptt.stop();
    setPttUi(false);
    interimEl?.remove();
    interimEl = null;
    return;
  }
  speaker.stop(); // 게이팅: 마이크 켜는 순간 TTS 중단
  void ensureMicPermission().then((granted) => {
    if (!granted) {
      showError(
        '마이크 권한이 필요합니다. 브라우저 주소창 왼쪽 아이콘에서 이 확장의 마이크를 허용해주세요.',
      );
      return;
    }
    if (!PushToTalk.isSupported()) {
      showError('이 브라우저는 음성 인식을 지원하지 않습니다. 텍스트로 입력해주세요.');
      return;
    }
    setPttUi(true);
    ptt.start(
      (interim) => {
        if (!interimEl) {
          interimEl = document.createElement('div');
          interimEl.className = 'msg user interim';
          chatEl.appendChild(interimEl);
        }
        interimEl.textContent = `${interim}…`;
        scrollChat();
      },
      (final) => {
        interimEl?.remove();
        interimEl = null;
        void ask(final);
      },
      (message) => {
        if (message) showError(message);
      },
      () => {
        setPttUi(false);
        interimEl?.remove();
        interimEl = null;
      },
    );
  });
});

/* -------------------------------- 시작 --------------------------------- */

void loadSettings();
void refreshTabInfo();
