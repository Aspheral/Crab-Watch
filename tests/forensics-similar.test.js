import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceReport } from '../src/analysis/forensics.js';

const finishedGame = { finished: true, pgn: '1. e4 e5' };

function match(gameUrl, decisionSimilarity = 1, adjustedSimilarity = 0.95) {
  return { gameUrl, decisionSimilarity, adjustedSimilarity, decisionAgreement: true };
}

test('does not let repeated similar matches from one game create broad evidence', () => {
  const report = createEvidenceReport({
    game: finishedGame,
    similarPositionAnalysis: {
      status: 'complete',
      selected: [match('https://chess.com/game/1'), match('https://chess.com/game/1', 0.9, 0.92), match('https://chess.com/game/1', 0.85, 0.91)]
    }
  });

  const observations = report.signals.similarPosition.observations;
  assert.equal(observations.length, 1);
  assert.equal(observations[0].strength, 'low');
  assert.match(observations[0].text, /1 historical game/);
});

test('requires three distinct historical games for moderate similar-position evidence', () => {
  const report = createEvidenceReport({
    game: finishedGame,
    similarPositionAnalysis: {
      status: 'complete',
      selected: [
        match('https://chess.com/game/1'),
        match('https://chess.com/game/2'),
        match('https://chess.com/game/2', 0.9, 0.92),
        match('https://chess.com/game/3')
      ]
    }
  });

  const observations = report.signals.similarPosition.observations;
  assert.equal(observations.length, 1);
  assert.equal(observations[0].strength, 'moderate');
  assert.match(observations[0].text, /3 historical games/);
});
