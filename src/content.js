(() => {
  // HARD SAFETY BOUNDARY:
  // This file only observes a completed game and packages visible metadata.
  // It contains no chess engine, evaluation, move suggestion, or live analysis.

  const GAME_PATH = /\/game\/(?:live|daily|computer)\//i;
  const FINISH_TEXT_RE = /game\s+(?:over|review)|rematch|resign(?:ed|ation)?|checkmate|stalemate|draw(?:\s+agreed)?|timeout|time\s*forfeit|abandon(?:ed)?|you\s+(?:won|lost)|won\s+by|lost\s+by|game\s+ended/i;
  const FINISH_SELECTOR_RE = /game[-_\s]?(?:over|review|result|complete)|rematch/i;
  let lastUrl = location.href;
  let announced = false;
  let launcher = null;
  let panel = null;

  const clean = value => value?.replace(/\s+/g, ' ').trim() || null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  function isGamePage() { return GAME_PATH.test(location.pathname); }

  function hasFinishedControl() {
    const nodes = document.querySelectorAll('button, a, [role="button"], [data-cy], [data-test], [class]');
    for (const node of nodes) {
      const text = clean(node.innerText || node.getAttribute?.('aria-label') || node.getAttribute?.('title') || node.getAttribute?.('data-cy') || node.getAttribute?.('data-test') || node.className);
      if (text && FINISH_SELECTOR_RE.test(text)) return true;
    }
    return false;
  }

  function looksFinished() {
    if (!isGamePage()) return false;
    const text = document.body?.innerText || '';
    if (FINISH_TEXT_RE.test(text)) return true;
    return hasFinishedControl();
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
    const playerKeys = new Map(players.map(name => [name.toLowerCase(), name]));
    const candidates = [];
    for (const node of document.querySelectorAll('[data-username], [data-user], [data-member], a[href*="/member/"]')) {
      const hrefUsername = usernameFromHref(node.getAttribute?.('href'));
      const explicitUsername = node.getAttribute?.('data-username') || node.getAttribute?.('data-user') || node.getAttribute?.('data-member');
      const username = explicitUsername || hrefUsername;
      if (!username || !playerKeys.has(username.toLowerCase())) continue;

      let score = 0;
      const attrText = [node.getAttribute?.('data-test'), node.getAttribute?.('data-cy'), node.getAttribute?.('data-component'), node.getAttribute?.('aria-label'), node.getAttribute?.('title')].filter(Boolean).join(' ').toLowerCase();
      const classText = String(node.className || '').toLowerCase();
      const scoped = node.closest?.('header, nav, footer, [class*="sidebar"], [class*="account"], [class*="profile"], [class*="user-menu"]');
      if (explicitUsername) score += 100;
      if (node.getAttribute?.('aria-current') === 'page' || node.getAttribute?.('aria-current') === 'true') score += 60;
      if (/account|current.?user|user.?menu|profile.?menu/.test(attrText)) score += 45;
      if (/account|current.?user|user.?menu|profile.?menu/.test(classText)) score += 35;
      if (/settings|preferences|my profile|your profile|my account/.test(attrText)) score += 30;
      if (scoped) score += 15;
      if (/^\/member\//i.test(node.getAttribute?.('href') || '') && node.closest?.('header, nav, footer')) score += 10;
      candidates.push({ username: playerKeys.get(username.toLowerCase()), score });
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    return best && best.score >= 15 ? best.username : null;
  }

  function extractMoves() {
    const selectors = ['[data-test="move-list"]', '[data-cy="move-list"]', '.move-list', '[class*="move-list"]', '[class*="moveList"]'];
    for (const selector of selectors) {
      const text = clean(document.querySelector(selector)?.innerText);
      if (text) return text;
    }
    return null;
  }

  function extractEmbeddedPgn() {
    const candidates = [...document.querySelectorAll('[data-pgn]'), ...document.querySelectorAll('script[type="application/json"]')];
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
      source: 'chess.com', finished: true, url: location.href,
      gameId: location.pathname.match(/\/game\/[^/]+\/(\d+)/i)?.[1] || null,
      players, currentUser: likelyCurrentUser(players), embeddedPgn: extractEmbeddedPgn(), moveText: extractMoves(), title: clean(document.title), capturedAt: Date.now()
    };
  }

  function createChromeStyle() {
    if (document.getElementById('crab-watch-style')) return;
    const style = document.createElement('style');
    style.id = 'crab-watch-style';
    style.textContent = `
      #crab-watch-launcher, #crab-watch-panel, #crab-watch-panel * { box-sizing: border-box; }
      #crab-watch-launcher { position: fixed; top: 18px; right: 76px; z-index: 2147483647; width: 42px; height: 42px; border: 1px solid rgba(255,255,255,.16); border-radius: 10px; background: rgba(36,35,33,.96); box-shadow: 0 4px 18px rgba(0,0,0,.28); display: grid; place-items: center; cursor: pointer; padding: 7px; }
      #crab-watch-launcher:hover { filter: brightness(1.08); }
      #crab-watch-launcher img { width: 28px; height: 28px; display: block; }
      #crab-watch-panel { position: fixed; top: 68px; right: 18px; z-index: 2147483646; width: min(390px, calc(100vw - 36px)); max-height: calc(100vh - 86px); overflow: auto; border: 1px solid rgba(255,255,255,.12); border-radius: 14px; background: #262421; color: #f4f1eb; box-shadow: 0 14px 44px rgba(0,0,0,.42); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      #crab-watch-panel.light { background: #fff; color: #262522; border-color: #d7d3cc; box-shadow: 0 14px 40px rgba(0,0,0,.18); }
      #crab-watch-panel .cw-head { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,.1); }
      #crab-watch-panel.light .cw-head { border-color:#e4e0d9; }
      #crab-watch-panel .cw-brand { display:flex; align-items:center; gap:9px; font-size:14px; font-weight:700; }
      #crab-watch-panel .cw-brand img { width:26px; height:26px; }
      #crab-watch-panel .cw-close { border:0; background:transparent; color:inherit; opacity:.65; font-size:18px; cursor:pointer; padding:2px 4px; }
      #crab-watch-panel .cw-body { padding:16px; }
      #crab-watch-panel h2 { margin:0; font-size:20px; line-height:1.2; }
      #crab-watch-panel .cw-muted { margin:6px 0 0; color:#aaa59d; font-size:12px; line-height:1.45; }
      #crab-watch-panel.light .cw-muted { color:#6f6b65; }
      #crab-watch-panel .cw-card { margin-top:14px; padding:12px; border:1px solid rgba(255,255,255,.1); border-radius:10px; background:#312e2b; }
      #crab-watch-panel.light .cw-card { background:#f5f3f0; border-color:#e0ddd7; }
      #crab-watch-panel .cw-row { display:flex; justify-content:space-between; gap:12px; padding:7px 0; font-size:12px; }
      #crab-watch-panel .cw-row + .cw-row { border-top:1px solid rgba(255,255,255,.07); }
      #crab-watch-panel.light .cw-row + .cw-row { border-color:#e5e2dc; }
      #crab-watch-panel .cw-row span:first-child { color:#b4afa7; }
      #crab-watch-panel.light .cw-row span:first-child { color:#74706a; }
      #crab-watch-panel .cw-row span:last-child { font-weight:600; text-align:right; }
      #crab-watch-panel .cw-primary { width:100%; border:0; border-radius:8px; margin-top:14px; padding:11px 14px; background:#81b64c; color:white; font-weight:700; cursor:pointer; }
      #crab-watch-panel .cw-primary:hover { filter:brightness(1.06); }
      #crab-watch-panel .cw-primary:disabled { opacity:.55; cursor:default; }
      #crab-watch-panel .cw-error { margin:10px 0 0; padding:9px 10px; border-radius:8px; background:rgba(220,64,50,.12); color:#ff8f83; font-size:11px; line-height:1.4; }
      #crab-watch-panel.light .cw-error { background:#fff0ee; color:#b53b31; }
      #crab-watch-panel .cw-foot { margin-top:12px; text-align:center; color:#8d8880; font-size:10px; }
      #crab-watch-panel.light .cw-foot { color:#8b867f; }
    `;
    document.head.appendChild(style);
  }

  function pageLooksLight() {
    const target = document.querySelector('header') || document.body;
    const color = getComputedStyle(target).backgroundColor;
    const match = color.match(/rgba?\(([^)]+)\)/i);
    if (!match) return false;
    const nums = match[1].split(',').map(Number);
    const [r, g, b, a = 1] = nums;
    if (a < 0.45) return false;
    return (r * 299 + g * 587 + b * 114) / 1000 > 175;
  }

  function removePanel() { panel?.remove(); panel = null; }

  function showPanel(game) {
    createChromeStyle(); removePanel();
    panel = document.createElement('section');
    panel.id = 'crab-watch-panel';
    if (pageLooksLight()) panel.classList.add('light');
    const opponent = game.players?.find(name => name.toLowerCase() !== game.currentUser?.toLowerCase()) || 'Identifying…';
    panel.innerHTML = `
      <div class="cw-head"><div class="cw-brand"><img src="${chrome.runtime.getURL('assets/crab.svg')}" alt=""><span>Crab Watch</span></div><button class="cw-close" type="button" aria-label="Close">×</button></div>
      <div class="cw-body">
        <h2>Review this finished game</h2>
        <p class="cw-muted">A post-game forensic review using recent public play and selected engine checks.</p>
        <div class="cw-card"><div class="cw-row"><span>Game</span><span>${esc(game.gameId || 'Finished')}</span></div><div class="cw-row"><span>Opponent</span><span>${esc(opponent)}</span></div><div class="cw-row"><span>Mode</span><span>Post-game only</span></div></div>
        <button class="cw-primary" type="button">Review game</button>
        <p class="cw-foot">Nothing is analyzed while a game is in progress.</p>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelector('.cw-close').addEventListener('click', removePanel);
    const button = panel.querySelector('.cw-primary');
    button.addEventListener('click', async () => {
      button.disabled = true; button.textContent = 'Reviewing…'; panel.querySelector('.cw-error')?.remove();
      try {
        const response = await chrome.runtime.sendMessage({ type: 'REQUEST_REVIEW' });
        if (!response?.ok) throw new Error(response?.error || 'The completed game could not be reviewed.');
        const review = response.review; const evidence = review?.evidence; const signals = evidence?.signals || {};
        panel.querySelector('.cw-body').insertAdjacentHTML('beforeend', `<div class="cw-card"><div class="cw-row"><span>History</span><span>${esc(review.historyCount || 0)} games</span></div><div class="cw-row"><span>Critical positions</span><span>${esc(review.criticalAnalysis?.selected?.length || 0)}</span></div><div class="cw-row"><span>Engine</span><span>${esc(review.engineAnalysis?.status || 'unavailable')}</span></div><div class="cw-row"><span>Timing</span><span>${esc(signals.timing?.observations?.length ? 'context found' : signals.timing?.status || 'no data')}</span></div><div class="cw-row"><span>Assessment</span><span>${esc(evidence?.assessment?.level || 'context-only')}</span></div></div>`);
        button.textContent = 'Review complete';
      } catch (error) {
        const el = document.createElement('p'); el.className = 'cw-error'; el.textContent = error.message || 'Review failed.';
        button.disabled = false; button.textContent = 'Review game'; panel.querySelector('.cw-body').appendChild(el);
      }
    });
  }

  function ensureLauncher(game) {
    createChromeStyle();
    if (launcher) return;
    launcher = document.createElement('button');
    launcher.id = 'crab-watch-launcher'; launcher.type = 'button'; launcher.title = 'Open Crab Watch'; launcher.setAttribute('aria-label', 'Open Crab Watch');
    launcher.innerHTML = `<img src="${chrome.runtime.getURL('assets/crab.svg')}" alt="">`;
    launcher.addEventListener('click', () => showPanel(game));
    document.body.appendChild(launcher);
  }

  function clearUi() { launcher?.remove(); launcher = null; removePanel(); }

  function check() {
    if (location.href !== lastUrl) { lastUrl = location.href; announced = false; clearUi(); }
    const game = readCompletedGame();
    if (!game) return;
    if (!announced) {
      announced = true;
      chrome.runtime.sendMessage({ type: 'GAME_FINISHED', payload: game }).catch(() => {});
    }
    ensureLauncher(game);
  }

  const observer = new MutationObserver(check);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  check();
})();
