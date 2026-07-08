"use strict";
(() => {
  // src/background.ts
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => console.error("[voiceguide]", err));
})();
