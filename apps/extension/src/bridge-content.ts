/// <reference types="chrome" />
/* Content script injected ONLY into local VoiceGuide web app origins.
 * Relays the Chrome tab context saved by the popup and
 * lets the app ask the background worker to refresh that same target tab. */

interface BridgeMessage {
  type?: string;
  requestId?: string;
}

function relay(context: unknown, requestId?: string): void {
  if (!context) return;
  window.postMessage(
    { type: 'voiceguide:context', payload: context, requestId },
    window.location.origin,
  );
}

function relayStatus(message: string, requestId?: string, ok = true): void {
  window.postMessage(
    { type: 'voiceguide:extension-status', ok, message, requestId },
    window.location.origin,
  );
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

// 웹앱의 삭제 버튼이 extension 쪽 임시 context까지 지울 수 있게 합니다.
window.addEventListener('message', (event) => {
  const data = event.data as BridgeMessage | undefined;
  if (
    event.source !== window ||
    event.origin !== window.location.origin ||
    !data?.type
  ) {
    return;
  }
  const requestId =
    typeof data.requestId === 'string' ? data.requestId : undefined;

  if (data.type === 'voiceguide:request-extension-context') {
    chrome.runtime.sendMessage(
      { type: 'voiceguide:get-latest-context' },
      (response?: { ok?: boolean; context?: unknown; error?: string }) => {
        const err = chrome.runtime.lastError;
        if (err) {
          relayStatus(err.message ?? 'Chrome 확장 응답을 받을 수 없습니다.', requestId, false);
          return;
        }
        if (response?.ok) {
          relay(response.context, requestId);
          relayStatus(response.context ? 'Chrome 탭 컨텍스트를 불러왔습니다.' : '저장된 Chrome 탭이 없습니다.', requestId, Boolean(response.context));
        } else {
          relayStatus(response?.error ?? 'Chrome 탭 컨텍스트를 불러오지 못했습니다.', requestId, false);
        }
      },
    );
    return;
  }

  if (data.type === 'voiceguide:refresh-target-context') {
    chrome.runtime.sendMessage(
      { type: 'voiceguide:refresh-target-context' },
      (response?: { ok?: boolean; context?: unknown; error?: string }) => {
        const err = chrome.runtime.lastError;
        if (err) {
          relayStatus(err.message ?? 'Chrome 확장 응답을 받을 수 없습니다.', requestId, false);
          return;
        }
        if (response?.ok) {
          relay(response.context, requestId);
          relayStatus('연결된 Chrome 탭을 다시 읽었습니다.', requestId, true);
        } else {
          relayStatus(response?.error ?? '연결된 Chrome 탭을 다시 읽지 못했습니다.', requestId, false);
        }
      },
    );
    return;
  }

  if (data.type === 'voiceguide:clear-context') {
    chrome.runtime.sendMessage({ type: 'voiceguide:clear-context' }, () => {
      void chrome.runtime.lastError;
    });
  }
});
