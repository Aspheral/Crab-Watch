const state = document.querySelector('#state');
const gameCard = document.querySelector('#gameCard');
const opponent = document.querySelector('#opponent');
const result = document.querySelector('#result');
const gameMeta = document.querySelector('#gameMeta');
const review = document.querySelector('#review');
const historyCount = document.querySelector('#historyCount');
const historyBars = document.querySelector('#historyBars');
const error = document.querySelector('#error');

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

function renderHistoryShape(count) {
  historyBars.replaceChildren();
  const slots = 24;
  const filled = Math.max(2, Math.round(Math.min(count, 300) / 300 * slots));
  for (let i = 0; i < slots; i += 1) {
    const bar = document.createElement('span');
    bar.className = i < filled ? 'filled' : '';
    bar.style.height = `${8 + ((i * 17) % 15)}px`;
    historyBars.appendChild(bar);
  }
}

async function load() {
  const stored = await chrome.storage.local.get(['crabWatchGameState', 'crabWatchReview']);
  const game = stored.crabWatchGameState;
  const previous = stored.crabWatchReview;
  if (!game?.finished) return;

  state.hidden = true;
  gameCard.hidden = false;
  review.disabled = false;
  error.hidden = true;

  const players = Array.isArray(game.players) ? game.players : [];
  const current = game.currentUser?.toLowerCase();
  const opponentName = players.find(name => name.toLowerCase() !== current) || null;
  opponent.textContent = opponentName || 'Opponent not identified';
  gameMeta.textContent = game.gameId ? `Game ${game.gameId}` : 'Finished';

  if (previous?.opponent && previous.opponent.toLowerCase() === opponentName?.toLowerCase()) {
    historyCount.textContent = previous.historyCount || 0;
    renderHistoryShape(previous.historyCount || 0);
    result.textContent = 'Ready';
  } else {
    historyCount.textContent = '—';
    renderHistoryShape(0);
    result.textContent = 'Ready';
  }
}

review.addEventListener('click', async () => {
  review.disabled = true;
  error.hidden = true;
  review.textContent = 'Reviewing…';

  const response = await chrome.runtime.sendMessage({ type: 'REQUEST_REVIEW' });
  if (!response?.ok) {
    showError(response?.error || 'The completed game could not be prepared.');
    review.disabled = false;
    review.textContent = 'Review game';
    return;
  }

  historyCount.textContent = response.review.historyCount;
  renderHistoryShape(response.review.historyCount);
  result.textContent = 'History ready';
  gameMeta.textContent = `${response.review.historyCount} games collected`;
  review.textContent = 'Analysis next';
});

document.querySelector('#settings').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://github.com/Aspheral/Crab-Watch' });
});

load();
