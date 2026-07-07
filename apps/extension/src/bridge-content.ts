/// <reference types="chrome" />
/* Content script injected ONLY into the VoiceGuide web app
 * (localhost:5173). Relays page context saved by the popup into the app
 * via window.postMessage. Runs nowhere else. */

function relay(context: unknown): void {
  if (!context) return;
  window.postMessage({ type: 'voiceguide:context', payload: context }, '*');
}

// Deliver any context collected before the app tab opened.
chrome.storage.local.get('voiceguideContext', (items) => {
  relay(items['voiceguideContext']);
});

// Deliver live updates while the app is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['voiceguideContext']) {
    relay(changes['voiceguideContext'].newValue);
  }
});
