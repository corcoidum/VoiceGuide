/// <reference types="chrome" />
/* Background service worker — 최소 역할만:
 * 확장 아이콘 클릭 시 사이드패널이 열리도록 설정. */

void chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err: unknown) => console.error('[voiceguide]', err));

export {};
