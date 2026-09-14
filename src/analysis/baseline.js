import { detectCriticalPositions } from './critical.js';

export const BASELINE_GAMES = 12;
export const BASELINE_MAX_POSITIONS = 2;
export const BASELINE_MAX_POSITIONS_TOTAL = BASELINE_GAMES * BASELINE_MAX_POSITIONS;
export const TEMPORAL_MIN_GAMES = 4;

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

function summarizeResults(results = []) {
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

export function summarizeEngineBaseline(results = []) {
  return summarizeResults(results);
}

function summarizeGameSeries(games = []) {
  const medianValues = games.map(item => item.medianCpl).filter(Number.isFinite);
  const meanValues = games.map(item => item.meanCpl).filter(Number.isFinite);
  const matchValues = games.map(item => item.topMoveMatchRate).filter(Number.isFinite);
  return {
    gamesSampled: games.length,
    positionsScored: games.reduce((sum, item) => sum + (item.positionsScored || 0), 0),
    medianCpl: median(medianValues),
    meanCpl: meanValues.length ? meanValues.reduce((sum, value) => sum + value, 0) / meanValues.length : null,
    topMoveMatchRate: matchValues.length ? matchValues.reduce((sum, value) => sum + value, 0) / matchValues.length : null
  };
}

export function aggregateEngineResultsByGame(results = []) {
  const grouped = new Map();
  for (const item of results) {
    const gameKey = item?.gameKey;
    if (!gameKey) continue;
    if (!grouped.has(gameKey)) grouped.set(gameKey, []);
    grouped.get(gameKey).push(item);
  }

  return [...grouped.entries()].map(([gameKey, items]) => {
    const losses = items.map(item => item.centipawnLoss).filter(Number.isFinite);
    const matchValues = items.filter(item => typeof item.bestMoveMatches === 'boolean').map(item => item.bestMoveMatches ? 1 : 0);
    return {
      gameKey,
      endTime: items.map(item => Number(item.endTime)).find(Number.isFinite) ?? null,
      positionsScored: items.length,
      medianCpl: median(losses),
      meanCpl: losses.length ? losses.reduce((sum, value) => sum + value, 0) / losses.length : null,
      topMoveMatchRate: matchValues.length ? matchValues.reduce((sum, value) => sum + value, 0) / matchValues.length : null
    };
  }).filter(item => item.positionsScored > 0);
}

function temporalCandidate(ordered, split, minGames) {
  const recent = ordered.slice(0, split);
  const older = ordered.slice(split);
  if (recent.length < minGames || older.length < minGames) return null;
  const recentSummary = summarizeGameSeries(recent);
  const olderSummary = summarizeGameSeries(older);
  const cplShift = recentSummary.medianCpl !== null && olderSummary.medianCpl !== null
    ? recentSummary.medianCpl - olderSummary.medianCpl
    : null;
  const matchRateDelta = recentSummary.topMoveMatchRate !== null && olderSummary.topMoveMatchRate !== null
    ? recentSummary.topMoveMatchRate - olderSummary.topMoveMatchRate
    : null;
  const cplMagnitude = Number.isFinite(cplShift) ? Math.min(1, Math.abs(cplShift) / 50) : 0;
  const matchMagnitude = Number.isFinite(matchRateDelta) ? Math.min(1, Math.abs(matchRateDelta) / 0.5) : 0;
  const score = cplMagnitude * 0.6 + matchMagnitude * 0.4;
  return { split, recent, older, recentSummary, olderSummary, cplShift, matchRateDelta, score };
}

export function summarizeTemporalEngineBaseline(results = [], { minGames = TEMPORAL_MIN_GAMES } = {}) {
  const usable = results.filter(item => Number.isFinite(item.medianCpl) || Number.isFinite(item.meanCpl) || Number.isFinite(item.topMoveMatchRate));
  if (usable.length < minGames * 2) {
    return { status: 'insufficient', recent: null, older: null, cplShift: null, matchRateDelta: null, candidate: null, candidates: [] };
  }

  const ordered = [...usable].sort((a, b) => Number(b.endTime || b.gameEndTime || 0) - Number(a.endTime || a.gameEndTime || 0));
  const candidates = [];
  for (let split = minGames; split <= ordered.length - minGames; split += 1) {
    const candidate = temporalCandidate(ordered, split, minGames);
    if (candidate) candidates.push(candidate);
  }
  candidates.sort((a, b) => b.score - a.score || Math.abs(b.cplShift || 0) - Math.abs(a.cplShift || 0));
  const best = candidates[0];
  if (!best) return { status: 'insufficient', recent: null, older: null, cplShift: null, matchRateDelta: null, candidate: null, candidates: [] };

  return {
    status: 'complete',
    recent: best.recentSummary,
    older: best.olderSummary,
    recentGames: best.recent.length,
    olderGames: best.older.length,
    cplShift: best.cplShift,
    matchRateDelta: best.matchRateDelta,
    candidate: { split: best.split, score: best.score, recentGames: best.recent.length, olderGames: best.older.length, cplShift: best.cplShift, matchRateDelta: best.matchRateDelta },
    candidates: candidates.slice(0, 6).map(item => ({ split: item.split, score: item.score, cplShift: item.cplShift, matchRateDelta: item.matchRateDelta, recentGames: item.recent.length, olderGames: item.older.length }))
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
    const gameKey = normalizedUrl(game) || game.start_time || game.end_time || null;
    const endTime = game.end_time || game.start_time || null;
    for (const position of selected) positions.push({ ...position, gameKey, endTime });
  }
  if (!positions.length) return { status: 'no-positions', sampleSize: sample.length, results: [], gameSummaries: [], summary: summarizeEngineBaseline([]), temporal: summarizeTemporalEngineBaseline([]) };
  const engineResult = await analyzePositions(positions);
  const results = (engineResult?.results || []).map((item, index) => ({ ...item, gameKey: positions[index]?.gameKey || null, endTime: positions[index]?.endTime || null }));
  const gameSummaries = aggregateEngineResultsByGame(results);
  return {
    status: engineResult?.status === 'complete' ? 'complete' : (engineResult?.status || 'unavailable'),
    sampleSize: sample.length,
    positionsRequested: positions.length,
    results,
    gameSummaries,
    summary: summarizeEngineBaseline(results),
    temporal: summarizeTemporalEngineBaseline(gameSummaries)
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
