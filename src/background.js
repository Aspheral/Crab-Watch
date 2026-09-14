import { getRecentGames, validUsername, HISTORY_WINDOW, ACCOUNT_CONTEXT_WINDOW } from './chesscom-api.js';
import { compareCurrentGameToHistory } from './analysis/history.js';
import { detectCriticalPositions } from './analysis/critical.js';
import { analyzeTiming } from './analysis/timing.js';
import { analyzeWithEngine } from './analysis/engine.js';
import { buildEngineBaseline, compareCurrentToBaseline, BASELINE_MAX_POSITIONS_TOTAL } from './analysis/baseline.js';
import { detectChangePoint } from './analysis/changepoint.js';
import { findSimilarDecisions } from './analysis/similar.js';
import { createEvidenceReport } from './analysis/forensics.js';

const GAME_STATE_KEY = 'crabWatchGameState';
const REVIEW_KEY = 'crabWatchReview';
const CACHE_KEY_PREFIX = 'crabWatchHistory:';
const BASELINE_CACHE_PREFIX = 'crabWatchEngineBaseline:';
const OFFSCREEN_PATH = 'offscreen.html';
const HISTORY_CACHE_MS = 12 * 60 * 60 * 1000;
const BASELINE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const VERSION = '0.11.0';

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

function isComputerGame(game) {
  return /\/game\/computer\//i.test(String(game?.url || ''));
}

function opponentFor(game) {
  if (validUsername(game?.opponent)) return game.opponent;
  if (!Array.isArray(game?.players) || !game.players.length) return null;
  const current = game.currentUser?.toLowerCase();
  if (current) return game.players.find(name => name.toLowerCase() !== current) || null;
  if (game.players.length === 1 && validUsername(game.players[0])) return game.players[0];
  return null;
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
  if (cached?.fetchedAt && Date.now() - cached.fetchedAt < HISTORY_CACHE_MS) return { ...cached, fromCache: true };
  const result = await getRecentGames(username, ACCOUNT_CONTEXT_WINDOW);
  await chrome.storage.local.set({ [key]: result });
  return { ...result, fromCache: false };
}

async function cachedEngineBaseline(username, historyGames, currentGameUrl) {
  const key = `${BASELINE_CACHE_PREFIX}${username.toLowerCase()}`;
  const stored = await chrome.storage.local.get(key);
  const cached = stored[key];
  if (cached?.createdAt && Date.now() - cached.createdAt < BASELINE_CACHE_MS && cached?.status === 'complete' && cached?.positionsRequested >= BASELINE_MAX_POSITIONS_TOTAL) return { ...cached, fromCache: true };
  const result = await buildEngineBaseline({ games: historyGames, username, currentGameUrl, analyzePositions: positions => runEnginePositions(positions, 12, BASELINE_MAX_POSITIONS_TOTAL) });
  const value = { ...result, createdAt: Date.now(), fromCache: false };
  await chrome.storage.local.set({ [key]: value });
  return value;
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
  return pgn ? { ...state, pgn } : state || null;
}

async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({ url: OFFSCREEN_PATH, reasons: ['WORKERS'], justification: 'Run the bundled Stockfish analysis worker only after a Chess.com game has finished.' });
}

async function runEnginePositions(positions, depth = 15, maxPositions = 8) {
  if (!positions?.length) return { status: 'no-positions', results: [] };
  await ensureOffscreenDocument();
  return analyzeWithEngine({ positions, depth, maxPositions });
}

