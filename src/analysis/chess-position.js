const FILES = 'abcdefgh';
const START = [
  'rnbqkbnr','pppppppp','........','........',
  '........','........','PPPPPPPP','RNBQKBNR'
].join('/');

function index(file, rank) { return (8 - rank) * 8 + file; }
function fileOf(i) { return i % 8; }
function rankOf(i) { return 8 - Math.floor(i / 8); }
function pieceColor(piece) { return piece === piece.toUpperCase() ? 'w' : 'b'; }
function typeOf(piece) { return piece.toUpperCase(); }

export class ChessPosition {
  constructor() {
    this.board = START.split('/').join('').split('').map(x => x === '.' ? null : x);
    this.turn = 'w';
    this.castling = 'KQkq';
    this.ep = '-';
    this.halfmove = 0;
    this.fullmove = 1;
  }

  clone() {
    const next = Object.create(ChessPosition.prototype);
    next.board = [...this.board];
    next.turn = this.turn;
    next.castling = this.castling;
    next.ep = this.ep;
    next.halfmove = this.halfmove;
    next.fullmove = this.fullmove;
    return next;
  }

  key() {
    return `${this.board.map(p => p || '.').join('')}/${this.turn}/${this.castling || '-'}/${this.ep}`;
  }

  pieceAt(square) {
    const file = FILES.indexOf(square[0]);
    const rank = Number(square[1]);
    return file >= 0 && rank >= 1 && rank <= 8 ? this.board[index(file, rank)] : null;
  }

  setPiece(square, piece) {
    const file = FILES.indexOf(square[0]);
    const rank = Number(square[1]);
    if (file >= 0 && rank >= 1 && rank <= 8) this.board[index(file, rank)] = piece;
  }

  pathClear(from, to) {
    const ff = fileOf(from), fr = rankOf(from);
    const tf = fileOf(to), tr = rankOf(to);
    const df = Math.sign(tf - ff), dr = Math.sign(tr - fr);
    let f = ff + df, r = fr + dr;
    while (f !== tf || r !== tr) {
      if (this.board[index(f, r)]) return false;
      f += df; r += dr;
    }
    return true;
  }

  canReach(from, to, piece, capture) {
    const pf = fileOf(from), pr = rankOf(from);
    const tf = fileOf(to), tr = rankOf(to);
    const df = tf - pf, dr = tr - pr;
    const absF = Math.abs(df), absR = Math.abs(dr);
    const pawnDir = pieceColor(piece) === 'w' ? 1 : -1;
    const startRank = pieceColor(piece) === 'w' ? 2 : 7;
    switch (typeOf(piece)) {
      case 'N': return (absF === 1 && absR === 2) || (absF === 2 && absR === 1);
      case 'K': return absF <= 1 && absR <= 1;
      case 'B': return absF === absR && this.pathClear(from, to);
      case 'R': return (df === 0 || dr === 0) && this.pathClear(from, to);
      case 'Q': return ((df === 0 || dr === 0) || absF === absR) && this.pathClear(from, to);
      case 'P':
        if (capture) return absF === 1 && dr === pawnDir;
        if (df !== 0) return false;
        if (dr === pawnDir && !this.board[to]) return true;
        return dr === 2 * pawnDir && pr === startRank && !this.board[to] && !this.board[index(pf, pr + pawnDir)];
      default: return false;
    }
  }

  findCandidates(pieceType, destination, disambiguation, capture) {
    const to = FILES.indexOf(destination[0]) >= 0 ? index(FILES.indexOf(destination[0]), Number(destination[1])) : -1;
    if (to < 0) return [];
    const candidates = [];
    for (let from = 0; from < 64; from += 1) {
      const piece = this.board[from];
      if (!piece || pieceColor(piece) !== this.turn || typeOf(piece) !== pieceType) continue;
      const square = FILES[fileOf(from)] + rankOf(from);
      if (disambiguation && !disambiguation.includes(square) && !disambiguation.includes(square[0]) && !disambiguation.includes(square[1])) continue;
      if (this.canReach(from, to, piece, capture)) candidates.push(from);
    }
    return candidates;
  }

