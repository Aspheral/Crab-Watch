import { getRecentGames, validUsername, HISTORY_WINDOW, ACCOUNT_CONTEXT_WINDOW } from './chesscom-api.js';
import { compareCurrentGameToHistory } from './analysis/history.js';
import { detectCriticalPositions } from './analysis/critical.js';
import { analyzeTiming } from './analysis/timing.js';
import { analyzeWithEngine } from './analysis/engine.js';
import { createEvidenceReport } from './analysis/forensics.js';

const GAME_STATE_KEY = 'crabWatchGameState';
const REVIEW_KEY = 'crabWatchReview';
const CACHE_KEY_PREFIX = 'crabWatchHistory:';
const OFFSCREEN_PATH = 'offscreen.html';
const VERSION = '0.7.0';

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

function colorForPlayer(game, username) {
  const lower = username?.toLowerCase();
  if (!lower) return null;
  if (game?.white?.username?.toLowerCase() === lower) return 'w';
  if (game?.black?.username?.toLowerCase() === lower) return 'b';
  return null;
}

async function cachedHistory(username) {
  const key = `${CACHE_KEY_PREFIX}${username.toLowerCase()}`;
  const stored = await chrome.storage.local.get(key);
  const cached = stored[key];
  if (cached?.fetchedAt && Date.now() - cached.fetchedAt < 12 * 60 * 60 * 1000) return { ...cached, fromCache: true };
  const result = await getRecentGames(username, ACCOUNT_CONTEXT_WINDOW);
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
  const pgn = state?.embeddedPgn || state?.moveText || null;
  return pgn ? { pgn } : null;
}

async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['WORKERS'],
    justification: 'Run the bundled Stockfish analysis worker only after a Chess.com game has finished.'
  });
}

async function runEngine(criticalAnalysis) {
  if (!criticalAnalysis?.selected?.length) return { status: 'no-positions', results: [] };
  try {
    await ensureOffscreenDocument();
    const result = await analyzeWithEngine({ positions: criticalAnalysis.selected, depth: 15, maxPositions: 8 });
    await chrome.offscreen.closeDocument();
    return result;
  } catch (error) {
    try { await chrome.offscreen.closeDocument(); } catch {}
    return { status: 'unavailable', engine: 'Stockfish 18 lite single-threaded', results: [], error: error.message };
  }
}

async function requestReview(sendResponse) {
  const stored = await chrome.storage.local.get(GAME_STATE_KEY);
  const state = stored[GAME_STATE_KEY];
  if (!state?.finished) throw new Error('No completed game is available.');
  const opponent = opponentFor(state);
  if (!validUsername(opponent)) throw new Error('Crab Watch could not identify the opponent from the completed game.');

  const history = await cachedHistory(opponent);
  const games = history.games || [];
  const currentGame = findCurrentGame(games, state) || state;
  const historyAnalysis = compareCurrentGameToHistory(opponent, currentGame, games);
  const opponentColor = colorForPlayer(currentGame, opponent);
  const criticalAnalysis = currentGame?.pgn ? await detectCriticalPositions(currentGame.pgn, opponentColor, 12) : null;
  const timingAnalysis = currentGame?.pgn ? analyzeTiming(currentGame.pgn, opponentColor) : null;
  const engineAnalysis = currentGame?.pgn && criticalAnalysis ? await runEngine(criticalAnalysis) : { status: 'no-pgn', results: [] };
  const evidence = createEvidenceReport({
    game: { ...currentGame, finished: true },
    history: games.slice(0, HISTORY_WINDOW),
    player: opponent,
    historyAnalysis,
    criticalAnalysis,
    timingAnalysis,
    engineAnalysis
  });

  const review = {
    version: VERSION,
    completedGame: currentGame,
    opponent,
    history: games.slice(0, HISTORY_WINDOW),
    accountContextCount: games.length,
    player: history.player || null,
    historyCount: Math.min(games.length, HISTORY_WINDOW),
    historyFetchedAt: history.fetchedAt,
    fromCache: history.fromCache,
    historyAnalysis,
    criticalAnalysis,
    timingAnalysis,
    engineAnalysis,
    evidence,
    analysis: { engine: engineAnalysis.engine || 'Stockfish 18 lite single-threaded', status: engineAnalysis.status === 'complete' ? 'engine-complete' : 'engine-unavailable' },
    readyForAnalysisAt: Date.now()
  };
  await chrome.storage.local.set({ [REVIEW_KEY]: review });
  sendResponse({ ok: true, review });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'ENGINE_ANALYZE_POSITIONS') return false;
  if (message?.type === 'GAME_FINISHED') {
    const state = { ...message.payload, receivedAt: Date.now(), tabId: sender.tab?.id ?? null };
    chrome.storage.local.set({ [GAME_STATE_KEY]: state }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'REQUEST_REVIEW') {
    requestReview(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ crabWatchVersion: VERSION, analysisPolicy: 'post-game-only', historyWindow: HISTORY_WINDOW, accountContextWindow: ACCOUNT_CONTEXT_WINDOW });
  await setCrabIcon();
});

setCrabIcon();
