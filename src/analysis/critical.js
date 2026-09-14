const PIECE_VALUES = { P: 1, N: 3.2, B: 3.3, R: 5, Q: 9, K: 0 };
const BOARD_SIZE = 64;

function decodeKey(key) {
  const [boardPart, turn, castling, ep] = String(key || '').split('/');
  if (!boardPart || boardPart.length !== BOARD_SIZE) return null;
  return {
    board: boardPart.split('').map(piece => piece === '.' ? null : piece),
    turn: turn || 'w',
    castling: castling === '-' ? '' : (castling || ''),
    ep: ep || '-'
  };
}

function fileOf(index) { return index % 8; }
function rankOf(index) { return 8 - Math.floor(index / 8); }
function colorOf(piece) { return piece === piece?.toUpperCase() ? 'w' : 'b'; }
function typeOf(piece) { return piece?.toUpperCase(); }
function inside(file, rank) { return file >= 0 && file < 8 && rank >= 1 && rank <= 8; }
function at(board, file, rank) {
  return inside(file, rank) ? board[(8 - rank) * 8 + file] : null;
}

function pathClear(board, from, to) {
  const ff = fileOf(from), fr = rankOf(from);
  const tf = fileOf(to), tr = rankOf(to);
  const df = Math.sign(tf - ff), dr = Math.sign(tr - fr);
  let f = ff + df, r = fr + dr;
  while (f !== tf || r !== tr) {
    if (board[(8 - r) * 8 + f]) return false;
    f += df; r += dr;
  }
  return true;
}

function attacksSquare(board, from, to) {
  const piece = board[from];
  if (!piece) return false;
  const type = typeOf(piece);
  const pf = fileOf(from), pr = rankOf(from);
  const tf = fileOf(to), tr = rankOf(to);
  const df = tf - pf, dr = tr - pr;
  const af = Math.abs(df), ar = Math.abs(dr);
  if (type === 'P') return ar === 1 && af === 1 && dr === (colorOf(piece) === 'w' ? 1 : -1);
  if (type === 'N') return (af === 1 && ar === 2) || (af === 2 && ar === 1);
  if (type === 'K') return af <= 1 && ar <= 1 && (af + ar > 0);
  if (type === 'B') return af === ar && pathClear(board, from, to);
  if (type === 'R') return (df === 0 || dr === 0) && pathClear(board, from, to);
  if (type === 'Q') return ((df === 0 || dr === 0) || af === ar) && pathClear(board, from, to);
  return false;
}

function kingSquare(board, color) {
  const king = color === 'w' ? 'K' : 'k';
  return board.indexOf(king);
}

function attackCount(board, target, byColor) {
  let count = 0;
  for (let from = 0; from < board.length; from += 1) {
    if (board[from] && colorOf(board[from]) === byColor && attacksSquare(board, from, target)) count += 1;
  }
  return count;
}

function pseudoMoves(board, from) {
  const piece = board[from];
  if (!piece) return 0;
  const color = colorOf(piece);
  const type = typeOf(piece);
  const pf = fileOf(from), pr = rankOf(from);
  let count = 0;

  const consider = (file, rank) => {
    if (!inside(file, rank)) return false;
    const target = at(board, file, rank);
    if (!target || colorOf(target) !== color) count += 1;
    return !target;
  };

  if (type === 'P') {
    const dir = color === 'w' ? 1 : -1;
    const start = color === 'w' ? 2 : 7;
    if (inside(pf, pr + dir) && !at(board, pf, pr + dir)) count += 1;
    if (pr === start && !at(board, pf, pr + dir) && !at(board, pf, pr + 2 * dir)) count += 1;
    for (const df of [-1, 1]) {
      const target = at(board, pf + df, pr + dir);
      if (target && colorOf(target) !== color) count += 1;
    }
    return count;
  }

  if (type === 'N') {
    for (const [df, dr] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]) consider(pf + df, pr + dr);
    return count;
  }

  if (type === 'K') {
    for (let df = -1; df <= 1; df += 1) for (let dr = -1; dr <= 1; dr += 1) if (df || dr) consider(pf + df, pr + dr);
    return count;
  }

  const directions = type === 'B'
    ? [[1,1],[1,-1],[-1,1],[-1,-1]]
    : type === 'R'
      ? [[1,0],[-1,0],[0,1],[0,-1]]
      : [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  for (const [df, dr] of directions) {
    let file = pf + df, rank = pr + dr;
    while (inside(file, rank)) {
      const target = at(board, file, rank);
      if (!target) count += 1;
      else {
        if (colorOf(target) !== color) count += 1;
        break;
      }
      file += df;
      rank += dr;
    }
  }
  return count;
}

