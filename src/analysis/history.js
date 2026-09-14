import { positionFingerprints } from './chess-position.js';

function gameFor(username, game) {
  const lower = username.toLowerCase();
  const white = game?.white?.username?.toLowerCase();
  const black = game?.black?.username?.toLowerCase();
  return white === lower ? 'white' : black === lower ? 'black' : null;
}

function scoreFor(game, side) {
  const direct = game?.[side]?.result;
  if (direct === 'win') return 1;
  if (direct === 'loss') return 0;
  if (direct === 'agreed' || direct === 'repetition' || direct === 'stalemate' || direct === 'insufficient' || direct === '50move') return 0.5;
  if (game?.result === '1-0') return side === 'white' ? 1 : 0;
  if (game?.result === '0-1') return side === 'black' ? 1 : 0;
  if (game?.result === '1/2-1/2') return 0.5;
  return null;
}

function pgnMoves(pgn = '') {
  const body = pgn.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\([^)]*\)/g, ' ');
  return body.replace(/1-0|0-1|1\/2-1\/2|\*/g, ' ').split(/\s+/)
    .map(token => token.replace(/^\d+\.(\.\.)?/, '').replace(/^\.+/, '').trim())
    .filter(token => token && !/^\d+$/.test(token) && !/^\$\d+$/.test(token));
}

