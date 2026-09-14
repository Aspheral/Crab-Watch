/**
 * Chess.com page adapter.
 *
 * This file is intentionally limited to extracting already-visible, completed
 * game information. It never evaluates a position or requests an engine move.
 */

const GAME_URL = /\/game\/(?:live|daily|computer)\//i;
const FINISH_RE = /checkmate|resign|resignation|stalemate|draw|timeout|time\s*forfeit|abandon/i;
const USER_RE = /\/member\/([A-Za-z0-9_-]{2,25})\/?$/i;

function clean(value) {
  return value?.replace(/\s+/g, ' ').trim() || null;
}

function usernamesFromLinks() {
  return [...document.querySelectorAll('a[href*="/member/"]')]
    .map(a => {
      const match = a.href.match(USER_RE);
      return match ? match[1] : null;
    })
    .filter(Boolean)
    .filter((name, index, list) => list.findIndex(x => x.toLowerCase() === name.toLowerCase()) === index);
}

function extractMoves() {
  const selectors = [
    '[data-test="move-list"]',
    '[data-cy="move-list"]',
    '.move-list',
    '[class*="move-list"]',
    '[class*="moveList"]'
  ];

  for (const selector of selectors) {
    const node = document.querySelector(selector);
    const text = clean(node?.innerText);
    if (text) return text;
  }
  return null;
}

function extractEmbeddedPgn() {
  const candidates = [
    ...document.querySelectorAll('[data-pgn]'),
    ...document.querySelectorAll('script[type="application/json"]')
  ];
  for (const node of candidates) {
    const value = node.getAttribute?.('data-pgn') || node.textContent;
    if (value && /\[Event\s+"|\[White\s+"|\[Black\s+"/.test(value)) return value.trim();
  }
  return null;
}

function finishedText() {
  const text = document.body?.innerText || '';
  return FINISH_RE.test(text) && /game|won|lost|draw|checkmate|resign|timeout|stalemate/i.test(text);
}

export function readCompletedGame() {
  if (!GAME_URL.test(location.pathname)) return null;
  if (!finishedText()) return null;

  const players = usernamesFromLinks();
  const embeddedPgn = extractEmbeddedPgn();
  const moves = extractMoves();
  const title = clean(document.title);

  return {
    source: 'chess.com',
    finished: true,
    url: location.href,
    gameId: location.pathname.match(/\/game\/[^/]+\/(\d+)/i)?.[1] || null,
    players,
    embeddedPgn,
    moveText: moves,
    title,
    capturedAt: Date.now()
  };
}

export function isChessComGamePage() {
  return GAME_URL.test(location.pathname);
}
