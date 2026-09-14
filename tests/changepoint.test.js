import test from 'node:test';
import assert from 'node:assert/strict';
import { detectChangePoint } from '../src/analysis/changepoint.js';

function game(index, rating, result, moves) {
  return {
    end_time: 1000 - index,
    white: { username: 'Opponent', rating, result },
    black: { username: 'Other', rating: 1500, result: result === 'win' ? 'checkmated' : result === 'checkmated' ? 'win' : 'draw' },
    pgn: `1. e4 ${moves > 20 ? 'e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3' : ''} 1-0`
  };
}

test('requires enough games for a change-point scan', () => {
  const result = detectChangePoint([game(0, 1500, 'win', 20), game(1, 1500, 'win', 20)], 'Opponent');
  assert.equal(result.status, 'insufficient');
});

test('detects a sustained shift in account metrics', () => {
  const games = [];
  for (let i = 0; i < 16; i += 1) games.push(game(i, i < 8 ? 1500 : 1700, i < 8 ? 'draw' : 'win', i < 8 ? 20 : 45));
  const result = detectChangePoint(games, 'Opponent');
  assert.equal(result.status, 'complete');
  assert.ok(result.candidate);
  assert.ok(Math.abs(result.candidate.ratingShift) >= 150);
});

test('does not call a one-off result a sustained change', () => {
  const games = [];
  for (let i = 0; i < 20; i += 1) games.push(game(i, 1500, i === 0 ? 'win' : 'draw', 20));
  const result = detectChangePoint(games, 'Opponent');
  assert.notEqual(result.status, 'complete');
});
