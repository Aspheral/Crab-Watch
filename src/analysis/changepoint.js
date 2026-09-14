import { analyzeTiming } from './timing.js';

export const MIN_SEGMENT_GAMES = 8;
export const MIN_SHIFT_GAMES = 5;
export const MIN_TIMING_GAMES = 5;

function finite(values) {
  return values.filter(Number.isFinite);
}

function mean(values) {
  const data = finite(values);
  return data.length ? data.reduce((sum, value) => sum + value, 0) / data.length : null;
}

function median(values) {
  const data = finite(values).sort((a, b) => a - b);
  if (!data.length) return null;
  const middle = Math.floor(data.length / 2);
  return data.length % 2 ? data[middle] : (data[middle - 1] + data[middle]) / 2;
}

function sideFor(game, username) {
  const lower = username?.toLowerCase();
  if (!lower) return null;
  if (game?.white?.username?.toLowerCase() === lower) return { side: game.white, color: 'w' };
  if (game?.black?.username?.toLowerCase() === lower) return { side: game.black, color: 'b' };
  return null;
}

function ratingOf(game, username) {
  const side = sideFor(game, username)?.side;
  return Number.isFinite(Number(side?.rating)) ? Number(side.rating) : null;
}

function winValue(game, username) {
  const side = sideFor(game, username)?.side;
  if (!side) return null;
  if (side.result === 'win') return 1;
  if (side.result === 'draw') return 0.5;
  if (side.result === 'checkmated' || side.result === 'timeout' || side.result === 'resigned' || side.result === 'abandoned') return 0;
  return null;
}

function gameMetric(game, username) {
  const side = sideFor(game, username);
  const rating = ratingOf(game, username);
  const result = winValue(game, username);
  const pgn = String(game?.pgn || '');
  const clock = pgn.match(/\[%clk\s+([^\]]+)\]/gi);
  const moveCount = pgn
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .match(/\b(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h]x?[a-h]?[1-8](?:=[QRBN])?[+#]?)\b/g);
  const timing = side ? analyzeTiming(pgn, side.color) : null;
  return {
    rating,
    result,
    clockCount: clock?.length || 0,
    moves: moveCount?.length || 0,
    timing,
    timedMoves: timing?.timedMoves || 0,
    veryFastShare: timing?.veryFastShare ?? null,
    medianSeconds: timing?.medianSeconds ?? null
  };
}

function segmentAverage(values, start, end) {
  return mean(values.slice(start, end));
}

function timingSegmentStats(metrics, start, end) {
  const segment = metrics.slice(start, end).filter(item => item.timedMoves >= 2 && Number.isFinite(item.veryFastShare));
  if (segment.length < MIN_TIMING_GAMES) {
    return { gameCount: segment.length, veryFastShare: null, medianSeconds: null };
  }
  return {
    gameCount: segment.length,
    veryFastShare: mean(segment.map(item => item.veryFastShare)),
    medianSeconds: median(segment.map(item => item.medianSeconds))
  };
}

export function detectChangePoint(games = [], username, { minSegmentGames = MIN_SEGMENT_GAMES } = {}) {
  const ordered = [...games].sort((a, b) => Number(b.end_time || b.start_time || 0) - Number(a.end_time || a.start_time || 0));
  if (ordered.length < minSegmentGames * 2) {
    return { status: 'insufficient', sampleSize: ordered.length, candidate: null, metrics: [] };
  }

  const metrics = ordered.map(game => ({ game, ...gameMetric(game, username) }));
  const ratingSeries = metrics.map(item => item.rating);
  const resultSeries = metrics.map(item => item.result);
  const moveSeries = metrics.map(item => item.moves);
  const candidates = [];

  for (let split = minSegmentGames; split <= metrics.length - minSegmentGames; split += 1) {
    const recentRating = segmentAverage(ratingSeries, 0, split);
    const olderRating = segmentAverage(ratingSeries, split, metrics.length);
    const recentResult = segmentAverage(resultSeries, 0, split);
    const olderResult = segmentAverage(resultSeries, split, metrics.length);
    const recentMoves = segmentAverage(moveSeries, 0, split);
    const olderMoves = segmentAverage(moveSeries, split, metrics.length);
    const ratingShift = recentRating !== null && olderRating !== null ? recentRating - olderRating : null;
    const resultShift = recentResult !== null && olderResult !== null ? recentResult - olderResult : null;
    const moveShift = recentMoves !== null && olderMoves !== null ? recentMoves - olderMoves : null;

    const recentTiming = timingSegmentStats(metrics, 0, split);
    const olderTiming = timingSegmentStats(metrics, split, metrics.length);
    const timingShift = recentTiming.veryFastShare !== null && olderTiming.veryFastShare !== null
      ? recentTiming.veryFastShare - olderTiming.veryFastShare
      : null;
    const medianTimeShift = recentTiming.medianSeconds !== null && olderTiming.medianSeconds !== null
      ? recentTiming.medianSeconds - olderTiming.medianSeconds
      : null;

    let score = 0;
    const reasons = [];
    if (ratingShift !== null && Math.abs(ratingShift) >= 150) {
      score += Math.min(45, Math.round(Math.abs(ratingShift) / 10));
      reasons.push(`rating shift ${Math.round(ratingShift)} points`);
    }
    if (resultShift !== null && Math.abs(resultShift) >= 0.18) {
      score += Math.min(30, Math.round(Math.abs(resultShift) * 100));
      reasons.push(`score-rate shift ${Math.round(resultShift * 100)} percentage points`);
    }
    if (moveShift !== null && Math.abs(moveShift) >= 8) {
      score += Math.min(20, Math.round(Math.abs(moveShift)));
      reasons.push(`game-length shift ${Math.round(moveShift)} plies`);
    }
    if (timingShift !== null && Math.abs(timingShift) >= 0.15) {
      score += Math.min(15, Math.round(Math.abs(timingShift) * 50));
      reasons.push(`very-fast move-share shift ${Math.round(timingShift * 100)} percentage points`);
    }

    if (score > 0) {
      candidates.push({
        split,
        score,
        ratingShift,
        resultShift,
        moveShift,
        timingShift,
        medianTimeShift,
        timedGamesRecent: recentTiming.gameCount,
        timedGamesOlder: olderTiming.gameCount,
        reasons
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.split - b.split);
  const best = candidates[0] || null;
  const sustained = best ? Math.min(best.split, metrics.length - best.split) >= MIN_SHIFT_GAMES : false;

  return {
    status: best && sustained ? 'complete' : 'no-sustained-change',
    sampleSize: ordered.length,
    candidate: best && sustained ? {
      gamesBefore: metrics.length - best.split,
      gamesAfter: best.split,
      ...best
    } : null,
    metrics: candidates.slice(0, 12),
    baseline: {
      recentGames: best?.split || 0,
      recentMedianRating: best ? median(ratingSeries.slice(0, best.split)) : null,
      olderMedianRating: best ? median(ratingSeries.slice(best.split)) : null
    }
  };
}
