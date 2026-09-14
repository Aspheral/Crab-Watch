(() => {
  // Safety boundary: this content script records game completion only.
  // It deliberately contains no engine, chess evaluation, move recommendation,
  // or position-analysis code. Historical analysis belongs to the post-game layer.

  let lastUrl = location.href;
  let announced = false;

  const looksFinished = () => {
    const text = document.body?.innerText || '';
    return /game over|checkmate|resignation|draw agreed|stalemate|time out|timeout|abandoned/i.test(text);
  };

  const collectVisibleGameText = () => {
    const selectors = [
      '[data-test="move-list"]',
      '[class*="move-list"]',
      '[class*="moveList"]'
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node?.innerText?.trim()) return node.innerText.trim();
    }
    return null;
  };

  const check = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      announced = false;
    }
    if (announced || !looksFinished()) return;

    const gameText = collectVisibleGameText();
    announced = true;
    chrome.runtime.sendMessage({
      type: 'GAME_FINISHED',
      payload: {
        url: location.href,
        gameText,
        title: document.title
      }
    }).catch(() => {});
  };

  const observer = new MutationObserver(check);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  check();
})();
