import { getRecentGames, validUsername, MAX_GAMES } from './chesscom-api.js';

const GAME_STATE_KEY = 'crabWatchGameState';
const REVIEW_KEY = 'crabWatchReview';
const CACHE_KEY_PREFIX = 'crabWatchHistory:';
const VERSION = '0.2.0';

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
  } catch {}
}

function opponentFor(game) {
  if (!Array.isArray(game?.players) || game.players.length < 2) return null;
  const current = game.currentUser?.toLowerCase();
  const other = game.players.find(name => name.toLowerCase() !== current);
  return other || null;
}

async function cachedHistory(username) {
  const key = `${CACHE_KEY_PREFIX}${username.toLowerCase()}`;
  const stored = await chrome.storage.local.get(key);
  const cached = stored[key];
  if (cached?.fetchedAt && Date.now() - cached.fetchedAt < 12 * 60 * 60 * 1000) {
    return { ...cached, fromCache: true };
  }
  const result = await getRecentGames(username, MAX_GAMES);
  await chrome.storage.local.set({ [key]: result });
  return { ...result, fromCache: false };
}

async function requestReview(sendResponse) {
  const stored = await chrome.storage.local.get(GAME_STATE_KEY);
  const game = stored[GAME_STATE_KEY];
  if (!game?.finished) throw new Error('No completed game is available.');

  const opponent = opponentFor(game);
  if (!validUsername(opponent)) {
    throw new Error('Crab Watch could not identify the opponent from the completed game.');
  }

  const history = await cachedHistory(opponent);
  const review = {
    version: VERSION,
    completedGame: game,
    opponent,
    history: history.games || [],
    player: history.player || null,
    historyCount: history.games?.length || 0,
    historyFetchedAt: history.fetchedAt,
    fromCache: history.fromCache,
    readyForAnalysisAt: Date.now()
  };

  await chrome.storage.local.set({ [REVIEW_KEY]: review });
  sendResponse({ ok: true, review });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GAME_FINISHED') {
    const state = {
      ...message.payload,
      receivedAt: Date.now(),
      tabId: sender.tab?.id ?? null
    };
    chrome.storage.local.set({ [GAME_STATE_KEY]: state }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === 'REQUEST_REVIEW') {
    requestReview(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    crabWatchVersion: VERSION,
    analysisPolicy: 'post-game-only',
    historyWindow: MAX_GAMES
  });
  await setCrabIcon();
});

setCrabIcon();
