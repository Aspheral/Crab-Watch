const state = document.querySelector('#state');
const gameCard = document.querySelector('#gameCard');
const opponent = document.querySelector('#opponent');
const result = document.querySelector('#result');
const gameMeta = document.querySelector('#gameMeta');
const review = document.querySelector('#review');
const meterFill = document.querySelector('#meterFill');

async function load() {
  const stored = await chrome.storage.local.get('crabWatchGameState');
  const game = stored.crabWatchGameState;
  if (!game) return;

  state.hidden = true;
  gameCard.hidden = false;
  review.disabled = false;
  gameMeta.textContent = 'Finished';

  // Player-name extraction is intentionally deferred until the game adapter
  // has a reliable, site-specific source. Never guess an opponent identity.
  opponent.textContent = 'Finished game';
  result.textContent = 'Ready';
  meterFill.style.width = '8%';
}

review.addEventListener('click', async () => {
  review.disabled = true;
  review.textContent = 'Preparing review';
  // v0.1 establishes the safe post-game boundary. The forensic pipeline will
  // consume a completed game object in a later module.
  await chrome.storage.local.set({ crabWatchReviewRequestedAt: Date.now() });
  review.textContent = 'Review coming next';
});

document.querySelector('#settings').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://github.com/Aspheral/Crab-Watch' });
});

load();
