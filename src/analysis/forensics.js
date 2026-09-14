/**
 * Evidence fusion contract.
 *
 * Post-game only. No engine and no live position analysis.
 * A calibrated probability is intentionally unavailable until validated
 * against a labeled corpus of clean and confirmed-cheating games.
 */

export const SIGNALS = Object.freeze([
  'moveQuality', 'positionDifficulty', 'criticalDecision', 'timing',
  'humanErrorProfile', 'historicalStrength', 'changePoint',
  'repeatedDecision', 'similarPosition', 'accountHistory'
]);

const LEVELS = Object.freeze({ none: 0, low: 1, moderate: 2, high: 3 });

function evidenceFromHistory(observations = []) {
  return observations.map(observation => ({ source: 'history', strength: observation.strength, kind: observation.kind, text: observation.text }));
}

function timingObservations(timing) {
  if (!timing || timing.status !== 'complete' || timing.timedMoves < 3) return [];
  const observations = [];
  if (timing.veryFastShare !== null && timing.veryFastShare >= 0.65) {
    observations.push({ source: 'timing', strength: 'low', kind: 'very-fast-response-rate', text: `${Math.round(timing.veryFastShare * 100)}% of moves with clock data were completed within two seconds.` });
  }
  if (timing.fastShare !== null && timing.fastShare >= 0.85 && timing.standardDeviation !== null && timing.standardDeviation < 3) {
    observations.push({ source: 'timing', strength: 'low', kind: 'compressed-think-time', text: 'The recorded move times are unusually concentrated in a narrow fast-response range.' });
  }
  return observations;
}

export function createEvidenceReport({ game, history = [], player = null, historyAnalysis = null, criticalAnalysis = null, timingAnalysis = null }) {
  if (!game?.finished) throw new Error('Crab Watch only accepts completed games.');
  const signals = SIGNALS.reduce((out, key) => {
    out[key] = { status: 'not-run', observations: [] };
    return out;
  }, {});

  signals.accountHistory = { status: 'complete', observations: evidenceFromHistory(historyAnalysis?.observations || []) };
  signals.historicalStrength = {
    status: historyAnalysis?.stats ? 'complete' : 'not-run',
    observations: historyAnalysis?.stats?.ratingDelta !== null && historyAnalysis?.stats?.ratingDelta !== undefined
      ? [{ source: 'history', strength: 'context', kind: 'rating-span', text: `The sampled history spans ${Math.round(Math.abs(historyAnalysis.stats.ratingDelta))} rating points.` }]
      : []
  };
  signals.repeatedDecision = {
    status: historyAnalysis?.current ? 'complete' : 'not-run',
    observations: (historyAnalysis?.current?.exactSameMoveMatches || []).length
      ? [{ source: 'history', strength: 'low', kind: 'exact-position-repeat', text: `${historyAnalysis.current.exactSameMoveMatches.length} recurring position-and-move pattern${historyAnalysis.current.exactSameMoveMatches.length === 1 ? '' : 's'} found.` }]
      : []
  };

  const selectedCritical = criticalAnalysis?.selected || [];
  signals.positionDifficulty = {
    status: criticalAnalysis ? 'complete' : 'not-run',
    observations: selectedCritical.length
      ? [{
          source: 'position-model',
          strength: selectedCritical.some(item => item.classification === 'critical') ? 'moderate' : 'low',
          kind: 'critical-position-scan',
          text: `${selectedCritical.length} decision points were selected for deeper post-game analysis.`
        }]
      : []
  };
  signals.criticalDecision = {
    status: criticalAnalysis ? 'complete' : 'not-run',
    observations: selectedCritical
      .filter(item => item.classification === 'critical')
      .slice(0, 8)
      .map(item => ({
        source: 'position-model',
        strength: 'moderate',
        kind: 'critical-decision',
        text: `${item.san} on move ${item.moveNumber} was flagged as a high-difficulty decision (${item.difficulty}/100): ${item.reasons.join(', ')}.`
      }))
  };

  signals.timing = {
    status: timingAnalysis?.status === 'complete' ? 'complete' : timingAnalysis ? 'no-data' : 'not-run',
    observations: timingObservations(timingAnalysis)
  };

  return {
    version: 5,
    player,
    sample: { currentGame: game, historyGames: history.length },
    critical: criticalAnalysis || { status: 'not-run' },
    timing: timingAnalysis || { status: 'not-run' },
    signals,
    assessment: classifyAssessment({ signals })
  };
}

export function classifyAssessment(report) {
  const observations = Object.values(report.signals).flatMap(signal => signal.observations || []);
  const scored = observations.map(item => LEVELS[item.strength] ?? 0);
  const strongest = scored.length ? Math.max(...scored) : 0;
  const independentKinds = new Set(observations.map(item => item.kind).filter(Boolean));

  if (!observations.length) return { level: 'insufficient-evidence', confidence: 'low', calibratedProbability: null };

  const hasActionable = observations.some(item => LEVELS[item.strength] >= LEVELS.moderate);
  const level = hasActionable && strongest >= LEVELS.high
    ? 'elevated-anomaly'
    : hasActionable && independentKinds.size >= 2
      ? 'review-required'
      : 'context-only';

  return { level, confidence: independentKinds.size >= 2 ? 'moderate' : 'low', calibratedProbability: null };
}
