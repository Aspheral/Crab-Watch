import { positionFingerprints } from './chess-position.js';

const PIECE_VALUES = { P: 1, N: 3, B: 3.25, R: 5, Q: 9, K: 0 };
const MIN_SIMILARITY = 0.82;
const MAX_MATCHES = 24;

function decode(fingerprint) {
  const [boardPart, turn, castling, ep] = String(fingerprint || '').split('/');
  if (!boardPart || boardPart.length !== 64) return null;
  return { board: boardPart.split('').map(piece => piece === '.' ? null : piece), turn: turn || 'w', castling: castling === '-' ? '' : castling || '', ep: ep || '-' };
}

function color(piece) { return piece === piece?.toUpperCase() ? 'w' : 'b'; }
function type(piece) { return piece?.toUpperCase(); }
function fileOf(index) { return index % 8; }
function rankOf(index) { return 8 - Math.floor(index / 8); }

function materialSignature(board) {
  const totals = { w: 0, b: 0 };
  const counts = { w: {}, b: {} };
  for (const piece of board) {
    if (!piece) continue;
    const side = color(piece);
    const kind = type(piece);
    totals[side] += PIECE_VALUES[kind] || 0;
    counts[side][kind] = (counts[side][kind] || 0) + 1;
  }
  return {
    totals: [Math.round(totals.w * 10) / 10, Math.round(totals.b * 10) / 10],
    counts: ['P','N','B','R','Q'].map(kind => `${counts.w[kind] || 0}${counts.b[kind] || 0}`).join('')
  };
}

function pawnSkeleton(board) {
  const white = [];
  const black = [];
  for (let i = 0; i < board.length; i += 1) {
    if (type(board[i]) !== 'P') continue;
    const value = `${fileOf(i)}${rankOf(i)}`;
    (color(board[i]) === 'w' ? white : black).push(value);
  }
  return `${white.sort().join('.')}/${black.sort().join('.')}`;
}

function kingZone(board, side) {
  const king = side === 'w' ? 'K' : 'k';
  const index = board.indexOf(king);
  if (index < 0) return '-';
  const file = fileOf(index), rank = rankOf(index);
  return `${Math.floor(file / 2)}${Math.floor((rank - 1) / 2)}`;
}

function structuralFeatures(fingerprint) {
  const decoded = decode(fingerprint);
  if (!decoded) return null;
  const material = materialSignature(decoded.board);
  return {
    turn: decoded.turn,
    castling: decoded.castling,
    material,
    pawnSkeleton: pawnSkeleton(decoded.board),
    kingZones: `${kingZone(decoded.board, 'w')}/${kingZone(decoded.board, 'b')}`
  };
}

function sequenceSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  if (a === b) return 1;
  const chars = Math.max(a.length, b.length);
  let same = 0;
  for (let i = 0; i < chars; i += 1) if (a[i] === b[i]) same += 1;
  return chars ? same / chars : 0;
}

export function structuralSimilarity(a, b) {
  const left = structuralFeatures(a);
  const right = structuralFeatures(b);
  if (!left || !right || left.turn !== right.turn) return 0;

  let score = 0;
  let weight = 0;

  const materialTotalDiff = Math.abs(left.material.totals[0] - right.material.totals[0]) + Math.abs(left.material.totals[1] - right.material.totals[1]);
  const materialScore = Math.max(0, 1 - materialTotalDiff / 8);
  score += materialScore * 0.30;
  weight += 0.30;

  const pieceScore = left.material.counts === right.material.counts ? 1 : sequenceSimilarity(left.material.counts, right.material.counts);
  score += pieceScore * 0.16;
  weight += 0.16;

  const pawnScore = sequenceSimilarity(left.pawnSkeleton, right.pawnSkeleton);
  score += pawnScore * 0.25;
  weight += 0.25;

  const kingScore = left.kingZones === right.kingZones ? 1 : 0.5;
  score += kingScore * 0.12;
  weight += 0.12;

  const castlingScore = left.castling === right.castling ? 1 : 0;
  score += castlingScore * 0.08;
  weight += 0.08;

  const turnScore = left.turn === right.turn ? 1 : 0;
  score += turnScore * 0.09;
  weight += 0.09;

  return weight ? score / weight : 0;
}

