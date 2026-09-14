const GAME_STATE_KEY = 'crabWatchGameState';

async function setCrabIcon() {
  try {
    const response = await fetch(chrome.runtime.getURL('assets/crab.svg'));
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const imageData = {};

    for (const size of [16, 32]) {
      const canvas = new OffscreenCanvas(size, size);
      const context = canvas.getContext('2d', { alpha: true });
      context.clearRect(0, 0, size, size);
      context.drawImage(bitmap, 0, 0, size, size);
      imageData[size] = context.getImageData(0, 0, size, size);
    }

    await chrome.action.setIcon({ imageData });
    bitmap.close();
  } catch {
    // The extension remains usable if optional toolbar artwork cannot load.
  }
}

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

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    crabWatchVersion: '0.1.0',
    analysisPolicy: 'post-game-only'
  });
  await setCrabIcon();
});

setCrabIcon();
