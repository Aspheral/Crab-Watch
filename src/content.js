(() => {
  // HARD SAFETY BOUNDARY:
  // This file only observes a completed game and packages visible metadata.
  // It contains no chess engine, evaluation, move suggestion, or live analysis.

  const GAME_PATH = /\/game\/(?:live|daily|computer)\//i;
  const FINISH_RE = /checkmate|resign|resignation|stalemate|draw|timeout|time\s*forfeit|abandon/i;
  let lastUrl = location.href;
  let announced = false;

  const clean = value => value?.replace(/\s+/g, ' ').trim() || null;

  function isGamePage() {
    return GAME_PATH.test(location.pathname);
  }

  function looksFinished() {
    if (!isGamePage()) return false;
    const text = document.body?.innerText || '';
    return FINISH_RE.test(text) && /game|won|lost|draw|checkmate|resign|timeout|stalemate/i.test(text);
  }

  function playerLinks() {
    const seen = new Set();
    const players = [];
    for (const anchor of document.querySelectorAll('a[href*="/member/"]')) {
      const match = anchor.href.match(/\/member\/([A-Za-z0-9_-]{2,25})\/?$/i);
      if (!match) continue;
      const username = match[1];
      const key = username.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        players.push(username);
      }
    }
    return players;
  }

  function likelyCurrentUser(players) {
    // Prefer profile links outside the board/game panels. This is only an
    // identity hint; we never guess an opponent when the page is ambiguous.
    const candidates = [...document.querySelectorAll('header a[href*="/member/"], nav a[href*="/member/"], [class*="sidebar"] a[href*="/member/"]')]
      .map(a => a.href.match(/\/member\/([A-Za-z0-9_-]{2,25})\/?$/i)?.[1])
      .filter(Boolean);
    return candidates.find(name => players.some(p => p.toLowerCase() === name.toLowerCase())) || null;
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

  function readCompletedGame() {
    if (!looksFinished()) return null;
    const players = playerLinks();
    return {
      source: 'chess.com',
      finished: true,
      url: location.href,
      gameId: location.pathname.match(/\/game\/[^/]+\/(\d+)/i)?.[1] || null,
      players,
      currentUser: likelyCurrentUser(players),
      embeddedPgn: extractEmbeddedPgn(),
      moveText: extractMoves(),
      title: clean(document.title),
      capturedAt: Date.now()
    };
  }

  function check() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      announced = false;
    }
    if (announced) return;
    const game = readCompletedGame();
    if (!game) return;

    announced = true;
    chrome.runtime.sendMessage({ type: 'GAME_FINISHED', payload: game }).catch(() => {});
  }

  const observer = new MutationObserver(check);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  check();
})();