function moveTypeFromSan(san) {
  const stripped = String(san || '').replace(/^[+#?!]+|[+#?!]+$/g, '');
  return /^[KQRBN]/.test(stripped) ? stripped[0] : 'P';
}

function moveGeometry(move) {
  if (!move?.from || !move?.to || move.from.length !== 2 || move.to.length !== 2) return null;
  const fileDelta = move.to.charCodeAt(0) - move.from.charCodeAt(0);
  const rankDelta = Number(move.to[1]) - Number(move.from[1]);
  return { fileDelta, rankDelta, distance: Math.max(Math.abs(fileDelta), Math.abs(rankDelta)) };
}

export function decisionSimilarity(currentMove, currentSan, historicalMove, historicalSan) {
  if (!currentMove || !historicalMove) return 0;
  const currentGeometry = moveGeometry(currentMove);
  const historicalGeometry = moveGeometry(historicalMove);
  if (!currentGeometry || !historicalGeometry) return 0;

  const origin = currentMove.from === historicalMove.from ? 1 : 0;
  const destination = currentMove.to === historicalMove.to ? 1 : 0;
  const promotion = (currentMove.promotion || null) === (historicalMove.promotion || null) ? 1 : 0;
  const geometry = currentGeometry.fileDelta === historicalGeometry.fileDelta && currentGeometry.rankDelta === historicalGeometry.rankDelta ? 1 : currentGeometry.distance === historicalGeometry.distance ? 0.65 : 0;
  const currentCapture = /x/.test(String(currentSan || ''));
  const historicalCapture = /x/.test(String(historicalSan || ''));
  const capture = currentCapture === historicalCapture ? 1 : 0;
  const piece = moveTypeFromSan(currentSan) === moveTypeFromSan(historicalSan) ? 1 : 0;

  return origin * 0.20 + destination * 0.30 + promotion * 0.10 + geometry * 0.20 + capture * 0.10 + piece * 0.10;
}

function openingDiscount(ply) {
  if (ply <= 12) return 0.70;
  if (ply <= 20) return 0.85;
  return 1;
}

export function findSimilarDecisions(currentFingerprint, historicalGames = [], username, { minSimilarity = MIN_SIMILARITY, maxMatches = MAX_MATCHES, currentMove = null, currentSan = null } = {}) {
  const current = decode(currentFingerprint);
  if (!current) return [];

  const matches = [];
  for (const game of historicalGames) {
    if (!game?.pgn) continue;
    const color = username?.toLowerCase() === game?.white?.username?.toLowerCase() ? 'w' : username?.toLowerCase() === game?.black?.username?.toLowerCase() ? 'b' : null;
    if (!color) continue;

    let fingerprints = [];
    try { fingerprints = positionFingerprints(game.pgn); } catch { continue; }
    for (const position of fingerprints) {
      const mover = position.ply % 2 === 1 ? 'w' : 'b';
      if (mover !== color) continue;
      const similarity = structuralSimilarity(currentFingerprint, position.before);
      const adjusted = similarity * openingDiscount(position.ply);
      if (adjusted < minSimilarity) continue;
      const decisionScore = decisionSimilarity(currentMove, currentSan, position.move, position.san);
      matches.push({
        gameUrl: game.url || null,
        gameId: game.url?.split('/').pop() || null,
        ply: position.ply,
        moveNumber: position.moveNumber,
        san: position.san,
        move: position.move,
        before: position.before,
        similarity,
        adjustedSimilarity: adjusted,
        decisionSimilarity: decisionScore,
        decisionAgreement: currentMove ? decisionScore >= 0.75 : null,
        result: game[color]?.result || null,
        endTime: game.end_time || null
      });
    }
  }

  matches.sort((a, b) => (b.decisionSimilarity - a.decisionSimilarity) || (b.adjustedSimilarity - a.adjustedSimilarity) || a.ply - b.ply);
  return matches.slice(0, maxMatches);
}
