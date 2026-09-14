import test from 'node:test';
import assert from 'node:assert/strict';
import { detectChangePoint } from '../src/analysis/changepoint.js';

function game(index, rating, result, moves, fast = false) {
  const timed = fast
    ? 'e4 {[%clk 0:59]} e5 {[%clk 0:59]} Nf3 {[%clk 0:57]} Nc6 {[%clk 0:58]} Bb5 {[%clk 0:55]} a6 {[%clk 0:57]}'
    : 'e4 {[%clk 0:59]} e5 {[%clk 0:50]} Nf3 {[%clk 0:49]} Nc6 {[%clk 0:40]} Bb5 {[%clk 0:39]} a6 {[%clk 0:30]}';
  return {
    end_time: 1000 - index,
    white: { username: 'Opponent', rating, result },
    black: { username: 'Other', rating: 1500, result: result === 'win' ? 'checkmated' : result === 'checkmated' ? 'win' : 'draw' },
    pgn: `[TimeControl "60+0"] ${timed} ${moves > 20 ? '7. Ba4 Nf6 8. O-O Be7 9. Re1' : ''} 1-0`
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