function mobility(board, color) {
  let count = 0;
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] && colorOf(board[i]) === color) count += pseudoMoves(board, i);
  }
  return count;
}

function material(board, color) {
  return board.reduce((sum, piece) => piece && colorOf(piece) === color ? sum + (PIECE_VALUES[typeOf(piece)] || 0) : sum, 0);
}

function adjacentPawnTension(board) {
  let tension = 0;
  for (let i = 0; i < board.length; i += 1) {
    const piece = board[i];
    if (!piece || typeOf(piece) !== 'P') continue;
    const file = fileOf(i), rank = rankOf(i);
    const enemy = colorOf(piece) === 'w' ? 'b' : 'w';
    const enemyRank = rank + (colorOf(piece) === 'w' ? 1 : -1);
    for (const df of [-1, 1]) {
      const target = at(board, file + df, enemyRank);
      if (target && colorOf(target) === enemy && typeOf(target) === 'P') tension += 1;
    }
  }
  return tension;
}

function moveFlags(san) {
  return {
    capture: /x/.test(san),
    check: /[+#]$/.test(san),
    promotion: /=/.test(san),
    castle: /^(O-O|O-O-O|0-0|0-0-0)/.test(san)
  };
}

function scoreFeatures({ before, after, san, ply }) {
  const flags = moveFlags(san);
  const beforeWhite = material(before.board, 'w');
  const beforeBlack = material(before.board, 'b');
  const afterWhite = material(after.board, 'w');
  const afterBlack = material(after.board, 'b');
  const materialSwing = Math.abs((afterWhite - afterBlack) - (beforeWhite - beforeBlack));
  const mover = before.turn;
  const opponent = mover === 'w' ? 'b' : 'w';
  const moverKing = kingSquare(before.board, mover);
  const kingAttacks = moverKing >= 0 ? attackCount(before.board, moverKing, opponent) : 0;
  const candidateCount = mobility(before.board, mover);
  const opponentMobility = mobility(before.board, opponent);
  const tension = adjacentPawnTension(before.board);

  let score = 0;
  const reasons = [];
  if (flags.check) { score += 22; reasons.push('check or mate'); }
  if (flags.promotion) { score += 30; reasons.push('promotion'); }
  if (flags.capture) { score += 14; reasons.push('capture'); }
  if (materialSwing >= 2) { score += Math.min(18, Math.round(materialSwing * 4)); reasons.push('material swing'); }
  if (kingAttacks >= 2) { score += 16; reasons.push('king under multiple attacks'); }
  else if (kingAttacks === 1) { score += 7; reasons.push('king pressure'); }
  if (candidateCount <= 4) { score += 7; reasons.push('forcing position'); }
  else if (candidateCount >= 18) { score += 12; reasons.push('high-choice position'); }
  else if (candidateCount >= 9) { score += 8; reasons.push('multiple plausible choices'); }
  if (opponentMobility >= 25) { score += 5; reasons.push('volatile opponent position'); }
  if (tension >= 2) { score += 5; reasons.push('pawn tension'); }
  if (ply >= 16 && ply <= 100) score += 3;
  if (flags.castle) score = Math.max(0, score - 8);

  const difficulty = Math.max(0, Math.min(100, Math.round(score)));
  const classification = difficulty >= 60 ? 'critical' : difficulty >= 42 ? 'notable' : 'routine';
  return {
    difficulty,
    classification,
    reasons: [...new Set(reasons)],
    candidateCount,
    opponentMobility,
    kingAttacks,
    materialSwing: Math.round(materialSwing * 10) / 10,
    mover
  };
}

export async function detectCriticalPositions(pgn = '', focusColor = null, limit = 12) {
  const { positionFingerprints } = await import('./chess-position.js');
  const fingerprints = positionFingerprints(pgn);
  const scored = [];
  for (const item of fingerprints) {
    if (focusColor && (item.ply % 2 === 1 ? 'w' : 'b') !== focusColor) continue;
    const before = decodeKey(item.before);
    const after = decodeKey(item.after);
    if (!before || !after) continue;
    const features = scoreFeatures({ before, after, san: item.san, ply: item.ply });
    scored.push({
      ply: item.ply,
      moveNumber: Math.ceil(item.ply / 2),
      san: item.san,
      move: item.move,
      before: item.before,
      after: item.after,
      ...features
    });
  }
  scored.sort((a, b) => b.difficulty - a.difficulty || a.ply - b.ply);

  const selected = [];
  for (const item of scored) {
    const tooClose = selected.some(existing => Math.abs(existing.ply - item.ply) <= 2);
    if (tooClose) continue;
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return {
    analyzedPlies: fingerprints.length,
    focusColor,
    candidates: scored,
    selected
  };
}
