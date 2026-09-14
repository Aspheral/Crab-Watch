import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceReport } from '../src/analysis/forensics.js';

const finishedGame = { finished: true, pgn: '1. e4 e5' };

function engineResults(count, bestMoveMatches = true) {
  return Array.from({ length: count }, (_, index) => ({
    centipawnLoss: 2 + index,
    bestMoveMatches
  }));
}

test('does not treat tiny engine samples as moderate engine agreement', () => {
  const report = createEvidenceReport({
    game: finishedGame,
    engineAnalysis: {
      status: 'complete',
      results: engineResults(1, true)
    }
  });

  assert.equal(report.signals.moveQuality.observations.length, 0);
});

test('allows moderate engine agreement once four positions are sampled', () => {
  const report = createEvidenceReport({
    game: finishedGame,
    engineAnalysis: {
      status: 'complete',
      results: engineResults(4, true)
    }
  });

  assert.equal(report.signals.moveQuality.observations.length, 1);
  assert.equal(report.signals.moveQuality.observations[0].strength, 'moderate');
  assert.equal(report.signals.moveQuality.observations[0].kind, 'critical-engine-agreement');
});
