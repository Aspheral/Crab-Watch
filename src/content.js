(() => {
  // HARD SAFETY BOUNDARY:
  // This file only observes a completed game and packages visible metadata.
  // It contains no chess engine, evaluation, move suggestion, or live analysis.

  const GAME_PATH = /\/game\/(?:live|daily|computer)\//i;
  const FINISH_TEXT_RE = /game\s+(?:over|review)|rematch|resign(?:ed|ation)?|checkmate|stalemate|draw(?:\s+agreed)?|timeout|time\s*forfeit|abandon(?:ed)?|you\s+(?:won|lost)|won\s+by|lost\s+by|game\s+ended/i;
  const FINISH_SELECTOR_RE = /game[-_\s]?(?:over|review|result|complete)|rematch/i;
  let lastUrl = location.href;
  let lastGame = null;
  let announced = false;
  let launcherHost = null;
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
    return FINISH_TEXT_RE.test(text) || hasFinishedControl();
  }

  function usernameFromHref(href) {
    return href?.match(/\/member\/([A-Za-z0-9_-]{2,25})\/?$/i)?.[1] || null;
  }

  function playerLinks() {
    const seen = new Set();
    const players = [];
    for (const anchor of document.querySelectorAll('a[href*="/member/"]')) {
      const username = usernameFromHref(anchor.href);
      if (!username) continue;
      const key = username.toLowerCase();
      if (!seen.has(key)) { seen.add(key); players.push(username); }
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
      let score = explicitUsername ? 100 : 0;
      const attrText = [node.getAttribute?.('data-test'), node.getAttribute?.('data-cy'), node.getAttribute?.('data-component'), node.getAttribute?.('aria-label'), node.getAttribute?.('title')].filter(Boolean).join(' ').toLowerCase();
      const classText = String(node.className || '').toLowerCase();
      if (node.getAttribute?.('aria-current') === 'page' || node.getAttribute?.('aria-current') === 'true') score += 60;
      if (/account|current.?user|user.?menu|profile.?menu/.test(attrText)) score += 45;
      if (/account|current.?user|user.?menu|profile.?menu/.test(classText)) score += 35;
      if (/settings|preferences|my profile|your profile|my account/.test(attrText)) score += 30;
      if (node.closest?.('header, nav, footer, [class*="sidebar"], [class*="account"], [class*="profile"], [class*="user-menu"]')) score += 15;
      candidates.push({ username: playerKeys.get(username.toLowerCase()), score });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.score >= 15 ? candidates[0].username : null;
  }

  function detectComputerOpponent() {
    if (!/\/game\/computer\//i.test(location.pathname)) return null;
    const selectors = ['[data-test*="player"]', '[data-cy*="player"]', '[class*="player-name"]', '[class*="playerName"]', '[class*="player-name"]'];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const text = clean(node.textContent || node.innerText);
        const match = text?.match(/^([A-Za-z0-9_-]{2,25})\s*\(\d+\)/);
        if (match) return match[1];
      }
    }
    const bodyLines = (document.body?.innerText || '').split('\n').map(clean).filter(Boolean);
    for (const line of bodyLines) {
      const match = line.match(/^([A-Za-z0-9_-]{2,25})\s*\(\d+\)$/);
      if (match) return match[1];
    }
    return null;
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
    const computer = /\/game\/computer\//i.test(location.pathname);
    const opponent = computer ? detectComputerOpponent() : null;
    return {
      source: 'chess.com',
      finished: true,
      gameType: computer ? 'computer' : 'human',
      url: location.href,
      gameId: location.pathname.match(/\/game\/[^/]+\/(\d+)/i)?.[1] || null,
      players,
      currentUser: likelyCurrentUser(players),
      opponent,
      embeddedPgn: extractEmbeddedPgn(),
      moveText: extractMoves(),
      title: clean(document.title),
      capturedAt: Date.now()
    };
  }

  function removePanel() { panel?.remove(); panel = null; }

  function createPanel(game) {
    removePanel();
    panel = document.createElement('section');
    panel.id = 'crab-watch-panel';
    panel.innerHTML = `
      <div class="cw-head"><div class="cw-brand"><img src="${chrome.runtime.getURL('assets/crab.svg')}" alt=""><span>Crab Watch</span></div><button class="cw-close" type="button" aria-label="Close">×</button></div>
      <div class="cw-body">
        <h2>Review this finished game</h2>
        <p class="cw-muted">A post-game forensic review using recent public play and selected engine checks.</p>
        <div class="cw-card"><div class="cw-row"><span>Game</span><span>${esc(game.gameId || 'Finished')}</span></div><div class="cw-row"><span>Opponent</span><span>${esc(game.opponent || (game.gameType === 'computer' ? 'Computer' : 'Identifying…'))}</span></div><div class="cw-row"><span>Mode</span><span>${game.gameType === 'computer' ? 'Computer game' : 'Post-game only'}</span></div></div>
        <button class="cw-primary" type="button">Review game</button>
        <p class="cw-foot">Nothing is analyzed while a game is in progress.</p>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelector('.cw-close').addEventListener('click', removePanel);
    const button = panel.querySelector('.cw-primary');
    button.addEventListener('click', async () => {
      button.disabled = true; button.textContent = 'Reviewing…';
      panel.querySelector('.cw-error')?.remove();
      try {
        const response = await chrome.runtime.sendMessage({ type: 'REQUEST_REVIEW' });
        if (!response?.ok) throw new Error(response?.error || 'The completed game could not be reviewed.');
        const review = response.review;
        const evidence = review?.evidence;
        const signals = evidence?.signals || {};
        panel.querySelector('.cw-body').insertAdjacentHTML('beforeend', `<div class="cw-card"><div class="cw-row"><span>History</span><span>${esc(review.historyCount || 0)} games</span></div><div class="cw-row"><span>Critical positions</span><span>${esc(review.criticalAnalysis?.selected?.length || 0)}</span></div><div class="cw-row"><span>Engine</span><span>${esc(review.engineAnalysis?.status || 'unavailable')}</span></div><div class="cw-row"><span>Timing</span><span>${esc(signals.timing?.observations?.length ? 'context found' : signals.timing?.status || 'no data')}</span></div><div class="cw-row"><span>Assessment</span><span>${esc(evidence?.assessment?.level || 'context-only')}</span></div></div>`);
        button.textContent = 'Review complete';
      } catch (error) {
        const el = document.createElement('p'); el.className = 'cw-error'; el.textContent = error.message || 'Review failed.';
        button.disabled = false; button.textContent = 'Review game'; panel.querySelector('.cw-body').appendChild(el);
      }
    });
  }

  function injectStyle() {
    if (document.getElementById('crab-watch-style')) return;
    const style = document.createElement('style');
    style.id = 'crab-watch-style';
    style.textContent = `
      #crab-watch-host { all: initial; position: fixed !important; top: 14px !important; right: 14px !important; width: 46px !important; height: 46px !important; z-index: 2147483647 !important; display: block !important; }
      #crab-watch-panel, #crab-watch-panel * { box-sizing: border-box; }
      #crab-watch-panel { position:fixed; top:68px; right:14px; z-index:2147483646; width:min(390px,calc(100vw - 28px)); max-height:calc(100vh - 82px); overflow:auto; border:1px solid rgba(255,255,255,.12); border-radius:14px; background:#262421; color:#f4f1eb; box-shadow:0 14px 44px rgba(0,0,0,.42); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
      #crab-watch-panel .cw-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.1)}
      #crab-watch-panel .cw-brand{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:700}.cw-brand img{width:26px;height:26px}#crab-watch-panel .cw-close{border:0;background:transparent;color:inherit;opacity:.7;font-size:18px;cursor:pointer}#crab-watch-panel .cw-body{padding:16px}#crab-watch-panel h2{margin:0;font-size:20px;line-height:1.2}#crab-watch-panel .cw-muted{margin:6px 0 0;color:#aaa59d;font-size:12px;line-height:1.45}#crab-watch-panel .cw-card{margin-top:14px;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:#312e2b}#crab-watch-panel .cw-row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;font-size:12px}#crab-watch-panel .cw-row+.cw-row{border-top:1px solid rgba(255,255,255,.07)}#crab-watch-panel .cw-row span:first-child{color:#b4afa7}#crab-watch-panel .cw-row span:last-child{font-weight:600;text-align:right}#crab-watch-panel .cw-primary{width:100%;border:0;border-radius:8px;margin-top:14px;padding:11px 14px;background:#81b64c;color:#fff;font-weight:700;cursor:pointer}#crab-watch-panel .cw-primary:disabled{opacity:.55;cursor:default}#crab-watch-panel .cw-error{margin:10px 0 0;padding:9px 10px;border-radius:8px;background:#4c2724;color:#ff9a91;font-size:11px;line-height:1.4}#crab-watch-panel .cw-foot{margin-top:12px;text-align:center;color:#8d8880;font-size:10px}
    `;
    document.documentElement.appendChild(style);
  }

  function ensureLauncher(game) {
    injectStyle();
    if (!launcherHost || !launcherHost.isConnected) {
      launcherHost = document.createElement('div');
      launcherHost.id = 'crab-watch-host';
      const shadow = launcherHost.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = `:host{all:initial}button{all:initial;box-sizing:border-box;width:46px;height:46px;display:grid;place-items:center;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:#262421;box-shadow:0 4px 18px rgba(0,0,0,.32);cursor:pointer}button:hover{filter:brightness(1.12)}img{width:30px;height:30px;display:block}`;
      const button = document.createElement('button');
      button.type = 'button'; button.title = 'Open Crab Watch'; button.setAttribute('aria-label', 'Open Crab Watch');
      const image = document.createElement('img'); image.src = chrome.runtime.getURL('assets/crab.svg'); image.alt = '';
      button.appendChild(image); shadow.append(style, button);
      button.addEventListener('click', () => createPanel(lastGame));
      document.documentElement.appendChild(launcherHost);
    }
    lastGame = game;
  }

  function clearUi() { launcherHost?.remove(); launcherHost = null; removePanel(); lastGame = null; }

  function check() {
    if (location.href !== lastUrl) { lastUrl = location.href; announced = false; clearUi(); }
    const game = readCompletedGame();
    if (!game) return;
    lastGame = game;
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
