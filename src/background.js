const GAME_STATE_KEY = 'crabWatchGameState';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'GAME_FINISHED') return;

  const state = {
    ...message.payload,
    receivedAt: Date.now(),
    tabId: sender.tab?.id ?? null
  };

  chrome.storage.local.set({ [GAME_STATE_KEY]: state }).then(() => sendResponse({ ok: true }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    crabWatchVersion: '0.1.0',
    analysisPolicy: 'post-game-only'
  });
});
