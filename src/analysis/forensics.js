/**
 * Crab Watch forensic pipeline contract.
 *
 * This module intentionally does not run inside the live Chess.com page.
 * It accepts completed-game data only.
 *
 * The first implementation is a framework, not a cheating detector. Numeric
 * weights should not be presented as calibrated probabilities until they have
 * been validated against a labeled corpus of clean and confirmed-cheating games.
 */

export const SIGNALS = Object.freeze([
  'moveQuality',
  'positionDifficulty',
  'criticalDecision',
  'timing',
  'humanErrorProfile',
  'historicalStrength',
  'changePoint',
  'repeatedDecision',
  'similarPosition',
  'accountHistory'
]);

export function createEvidenceReport({ game, history = [], player = null }) {
  if (!game?.finished) {
    throw new Error('Crab Watch only accepts completed games.');
  }

  return {
    version: 1,
    player,
    sample: {
      currentGame: game,
      historyGames: history.length
    },
    signals: SIGNALS.reduce((out, key) => {
      out[key] = { status: 'not-run', observations: [] };
      return out;
    }, {}),
    assessment: {
      level: 'insufficient-evidence',
      confidence: 'low',
      calibratedProbability: null
    }
  };
}

export function classifyAssessment(report) {
  const observations = Object.values(report.signals)
    .flatMap(signal => signal.observations || []);

  if (!observations.length) {
    return { level: 'insufficient-evidence', confidence: 'low' };
  }

  // Placeholder only. Real evidence fusion will be implemented after the
  // individual signal modules and validation corpus exist.
  return { level: 'review-required', confidence: 'low' };
}
