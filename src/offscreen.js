import { movesMatch, scoreLoss } from './analysis/engine.js';

const ENGINE_NAME = 'Stockfish 18 lite single-threaded';
let engineWorker = null;
let engineReady = null;

function sendUci(command) {
  engineWorker.postMessage(command);
}

function startEngine(path) {
  if (engineWorker && engineReady) return engineReady;
  engineWorker = new Worker(chrome.runtime.getURL(path));
  engineReady = new Promise((resolve, reject) => {
    let initialized = false;
    const timer = setTimeout(() => reject(new Error('Stockfish initialization timed out.')), 15000);
    engineWorker.onmessage = event => {
      const line = String(event.data || '').trim();
      if (line === 'uciok') {
        initialized = true;
        sendUci('isready');
      } else if (line === 'readyok' && initialized) {
        clearTimeout(timer);
        resolve();
      }
    };
    engineWorker.onerror = event => {
      clearTimeout(timer);
      reject(new Error(event?.message || 'Stockfish worker failed to load.'));
    };
    sendUci('uci');
  }).catch(error => {
    engineWorker?.terminate();
    engineWorker = null;
    engineReady = null;
    throw error;
  });
  return engineReady;
}

function toScore(line) {
  const mate = line.match(/\bscore\s+mate\s+(-?\d+)/);
  if (mate) return { type: 'mate', value: Number(mate[1]) };
  const cp = line.match(/\bscore\s+cp\s+(-?\d+)/);
  if (cp) return { type: 'cp', value: Number(cp[1]) };
  return null;
}

function parseBestmove(line) {
  return line.match(/^bestmove\s+(\S+)/)?.[1] || null;
}

function scoreToCp(score) {
  if (!score) return null;
  if (score.type === 'mate') return (score.value >= 0 ? 1 : -1) * 100000;
  return Number.isFinite(score.value) ? score.value : null;
}

function invertScore(score) {
  return score ? { type: score.type, value: -score.value } : null;
}

function analyzeFen(fen, depth) {
  return new Promise((resolve, reject) => {
    let latestScore = null;
    let latestDepth = 0;
    const timeout = setTimeout(() => {
      engineWorker.removeEventListener('message', onMessage);
      sendUci('stop');
      reject(new Error('Stockfish analysis timed out.'));
    }, 30000);

    function onMessage(event) {
      const line = String(event.data || '').trim();
      if (line.startsWith('info ')) {
        const depthMatch = line.match(/\bdepth\s+(\d+)/);
        const score = toScore(line);
        if (score && depthMatch) {
          latestDepth = Number(depthMatch[1]);
          latestScore = score;
        }
      }
      if (line.startsWith('bestmove ')) {
        clearTimeout(timeout);
        engineWorker.removeEventListener('message', onMessage);
        resolve({ bestMove: parseBestmove(line), score: latestScore, depth: latestDepth });
      }
    }

    engineWorker.addEventListener('message', onMessage);
    sendUci(`position fen ${fen}`);
    sendUci(`go depth ${Math.max(10, Math.min(22, Number(depth) || 15))}`);
  });
}

function moveToUci(move) {
  if (!move?.from || !move?.to) return null;
  return `${move.from}${move.to}${move.promotion ? String(move.promotion).toLowerCase() : ''}`;
}

function fingerprintToFen(fingerprint) {
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'ENGINE_ANALYZE_POSITIONS' || message?.target !== 'offscreen') return false;

  (async () => {
    try {
      await startEngine(message.path);
      const results = [];
      for (const position of message.positions || []) {
        const before = await analyzeFen(fingerprintToFen(position.before), message.depth);
        const after = await analyzeFen(fingerprintToFen(position.after), message.depth);
        const playedMove = moveToUci(position.move);
        const bestScore = before.score;
        const playedScore = invertScore(after.score);
        const bestCp = scoreToCp(bestScore);
        const playedCp = scoreToCp(playedScore);
        const centipawnLoss = scoreLoss(bestScore, playedScore);
        results.push({
          ply: position.ply,
          moveNumber: position.moveNumber,
          san: position.san,
          playedMove,
          bestMove: before.bestMove,
          bestScoreCp: bestCp,
          playedScoreCp: playedCp,
          centipawnLoss,
          depth: Math.min(before.depth || 0, after.depth || 0),
          bestMoveMatches: movesMatch(playedMove, before.bestMove)
        });
      }
      sendResponse({ ok: true, result: { status: 'complete', engine: ENGINE_NAME, depth: message.depth, results } });
    } catch (error) {
      sendResponse({ ok: false, status: 'unavailable', engine: ENGINE_NAME, error: error.message });
    }
  })();
  return true;
});
