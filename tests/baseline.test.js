import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateEngineResultsByGame, summarizeEngineBaseline, summarizeTemporalEngineBaseline, compareCurrentToBaseline, BASELINE_GAMES, BASELINE_MAX_POSITIONS, BASELINE_MAX_POSITIONS_TOTAL } from '../src/analysis/baseline.js';

test('keeps the historical engine baseline budget explicit', () => {
  assert.equal(BASELINE_GAMES, 12);
  assert.equal(BASELINE_MAX_POSITIONS, 2);
  assert.equal(BASELINE_MAX_POSITIONS_TOTAL, 24);
});

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

test('aggregates multiple engine positions into one game-level result', () => {
  const games = aggregateEngineResultsByGame([
    { gameKey: 'a', endTime: 10, centipawnLoss: 8, bestMoveMatches: true },
    { gameKey: 'a', endTime: 10, centipawnLoss: 20, bestMoveMatches: false },
    { gameKey: 'b', endTime: 9, centipawnLoss: 30, bestMoveMatches: false },
    { gameKey: 'b', endTime: 9, centipawnLoss: 50, bestMoveMatches: false }
  ]);
  assert.equal(games.length, 2);
  assert.equal(games[0].gameKey, 'a');
  assert.equal(games[0].positionsScored, 2);
  assert.equal(games[0].medianCpl, 14);
  assert.equal(games[0].topMoveMatchRate, 0.5);
  assert.equal(games[1].medianCpl, 40);
});

test('excludes incomplete engine positions from baseline aggregation', () => {
  const games = aggregateEngineResultsByGame([
    { gameKey: 'a', endTime: 10, centipawnLoss: 10, bestMoveMatches: true },
    { gameKey: 'a', endTime: 10, centipawnLoss: null, bestMoveMatches: true },
    { gameKey: 'b', endTime: 9, bestMoveMatches: false }
  ]);
  assert.equal(games.length, 1);
  assert.equal(games[0].gameKey, 'a');
  assert.equal(games[0].positionsScored, 1);
  assert.equal(games[0].topMoveMatchRate, 1);
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

test('detects a temporal engine-quality shift across aggregated games', () => {
  const results = [
    { gameKey: 'r1', endTime: 20, medianCpl: 6, topMoveMatchRate: 1 },
    { gameKey: 'r2', endTime: 19, medianCpl: 8, topMoveMatchRate: 1 },
    { gameKey: 'r3', endTime: 18, medianCpl: 10, topMoveMatchRate: 1 },
    { gameKey: 'r4', endTime: 17, medianCpl: 12, topMoveMatchRate: 1 },
    { gameKey: 'r5', endTime: 16, medianCpl: 14, topMoveMatchRate: 0 },
    { gameKey: 'o1', endTime: 5, medianCpl: 45, topMoveMatchRate: 0 },
    { gameKey: 'o2', endTime: 4, medianCpl: 50, topMoveMatchRate: 0 },
    { gameKey: 'o3', endTime: 3, medianCpl: 55, topMoveMatchRate: 0 },
    { gameKey: 'o4', endTime: 2, medianCpl: 60, topMoveMatchRate: 0 },
    { gameKey: 'o5', endTime: 1, medianCpl: 65, topMoveMatchRate: 0 }
  ];
  const result = summarizeTemporalEngineBaseline(results);
  assert.equal(result.status, 'complete');
  assert.ok(result.recentGames >= 4);
  assert.ok(result.olderGames >= 4);
  assert.ok(result.cplShift < 0);
  assert.ok(result.matchRateDelta > 0);
  assert.ok(Array.isArray(result.candidates));
  assert.ok(result.candidates.length >= 2);
  assert.ok(result.candidates[0].score >= result.candidates[1].score);
});

test('does not infer a temporal engine shift from a small sample', () => {
  const result = summarizeTemporalEngineBaseline([
    { gameKey: 'a', endTime: 2, medianCpl: 8, topMoveMatchRate: 1 },
    { gameKey: 'b', endTime: 1, medianCpl: 30, topMoveMatchRate: 0 }
  ]);
  assert.equal(result.status, 'insufficient');
  assert.equal(result.candidate, null);
});
