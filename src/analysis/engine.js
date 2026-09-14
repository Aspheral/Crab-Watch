const STOCKFISH_PATH = 'vendor/stockfish/stockfish-18-lite-single.js';
const DEFAULT_DEPTH = 15;
const MAX_POSITIONS = 8;

export function fingerprintToFen(fingerprint) {
  const [boardPart, turn, castling, ep] = String(fingerprint || '').split('/');
  if (!boardPart || boardPart.length !== 64) throw new Error('Invalid position fingerprint.');
  const rows = [];
  for (let rank = 0; rank < 8; rank += 1) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = boardPart[rank * 8 + file];
      if (piece === '.') empty += 1;
      else {
        if (empty) row += String(empty);
        empty = 0;
        row += piece;
      }
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  return `${rows.join('/')} ${turn || 'w'} ${castling && castling !== '-' ? castling : '-'} ${ep || '-'} 0 1`;
}

function toCp(score) {
  if (!score) return null;
  if (score.type === 'mate') return score.value >= 0 ? 100000 : -100000;
  return Number.isFinite(score.value) ? score.value : null;
}

export function parseBestmove(line) {
  return String(line || '').match(/^bestmove\s+(\S+)/)?.[1] || null;
}

export function parseInfoScore(line) {
  const mate = String(line || '').match(/\bscore\s+mate\s+(-?\d+)/);
  if (mate) return { type: 'mate', value: Number(mate[1]) };
  const cp = String(line || '').match(/\bscore\s+cp\s+(-?\d+)/);
  if (cp) return { type: 'cp', value: Number(cp[1]) };
  return null;
}

export function scoreLoss(bestScore, playedScore) {
  const best = toCp(bestScore);
  const played = toCp(playedScore);
  if (best === null || played === null) return null;
  return Math.max(0, Math.round(best - played));
}

export async function analyzeWithEngine({ positions, depth = DEFAULT_DEPTH, maxPositions = MAX_POSITIONS } = {}) {
  const selected = (Array.isArray(positions) ? positions : []).slice(0, maxPositions);
  if (!selected.length) return { status: 'no-positions', engine: 'Stockfish 18 lite single-threaded', results: [] };
  const response = await chrome.runtime.sendMessage({
    type: 'ENGINE_ANALYZE_POSITIONS',
    target: 'offscreen',
    path: STOCKFISH_PATH,
    depth,
    positions: selected
  });
  if (!response?.ok) {
    return {
      status: response?.status || 'unavailable',
      engine: response?.engine || 'Stockfish 18 lite single-threaded',
      results: [],
      error: response?.error || null
    };
  }
  return response.result;
}
