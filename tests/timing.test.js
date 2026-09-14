import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTiming } from '../src/analysis/timing.js';

test('parses Chess.com clock annotations and move times', () => {
  const pgn = '[TimeControl "60+2"] 1. e4 { [%clk 0:01:00] } e5 { [%clk 0:01:00] } 2. Nf3 { [%clk 0:00:58] } Nc6 { [%clk 0:00:57] } 3. Bb5 { [%clk 0:00:52] } *';
  const report = analyzeTiming(pgn, 'w');
  assert.equal(report.status, 'complete');
  assert.equal(report.timeControl, '60+2');
  assert.equal(report.increment, 2);
  assert.equal(report.timedMoves, 2);
  assert.equal(report.entries[0].spent, null);
  assert.equal(report.entries[1].spent, 4);
  assert.equal(report.entries[2].spent, 8);
  assert.equal(report.medianSeconds, 6);
});

test('reports missing clock data without inventing timing evidence', () => {
  const report = analyzeTiming('[TimeControl "600+0"] 1. e4 e5 2. Nf3 Nc6 1-0', 'w');
  assert.equal(report.status, 'no-clock-data');
  assert.equal(report.timedMoves, 0);
  assert.equal(report.fastShare, null);
});
