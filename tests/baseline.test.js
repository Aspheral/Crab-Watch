import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeEngineBaseline, summarizeTemporalEngineBaseline, compareCurrentToBaseline } from '../src/analysis/baseline.js';

test('summarizes engine baseline', () => {
  const result = summarizeEngineBaseline([
    { gameKey: 'a', centipawnLoss: 20, bestMoveMatches: true },
    { gameKey: 'b', centipawnLoss: 8, bestMoveMatches: false },
    { gameKey: 'c', centipawnLoss: 12, bestMoveMatches: true }
  ]);
  assert.equal(result.gamesSampled, 3);
  assert.equal(result.positionsScored, 3);
  assert.equal(result.medianCpl, 12);
  assert.equal(result.topMoveMatchRate, 2 / 3);
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

test('detects a temporal engine-quality shift only with enough historical games', () => {
  const results = [
    { gameKey: 'r1', endTime: 20, centipawnLoss: 6, bestMoveMatches: true },
    { gameKey: 'r2', endTime: 19, centipawnLoss: 8, bestMoveMatches: true },
    { gameKey: 'r3', endTime: 18, centipawnLoss: 10, bestMoveMatches: true },
    { gameKey: 'r4', endTime: 17, centipawnLoss: 12, bestMoveMatches: false },
    { gameKey: 'o1', endTime: 4, centipawnLoss: 45, bestMoveMatches: false },
    { gameKey: 'o2', endTime: 3, centipawnLoss: 50, bestMoveMatches: false },
    { gameKey: 'o3', endTime: 2, centipawnLoss: 55, bestMoveMatches: false },
    { gameKey: 'o4', endTime: 1, centipawnLoss: 60, bestMoveMatches: false }
  ];
  const result = summarizeTemporalEngineBaseline(results);
  assert.equal(result.status, 'complete');
  assert.equal(result.recentGames, 4);
  assert.equal(result.olderGames, 4);
  assert.equal(result.cplShift, -39);
  assert.equal(result.matchRateDelta, 0.75);
});

test('does not infer a temporal engine shift from a small sample', () => {
  const result = summarizeTemporalEngineBaseline([
    { gameKey: 'a', endTime: 2, centipawnLoss: 8, bestMoveMatches: true },
    { gameKey: 'b', endTime: 1, centipawnLoss: 30, bestMoveMatches: false }
  ]);
  assert.equal(result.status, 'insufficient');
});
