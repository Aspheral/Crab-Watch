/**
 * Evidence fusion contract.
 *
 * This module is intentionally post-game only. It does not contain an engine
 * and does not produce a calibrated probability. Those require validation
 * against a labeled corpus of clean and confirmed-cheating games.
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

const LEVELS = Object.freeze({
  none: 0,
  low: 1,
  moderate: 2,
  high: 3
});

function evidenceFromHistory(observations = []) {
  return observations.map(observation => ({
    source: 'history',
    strength: observation.strength,
    kind: observation.kind,
    text: observation.text
  }));
}

export function createEvidenceReport({ game, history = [], player = null, historyAnalysis = null }) {
  if (!game?.finished) throw new Error('Crab Watch only accepts completed games.');

  const signals = SIGNALS.reduce((out, key) => {
    out[key] = { status: 'not-run', observations: [] };
    return out;
  }, {});

  signals.accountHistory = {
    status: 'complete',
    observations: evidenceFromHistory(historyAnalysis?.observations || [])
  };

  signals.historicalStrength = {
    status: historyAnalysis?.stats ? 'complete' : 'not-run',
    observations: historyAnalysis?.stats?.ratingDelta !== null && historyAnalysis?.stats?.ratingDelta !== undefined
      ? [{
          source: 'history',
          strength: 'context',
          kind: 'rating-span',
          text: `The sampled history spans ${Math.round(Math.abs(historyAnalysis.stats.ratingDelta))} rating points.`
        }]
      : []
  };

  return {
    version: 2,
    player,
    sample: { currentGame: game, historyGames: history.length },
    signals,
    assessment: classifyAssessment({ signals })
  };
}

export function classifyAssessment(report) {
  const observations = Object.values(report.signals).flatMap(signal => signal.observations || []);
  const scored = observations.map(item => LEVELS[item.strength] ?? 0);
  const strongest = scored.length ? Math.max(...scored) : 0;
  const independentKinds = new Set(observations.map(item => item.kind).filter(Boolean));

  if (!observations.length) {
    return { level: 'insufficient-evidence', confidence: 'low', calibratedProbability: null };
  }

  // This is deliberately a descriptive state, not a cheating probability.
  // Context-only observations never elevate the assessment.
  const hasActionable = observations.some(item => LEVELS[item.strength] >= LEVELS.moderate);
  const level = hasActionable && strongest >= LEVELS.high
    ? 'elevated-anomaly'
    : hasActionable && independentKinds.size >= 2
      ? 'review-required'
      : 'context-only';

  return {
    level,
    confidence: independentKinds.size >= 2 ? 'moderate' : 'low',
    calibratedProbability: null
  };
}
