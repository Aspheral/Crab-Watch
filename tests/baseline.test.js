import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeEngineBaseline, compareCurrentToBaseline } from '../src/analysis/baseline.js';

test('summarizes engine baseline', () => {
  const summary = summarizeEngineBaseline([
    { gameKey: 'a', centipawnLoss: 20, bestMoveMatches: true },
    { gameKey: 'b', centipawnLoss: 8, bestMoveMatches: false },
    { gameKey: 'c', centipawnLoss: 12, bestMoveMatches: true }
  ]);
  assert.equal(summary.gamesSampled, 3);
  assert.equal(summary.positionsScored, 3);
  assert.equal(summary.medianCpl, 12);
  assert.equal(summary.topMoveMatchRate, 2 / 3);
});

test('compares current game against personal baseline', () => {
  const result = compareCurrentToBaseline(
    {
      status: 'complete',
      results: [
        { centipawnLoss: 4, bestMoveMatches: true },
        { centipawnLoss: 8, bestMoveMatches: true },
        { centipawnLoss: 12, bestMoveMatches: false }
      ]
    },
    {
      status: 'complete',
      summary: { medianCpl: 25, meanCpl: 30, topMoveMatchRate: 0.4 }
    }
  );
  assert.equal(result.status, 'complete');
  assert.equal(result.currentMedianCpl, 8);
  assert.equal(result.baselineMedianCpl, 25);
  assert.equal(result.medianImprovement, 17);
  assert.equal(result.matchRateDelta, 0.2666666666666666);
});