function median(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

function exactOpeningPatterns(games, username, plies = 12) {
  const positions = Array.from({ length: plies }, () => new Map());
  let usable = 0;
  for (const game of games) {
    const side = gameFor(username, game);
    if (!side || !game?.pgn) continue;
    const moves = pgnMoves(game.pgn);
    if (!moves.length) continue;
    usable += 1;
    for (let ply = 0; ply < Math.min(plies, moves.length); ply += 1) {
      const move = moves[ply];
      const map = positions[ply];
      map.set(move, (map.get(move) || 0) + 1);
    }
  }
  return positions.map(map => {
    let top = null;
    for (const [move, count] of map) if (!top || count > top.count) top = { move, count };
    return top ? { ...top, share: usable ? top.count / usable : 0 } : null;
  });
}

function exactPositionDecisions(games, username) {
  const positions = new Map();
  let usableGames = 0;
  for (const game of games) {
    const side = gameFor(username, game);
    if (!side || !game?.pgn) continue;
    const fingerprints = positionFingerprints(game.pgn);
    if (!fingerprints.length) continue;
    usableGames += 1;
    const playerColor = side === 'white' ? 'w' : 'b';
    for (const item of fingerprints) {
      const moverColor = item.ply % 2 === 1 ? 'w' : 'b';
      if (moverColor !== playerColor) continue;
      const entry = positions.get(item.before) || { total: 0, moves: new Map() };
      entry.total += 1;
      entry.moves.set(item.san, (entry.moves.get(item.san) || 0) + 1);
      positions.set(item.before, entry);
    }
  }
  const repeated = [];
  for (const [key, entry] of positions) {
    if (entry.total < 3) continue;
    let top = null;
    for (const [move, count] of entry.moves) if (!top || count > top.count) top = { move, count };
    if (top) repeated.push({ position: key, occurrences: entry.total, move: top.move, share: top.count / entry.total });
  }
  repeated.sort((a, b) => (b.share * b.occurrences) - (a.share * a.occurrences));
  return { uniquePositions: positions.size, repeated: repeated.slice(0, 100), usableGames };
}

function currentPositionDecisions(username, currentGame, repeated) {
  if (!currentGame?.pgn) return [];
  const side = gameFor(username, currentGame);
  if (!side) return [];
  const playerColor = side === 'white' ? 'w' : 'b';
  const current = positionFingerprints(currentGame.pgn);
  const repeatedMap = new Map(repeated.map(item => [item.position, item]));
  return current.filter(item => (item.ply % 2 === 1 ? 'w' : 'b') === playerColor)
    .map(item => {
      const match = repeatedMap.get(item.before);
      return match ? { ...match, currentMove: item.san, sameMove: match.move === item.san } : null;
    }).filter(Boolean);
}

export function analyzeAccountHistory(username, games) {
  const recent = Array.isArray(games) ? games.slice(0, 300) : [];
  const ratings = [];
  const results = { wins: 0, losses: 0, draws: 0 };
  const performance = [];
  const dates = [];
  let rated = 0;
  for (const game of recent) {
    const side = gameFor(username, game);
    if (!side) continue;
    const player = game[side];
    if (Number.isFinite(Number(player?.rating))) ratings.push(Number(player.rating));
    if (game.end_time) dates.push(Number(game.end_time));
    if (game.rated !== false) rated += 1;
    const score = scoreFor(game, side);
    if (score === 1) results.wins += 1;
    else if (score === 0) results.losses += 1;
    else if (score === 0.5) results.draws += 1;
    if (score !== null && Number.isFinite(Number(player?.rating))) performance.push({ rating: Number(player.rating), score });
  }
  const chronological = [...recent].reverse();
  const ratingSeries = chronological.map(game => {
    const side = gameFor(username, game);
    const rating = Number(game?.[side]?.rating);
    return Number.isFinite(rating) ? rating : null;
  }).filter(Boolean);
  const firstRating = ratingSeries[0] ?? null;
  const lastRating = ratingSeries.at(-1) ?? null;
  const ratingDelta = firstRating !== null && lastRating !== null ? lastRating - firstRating : null;
  const firstGameTime = dates.length ? Math.min(...dates) : null;
  const lastGameTime = dates.length ? Math.max(...dates) : null;
  return {
    gameCount: recent.length, ratedGames: rated, results,
    winRate: results.wins + results.losses + results.draws ? results.wins / (results.wins + results.losses + results.draws) : null,
    medianRating: median(ratings), firstRating, lastRating, ratingDelta,
    firstGameTime, lastGameTime,
    accountSpanDays: firstGameTime && lastGameTime ? (lastGameTime - firstGameTime) / 86400 : null,
    openingPatterns: exactOpeningPatterns(recent, username),
    repeatedDecisions: exactPositionDecisions(recent, username),
    ratedSampleSize: performance.length
  };
}

export function compareCurrentGameToHistory(username, currentGame, history) {
  const side = gameFor(username, currentGame);
  const currentRating = Number(currentGame?.[side]?.rating);
  const currentMoves = pgnMoves(currentGame?.pgn || '');
  const stats = analyzeAccountHistory(username, history);
  const observations = [];
  const currentRepeated = currentPositionDecisions(username, currentGame, stats.repeatedDecisions.repeated);
  const repeatedSame = currentRepeated.filter(item => item.sameMove && item.share >= 0.8 && item.occurrences >= 3);

  if (stats.gameCount >= 350) observations.push({ kind: 'large-history', strength: 'context', text: 'The account has a large public game history. Account longevity is contextual evidence, not an innocence guarantee.' });
  if (stats.ratingDelta !== null && Math.abs(stats.ratingDelta) >= 400) observations.push({ kind: 'rating-change', strength: 'context', text: `The sampled history spans a rating change of about ${Math.round(Math.abs(stats.ratingDelta))} points.` });
  if (currentRating && stats.medianRating && Math.abs(currentRating - stats.medianRating) >= 250) observations.push({ kind: 'rating-context', strength: 'moderate', text: 'The current game rating is notably different from the player’s recent median.' });

  const meaningfulOpeningPatterns = stats.openingPatterns.filter(pattern => pattern?.share >= 0.85);
  if (meaningfulOpeningPatterns.length >= 3) observations.push({ kind: 'repeated-opening', strength: 'low', text: 'The player repeatedly chooses the same early moves in much of the recent sample. Opening repetition is expected and is not treated as cheating evidence by itself.' });
  if (repeatedSame.length) observations.push({ kind: 'exact-position-repeat', strength: 'low', text: `${repeatedSame.length} decision${repeatedSame.length === 1 ? '' : 's'} in the completed game match a recurring position-and-move pattern from the recent history.` });
  if (currentMoves.length < 4) observations.push({ kind: 'short-game', strength: 'context', text: 'The completed game is too short for a deep behavioral comparison.' });

  return { stats, current: { repeatedPositionMatches: currentRepeated, exactSameMoveMatches: repeatedSame }, observations };
}
