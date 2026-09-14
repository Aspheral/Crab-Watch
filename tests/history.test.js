import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAccountHistory, compareCurrentGameToHistory } from '../src/analysis/history.js';

const game = (n, rating, result = '1-0') => ({
  url: `https://www.chess.com/game/live/${n}`,
  end_time: 1000 + n,
  result,
  white: { username: 'Target', rating },
  black: { username: 'Opponent', rating: 1500 },
  pgn: `[White "Target"] [Black "Opponent"] ${Math.ceil(n / 2)}. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`
});

test('history analyzer summarizes a public sample', () => {
  const history = Array.from({ length: 20 }, (_, i) => game(i + 1, 1400 + i));
  const result = analyzeAccountHistory('Target', history);
  assert.equal(result.gameCount, 20);
  assert.equal(result.firstRating, 1419);
  assert.equal(result.lastRating, 1400);
  assert.equal(result.results.wins, 20);
  assert.ok(result.openingPatterns[0].share >= 0.99);
});

test('large history is capped at the analysis window but remains contextual', () => {
  const history = Array.from({ length: 351 }, (_, i) => game(i + 1, 1500));
  const result = compareCurrentGameToHistory('Target', game(999, 1500), history);
  assert.equal(result.stats.gameCount, 300);
  assert.equal(result.observations.some(x => x.kind === 'large-history'), false);
});
