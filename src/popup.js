const state = document.querySelector('#state');
const gameCard = document.querySelector('#gameCard');
const opponent = document.querySelector('#opponent');
const result = document.querySelector('#result');
const gameMeta = document.querySelector('#gameMeta');
const criticalCount = document.querySelector('#criticalCount');
const review = document.querySelector('#review');
const historyCount = document.querySelector('#historyCount');
const historyBars = document.querySelector('#historyBars');
const assessment = document.querySelector('#assessment');
const assessmentDot = document.querySelector('#assessmentDot');
const assessmentTitle = document.querySelector('#assessmentTitle');
const assessmentText = document.querySelector('#assessmentText');
const signals = document.querySelector('#signals');
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

function renderEvidence(evidence) {
  if (!evidence) return;
  assessment.hidden = false;
  const level = evidence.assessment?.level;
  if (level === 'elevated-anomaly') {
    assessmentTitle.textContent = 'Unusual patterns';
    assessmentText.textContent = 'Several independent signals deserve a closer look. This is not a cheating verdict.';
    assessmentDot.dataset.state = 'high';
  } else if (level === 'review-required') {
    assessmentTitle.textContent = 'Some unusual patterns';
    assessmentText.textContent = 'The history contains more than one point worth examining.';
    assessmentDot.dataset.state = 'medium';
  } else {
    assessmentTitle.textContent = 'History in context';
    assessmentText.textContent = 'The first pass found context, but not enough evidence for a strong conclusion.';
    assessmentDot.dataset.state = 'low';
  }

  signals.replaceChildren();
  const rows = [
    ['History', evidence.signals.accountHistory],
    ['Strength', evidence.signals.historicalStrength],
    ['Critical positions', evidence.signals.positionDifficulty],
    ['Repeated play', evidence.signals.repeatedDecision]
  ];
  for (const [label, signal] of rows) {
    const row = document.createElement('div');
    row.className = 'signal-row';
    const left = document.createElement('span');
    left.textContent = label;
    const right = document.createElement('span');
    right.textContent = signal?.observations?.length ? 'context found' : 'no finding';
    row.append(left, right);
    signals.appendChild(row);
  }
}

async function renderStoredReview(review) {
  if (!review) return;
  historyCount.textContent = review.historyCount || 0;
  renderHistoryShape(review.historyCount || 0);
  const critical = review.criticalAnalysis?.selected || [];
  criticalCount.textContent = critical.length || '0';
  result.textContent = review.evidence?.assessment?.level === 'context-only' ? 'In context' : 'Reviewed';
  renderEvidence(review.evidence);
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
    await renderStoredReview(previous);
  } else {
    historyCount.textContent = '—';
    criticalCount.textContent = '—';
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

  await renderStoredReview(response.review);
  gameMeta.textContent = `${response.review.historyCount} games collected`;
  review.textContent = 'History reviewed';
});

document.querySelector('#settings').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://github.com/Aspheral/Crab-Watch' });
});

load();
