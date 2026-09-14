import { getRecentGames, validUsername, MAX_GAMES } from './chesscom-api.js';
import { compareCurrentGameToHistory } from './analysis/history.js';

const GAME_STATE_KEY = 'crabWatchGameState';
const REVIEW_KEY = 'crabWatchReview';
const CACHE_KEY_PREFIX = 'crabWatchHistory:';
const VERSION = '0.3.0';

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
  if (!current) return null;
  return game.players.find(name => name.toLowerCase() !== current) || null;
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

function findCurrentGame(history, state) {
  const id = state?.gameId;
  if (id) {
    const byId = history.find(game => String(game.url || '').endsWith(`/${id}`));
    if (byId) return byId;
  }
  const url = state?.url;
  if (url) {
    const normalized = url.replace(/\/$/, '');
    const byUrl = history.find(game => String(game.url || '').replace(/\/$/, '') === normalized);
    if (byUrl) return byUrl;
  }
  return state?.embeddedPgn ? { pgn: state.embeddedPgn } : null;
}

async function requestReview(sendResponse) {
  const stored = await chrome.storage.local.get(GAME_STATE_KEY);
  const state = stored[GAME_STATE_KEY];
  if (!state?.finished) throw new Error('No completed game is available.');

  const opponent = opponentFor(state);
  if (!validUsername(opponent)) {
    throw new Error('Crab Watch could not identify the opponent from the completed game.');
  }

  const history = await cachedHistory(opponent);
  const currentGame = findCurrentGame(history.games || [], state);
  const comparison = compareCurrentGameToHistory(opponent, currentGame || state, history.games || []);

  const review = {
    version: VERSION,
    completedGame: currentGame || state,
    opponent,
    history: history.games || [],
    player: history.player || null,
    historyCount: history.games?.length || 0,
    historyFetchedAt: history.fetchedAt,
    fromCache: history.fromCache,
    historyAnalysis: comparison,
    analysis: {
      engine: 'not-run',
      status: 'history-context-ready'
    },
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
