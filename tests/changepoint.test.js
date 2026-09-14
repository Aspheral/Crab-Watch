import test from 'node:test';
import assert from 'node:assert/strict';
import { detectChangePoint } from '../src/analysis/changepoint.js';

function game(index, rating, result, moves, fast = false) {
  const clocks = fast
    ? ['0:30', '0:28', '0:26', '0:24', '0:22', '0:20']
    : ['0:55', '0:45', '0:35', '0:25', '0:15', '0:05'];
  const timed = clocks.map(clock => `{[%clk ${clock}]}`).join(' ');
  return {
    end_time: 1000 - index,
    white: { username: 'Opponent', rating, result },
    black: { username: 'Other', rating: 1500, result: result === 'win' ? 'checkmated' : result === 'checkmated' ? 'win' : 'draw' },
    pgn: `[TimeControl "60+0"] 1. e4 ${timed} ${moves > 20 ? 'e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3' : ''} 1-0`
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

test('detects sustained timing behavior change when enough games contain clocks', () => {
  const games = [];
  for (let i = 0; i < 16; i += 1) games.push(game(i, 1500, 'draw', 20, i < 8));
  const result = detectChangePoint(games, 'Opponent');
  assert.equal(result.status, 'complete');
  assert.ok(result.candidate);
  assert.ok(result.candidate.timingShift !== null);
  assert.ok(Math.abs(result.candidate.timingShift) >= 0.15);
  assert.ok(result.candidate.timedGamesRecent >= 5);
  assert.ok(result.candidate.timedGamesOlder >= 5);
});

test('does not call a one-off result a sustained change', () => {
  const games = [];
  for (let i = 0; i < 20; i += 1) games.push(game(i, 1500, i === 0 ? 'win' : 'draw', 20));
  const result = detectChangePoint(games, 'Opponent');
  assert.notEqual(result.status, 'complete');
});
