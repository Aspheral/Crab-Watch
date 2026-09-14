import { detectCriticalPositions } from './critical.js';

export const BASELINE_GAMES = 6;
export const BASELINE_MAX_POSITIONS = 1;

function normalizedUrl(game) {
  return String(game?.url || '').replace(/\/$/, '');
}

function opponentSide(game, username) {
  const lower = username?.toLowerCase();
  if (!lower) return null;
  if (game?.white?.username?.toLowerCase() === lower) return 'w';
  if (game?.black?.username?.toLowerCase() === lower) return 'b';
  return null;
}

function spacedSample(games, limit = BASELINE_GAMES) {
  const usable = games.filter(game => game?.pgn);
  if (usable.length <= limit) return usable;
  const selected = [];
  for (let i = 0; i < limit; i += 1) {
    const index = Math.round((i * (usable.length - 1)) / (limit - 1));
    selected.push(usable[index]);
  }
  return [...new Map(selected.map(game => [normalizedUrl(game) || JSON.stringify(game), game])).values()];
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarizeEngineBaseline(results = []) {
  const losses = results.map(item => item.centipawnLoss).filter(Number.isFinite);
  const matches = results.filter(item => item.bestMoveMatches).length;
  return {
    gamesSampled: new Set(results.map(item => item.gameKey).filter(Boolean)).size,
    positionsScored: results.length,
    medianCpl: median(losses),
    meanCpl: losses.length ? losses.reduce((sum, value) => sum + value, 0) / losses.length : null,
    topMoveMatchRate: results.length ? matches / results.length : null
  };
}

export async function buildEngineBaseline({ games = [], username, currentGameUrl = null, analyzePositions }) {
  const eligible = games.filter(game => normalizedUrl(game) !== normalizedUrl({ url: currentGameUrl }) && opponentSide(game, username) && game?.pgn);
  const sample = spacedSample(eligible);
  const positions = [];
  for (const game of sample) {
    const color = opponentSide(game, username);
    const critical = await detectCriticalPositions(game.pgn, color, 4);
    const selected = critical.selected?.slice(0, BASELINE_MAX_POSITIONS) || [];
    if (selected.length) positions.push({ ...selected[0], gameKey: normalizedUrl(game) || game.start_time || game.end_time || null });
  }
  if (!positions.length) return { status: 'no-positions', sampleSize: sample.length, results: [], summary: summarizeEngineBaseline([]) };
  const engineResult = await analyzePositions(positions);
  const results = (engineResult?.results || []).map((item, index) => ({ ...item, gameKey: positions[index]?.gameKey || null }));
  return {
    status: engineResult?.status === 'complete' ? 'complete' : (engineResult?.status || 'unavailable'),
    sampleSize: sample.length,
    results,
    summary: summarizeEngineBaseline(results)
  };
}

export function compareCurrentToBaseline(currentEngine, baseline) {
  if (!currentEngine?.status || currentEngine.status !== 'complete' || !baseline || baseline.status !== 'complete') return { status: 'insufficient' };
  const currentResults = Array.isArray(currentEngine.results) ? currentEngine.results : [];
  const currentLosses = currentResults.map(item => item.centipawnLoss).filter(Number.isFinite);
  const currentMatches = currentResults.filter(item => item.bestMoveMatches).length;
  if (!currentLosses.length) return { status: 'insufficient' };
  const currentMedianCpl = median(currentLosses);
  const currentMeanCpl = currentLosses.reduce((sum, value) => sum + value, 0) / currentLosses.length;
  const currentMatchRate = currentResults.length ? currentMatches / currentResults.length : null;
  const baselineMedian = baseline.summary?.medianCpl ?? null;
  const baselineMean = baseline.summary?.meanCpl ?? null;
  const baselineMatchRate = baseline.summary?.topMoveMatchRate ?? null;
  return {
    status: 'complete',
    currentMedianCpl,
    currentMeanCpl,
    currentMatchRate,
    baselineMedianCpl: baselineMedian,
    baselineMeanCpl: baselineMean,
    baselineMatchRate,
    medianImprovement: baselineMedian !== null ? baselineMedian - currentMedianCpl : null,
    matchRateDelta: baselineMatchRate !== null && currentMatchRate !== null ? currentMatchRate - baselineMatchRate : null
  };
}
