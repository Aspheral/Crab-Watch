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

  function usernameFromHref(href) {
    const match = href?.match(/\/member\/([A-Za-z0-9_-]{2,25})\/?$/i);
    return match?.[1] || null;
  }

  function playerLinks() {
    const seen = new Set();
    const players = [];
    for (const anchor of document.querySelectorAll('a[href*="/member/"]')) {
      const username = usernameFromHref(anchor.href);
      if (!username) continue;
      const key = username.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        players.push(username);
      }
    }
    return players;
  }

  function likelyCurrentUser(players) {
    // Chess.com's game DOM has changed several times. Prefer explicit user
    // metadata when it exists, then fall back to strongly-scoped account/profile
    // links. Never choose an opponent's ordinary board profile link as "self".
    const playerKeys = new Map(players.map(name => [name.toLowerCase(), name]));
    const candidates = [];

    for (const node of document.querySelectorAll('[data-username], [data-user], [data-member], a[href*="/member/"]')) {
      const hrefUsername = usernameFromHref(node.getAttribute?.('href'));
      const explicitUsername = node.getAttribute?.('data-username') || node.getAttribute?.('data-user') || node.getAttribute?.('data-member');
      const username = explicitUsername || hrefUsername;
      if (!username || !playerKeys.has(username.toLowerCase())) continue;

      let score = 0;
      const attrText = [
        node.getAttribute?.('data-test'),
        node.getAttribute?.('data-cy'),
        node.getAttribute?.('data-component'),
        node.getAttribute?.('aria-label'),
        node.getAttribute?.('title'),
      ].filter(Boolean).join(' ').toLowerCase();
      const classText = String(node.className || '').toLowerCase();
      const ancestorText = node.closest?.('header, nav, footer, [class*="sidebar"], [class*="account"], [class*="profile"], [class*="user-menu"]') ? 'scoped' : '';

      if (explicitUsername) score += 100;
      if (node.getAttribute?.('aria-current') === 'page' || node.getAttribute?.('aria-current') === 'true') score += 60;
      if (/account|current.?user|user.?menu|profile.?menu/.test(attrText)) score += 45;
      if (/account|current.?user|user.?menu|profile.?menu/.test(classText)) score += 35;
      if (/settings|preferences|my profile|your profile|my account/.test(attrText)) score += 30;
      if (ancestorText) score += 15;
      if (/^\/member\//i.test(node.getAttribute?.('href') || '') && node.closest?.('header, nav, footer')) score += 10;

      candidates.push({ username: playerKeys.get(username.toLowerCase()), score });
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (best && best.score >= 40) return best.username;

    return null;
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