async function requestReview(sendResponse) {
  const stored = await chrome.storage.local.get(GAME_STATE_KEY);
  const state = stored[GAME_STATE_KEY];
  if (!state?.finished) throw new Error('No completed game is available.');

  const computerGame = isComputerGame(state);
  const opponent = opponentFor(state);
  if (!computerGame && !validUsername(opponent)) throw new Error('Crab Watch could not identify the opponent from the completed game.');

  let history = { player: null, games: [], fetchedAt: null, fromCache: false };
  if (!computerGame && validUsername(opponent)) {
    try {
      history = await cachedHistory(opponent);
    } catch (error) {
      throw new Error(`Could not load the opponent's public history: ${error.message}`);
    }
  } else if (computerGame && validUsername(opponent)) {
    try {
      history = await cachedHistory(opponent);
    } catch {}
  }

  const games = history.games || [];
  const historyWindow = games.slice(0, HISTORY_WINDOW);
  const currentGame = findCurrentGame(games, state) || state;
  const historyAnalysis = computerGame && !games.length
    ? { status: 'computer-game', observations: ['Computer game: no public opponent history baseline.'] }
    : compareCurrentGameToHistory(opponent, currentGame, games);
  const changePointAnalysis = games.length >= 16 ? detectChangePoint(historyWindow, opponent) : { status: 'insufficient' };
  const opponentColor = colorForPlayer(currentGame, opponent);
  const criticalAnalysis = currentGame?.pgn ? await detectCriticalPositions(currentGame.pgn, opponentColor, 12) : null;
  const timingAnalysis = currentGame?.pgn ? analyzeTiming(currentGame.pgn, opponentColor) : null;

  let similarPositionAnalysis = { status: 'no-pgn', matches: [], selected: [] };
  if (currentGame?.pgn && criticalAnalysis?.selected?.length && historyWindow.length) {
    const matches = criticalAnalysis.selected.flatMap(critical => findSimilarDecisions(critical.before, historyWindow, opponent, { maxMatches: 8, currentMove: critical.move, currentSan: critical.san }).map(match => ({ currentPly: critical.ply, currentSan: critical.san, currentMoveNumber: critical.moveNumber, ...match })));
    matches.sort((a, b) => (b.decisionSimilarity - a.decisionSimilarity) || (b.adjustedSimilarity - a.adjustedSimilarity) || a.currentPly - b.currentPly);
    similarPositionAnalysis = { status: matches.length ? 'complete' : 'no-matches', matches: matches.slice(0, 32), selected: matches.slice(0, 12), currentCriticalPositions: criticalAnalysis.selected.length };
  }

  let engineAnalysis = { status: 'no-pgn', results: [] };
  let engineBaseline = { status: 'no-pgn', comparison: { status: 'insufficient' } };
  if (currentGame?.pgn && criticalAnalysis) {
    try {
      await ensureOffscreenDocument();
      engineAnalysis = await analyzeWithEngine({ positions: criticalAnalysis.selected, depth: 15, maxPositions: 8 });
      if (engineAnalysis.status === 'complete' && !computerGame && historyWindow.length) {
        const baselineRaw = await cachedEngineBaseline(opponent, historyWindow, currentGame.url || state.url || null);
        engineBaseline = { ...baselineRaw, comparison: compareCurrentToBaseline(engineAnalysis, baselineRaw) };
      }
    } catch (error) {
      engineAnalysis = { status: 'unavailable', engine: 'Stockfish 18 lite single-threaded', results: [], error: error.message };
    } finally {
      try { await chrome.offscreen.closeDocument(); } catch {}
    }
  }

  const evidence = createEvidenceReport({ game: { ...currentGame, finished: true }, history: historyWindow, player: opponent || 'computer', historyAnalysis, criticalAnalysis, timingAnalysis, engineAnalysis, engineBaseline, changePointAnalysis, similarPositionAnalysis });
  const review = { version: VERSION, completedGame: currentGame, opponent: opponent || null, gameType: computerGame ? 'computer' : 'human', history: historyWindow, accountContextCount: games.length, player: history.player || null, historyCount: Math.min(games.length, HISTORY_WINDOW), historyFetchedAt: history.fetchedAt, fromCache: history.fromCache, historyAnalysis, changePointAnalysis, criticalAnalysis, similarPositionAnalysis, timingAnalysis, engineAnalysis, engineBaseline, evidence, analysis: { engine: engineAnalysis.engine || 'Stockfish 18 lite single-threaded', status: evidence.assessment.level }, readyForAnalysisAt: Date.now() };
  await chrome.storage.local.set({ [REVIEW_KEY]: review });
  sendResponse({ ok: true, review });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'ENGINE_ANALYZE_POSITIONS') return false;
  if (message?.type === 'GAME_FINISHED') {
    const game = { ...message.payload, receivedAt: Date.now(), tabId: sender.tab?.id ?? null };
    chrome.storage.local.set({ [GAME_STATE_KEY]: game }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'REQUEST_REVIEW') {
    requestReview(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ crabWatchVersion: VERSION, analysisPolicy: 'post-game-only', historyWindow: HISTORY_WINDOW, accountContextWindow: ACCOUNT_CONTEXT_WINDOW, engineBaselineGames: 12, engineBaselinePositionsPerGame: 2 });
  await setCrabIcon();
});

setCrabIcon();
