/// <reference types="chrome" />
/* Content script injected ONLY into the VoiceGuide web app
 * (localhost:5173). Relays page context saved by the popup into the app
 * via window.postMessage. Runs nowhere else. */

function relay(context: unknown): void {
  if (!context) return;
  window.postMessage(
    { type: 'voiceguide:context', payload: context },
    window.location.origin,
  );
}

function relayAndForget(context: unknown): void {
  relay(context);
  if (context) void chrome.storage.local.remove('voiceguideContext');
}

// Deliver any context collected before the app tab opened.
chrome.storage.local.get('voiceguideContext', (items) => {
  relayAndForget(items['voiceguideContext']);
});

// Deliver live updates while the app is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['voiceguideContext']) {
    relayAndForget(changes['voiceguideContext'].newValue);
  }
});

// 웹앱의 삭제 버튼이 extension 쪽 임시 context까지 지울 수 있게 합니다.
window.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | undefined;
  if (
    event.source === window &&
    event.origin === window.location.origin &&
    data?.type === 'voiceguide:clear-context'
  ) {
    void chrome.storage.local.remove('voiceguideContext');
  }
});