  moveSan(raw) {
    const san = raw.replace(/[!?+#]+$/g, '').trim();
    if (!san) return null;

    if (san === 'O-O' || san === '0-0') return this.castle(false);
    if (san === 'O-O-O' || san === '0-0-0') return this.castle(true);

    const promotionMatch = san.match(/=([QRBN])/i);
    const promotion = promotionMatch ? promotionMatch[1].toUpperCase() : null;
    const body = san.replace(/=([QRBN])/i, '');
    const destinationMatch = body.match(/([a-h][1-8])$/i);
    if (!destinationMatch) return null;
    const destination = destinationMatch[1].toLowerCase();
    const to = index(FILES.indexOf(destination[0]), Number(destination[1]));
    const pieceType = /^[KQRBN]/.test(body) ? body[0] : 'P';
    const prefix = body.slice(pieceType === 'P' ? 0 : 1, body.length - 2);
    const capture = body.includes('x');
    const disambiguation = prefix.replace('x', '');
    const candidates = this.findCandidates(pieceType, destination, disambiguation, capture);
    if (!candidates.length) return null;

    const from = candidates[0];
    const piece = this.board[from];
    const captured = this.board[to];
    this.board[to] = promotion ? (pieceColor(piece) === 'w' ? promotion : promotion.toLowerCase()) : piece;
    this.board[from] = null;

    // En-passant capture.
    if (pieceType === 'P' && capture && !captured && destination === this.ep) {
      const capturedRank = Number(destination[1]) + (pieceColor(piece) === 'w' ? -1 : 1);
      this.board[index(FILES.indexOf(destination[0]), capturedRank)] = null;
    }

    this.updateCastling(from, to, piece);
    this.ep = '-';
    if (pieceType === 'P' && Math.abs(rankOf(to) - rankOf(from)) === 2) {
      this.ep = FILES[fileOf(from)] + ((rankOf(from) + rankOf(to)) / 2);
    }
    this.halfmove = pieceType === 'P' || captured ? 0 : this.halfmove + 1;
    if (this.turn === 'b') this.fullmove += 1;
    this.turn = this.turn === 'w' ? 'b' : 'w';
    return { san, from: FILES[fileOf(from)] + rankOf(from), to: destination, piece: pieceType };
  }

  castle(long) {
    const white = this.turn === 'w';
    const rank = white ? 1 : 8;
    const kingFrom = index(4, rank);
    const rookFrom = index(long ? 0 : 7, rank);
    const kingTo = index(long ? 2 : 6, rank);
    const rookTo = index(long ? 3 : 5, rank);
    this.board[kingTo] = this.board[kingFrom];
    this.board[kingFrom] = null;
    this.board[rookTo] = this.board[rookFrom];
    this.board[rookFrom] = null;
    this.castling = this.castling.replace(white ? /K|Q/g : /k|q/g, '');
    this.ep = '-';
    this.halfmove += 1;
    if (!white) this.fullmove += 1;
    this.turn = white ? 'b' : 'w';
    return { san: long ? 'O-O-O' : 'O-O', from: FILES[4] + rank, to: FILES[fileOf(kingTo)] + rank, piece: 'K' };
  }

  updateCastling(from, to, piece) {
    const square = i => FILES[fileOf(i)] + rankOf(i);
    if (typeOf(piece) === 'K') this.castling = this.castling.replace(pieceColor(piece) === 'w' ? /K|Q/g : /k|q/g, '');
    if (square(from) === 'a1' || square(to) === 'a1') this.castling = this.castling.replace('Q', '');
    if (square(from) === 'h1' || square(to) === 'h1') this.castling = this.castling.replace('K', '');
    if (square(from) === 'a8' || square(to) === 'a8') this.castling = this.castling.replace('q', '');
    if (square(from) === 'h8' || square(to) === 'h8') this.castling = this.castling.replace('k', '');
  }
}

export function positionFingerprints(pgn = '') {
  const body = pgn.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\([^)]*\)/g, ' ');
  const tokens = body
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, ' ')
    .split(/\s+/)
    .map(token => token.replace(/^\d+\.(\.\.)?/, '').replace(/^\.+/, '').trim())
    .filter(token => token && !/^\d+$/.test(token) && !/^\$\d+$/.test(token));

  const chess = new ChessPosition();
  const out = [];
  for (const san of tokens) {
    const before = chess.key();
    const move = chess.moveSan(san);
    if (!move) break;
    out.push({ ply: out.length + 1, before, after: chess.key(), san, move });
  }
  return out;
}
