/**
 * Evidence fusion contract.
 * Post-game only. No live position analysis.
 * Calibrated probability remains unavailable until a labeled validation corpus exists.
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
  if (timing.veryFastShare !== null && timing.veryFastShare >= 0.65) observations.push({ source: 'timing', strength: 'low', kind: 'very-fast-response-rate', text: `${Math.round(timing.veryFastShare * 100)}% of moves with clock data were completed within two seconds.` });
  if (timing.fastShare !== null && timing.fastShare >= 0.85 && timing.standardDeviation !== null && timing.standardDeviation < 3) observations.push({ source: 'timing', strength: 'low', kind: 'compressed-think-time', text: 'The recorded move times are unusually concentrated in a narrow fast-response range.' });
  return observations;
}

function engineObservations(engineAnalysis) {
  if (!engineAnalysis || engineAnalysis.status !== 'complete') return [];
  const results = Array.isArray(engineAnalysis.results) ? engineAnalysis.results : [];
  const observations = [];
  const losses = results.map(item => item.centipawnLoss).filter(Number.isFinite);
  const matches = results.filter(item => item.bestMoveMatches).length;
  const meanLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : null;
  if (matches && matches / Math.max(1, results.length) >= 0.75) observations.push({ source: 'engine', strength: 'moderate', kind: 'critical-engine-agreement', text: `${matches} of ${results.length} selected critical decisions matched the engine's top move at the sampled depth.` });
  if (meanLoss !== null && meanLoss <= 12 && losses.length >= 4) observations.push({ source: 'engine', strength: 'low', kind: 'low-critical-cpl', text: `Selected critical positions averaged about ${Math.round(meanLoss)} centipawns of loss.` });
  return observations;
}

export function createEvidenceReport({ game, history = [], player = null, historyAnalysis = null, criticalAnalysis = null, timingAnalysis = null, engineAnalysis = null }) {
  if (!game?.finished) throw new Error('Crab Watch only accepts completed games.');
  const signals = SIGNALS.reduce((out, key) => { out[key] = { status: 'not-run', observations: [] }; return out; }, {});
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
    observations: selectedCritical.length ? [{ source: 'position-model', strength: selectedCritical.some(item => item.classification === 'critical') ? 'moderate' : 'low', kind: 'critical-position-scan', text: `${selectedCritical.length} decision points were selected for deeper post-game analysis.` }] : []
  };
  signals.criticalDecision = {
    status: criticalAnalysis ? 'complete' : 'not-run',
    observations: selectedCritical.filter(item => item.classification === 'critical').slice(0, 8).map(item => ({ source: 'position-model', strength: 'moderate', kind: 'critical-decision', text: `${item.san} on move ${item.moveNumber} was flagged as a high-difficulty decision (${item.difficulty}/100): ${item.reasons.join(', ')}.` }))
  };
  signals.timing = { status: timingAnalysis?.status === 'complete' ? 'complete' : timingAnalysis ? 'no-data' : 'not-run', observations: timingObservations(timingAnalysis) };
  signals.moveQuality = { status: engineAnalysis?.status === 'complete' ? 'complete' : engineAnalysis ? engineAnalysis.status : 'not-run', observations: engineObservations(engineAnalysis) };

  return { version: 6, player, sample: { currentGame: game, historyGames: history.length }, critical: criticalAnalysis || { status: 'not-run' }, timing: timingAnalysis || { status: 'not-run' }, engine: engineAnalysis || { status: 'not-run' }, signals, assessment: classifyAssessment({ signals }) };
}

export function classifyAssessment(report) {
  const observations = Object.values(report.signals).flatMap(signal => signal.observations || []);
  const scored = observations.map(item => LEVELS[item.strength] ?? 0);
  const strongest = scored.length ? Math.max(...scored) : 0;
  const independentKinds = new Set(observations.map(item => item.kind).filter(Boolean));
  if (!observations.length) return { level: 'insufficient-evidence', confidence: 'low', calibratedProbability: null };
  const hasActionable = observations.some(item => LEVELS[item.strength] >= LEVELS.moderate);
  const level = hasActionable && strongest >= LEVELS.high ? 'elevated-anomaly' : hasActionable && independentKinds.size >= 2 ? 'review-required' : 'context-only';
  return { level, confidence: independentKinds.size >= 2 ? 'moderate' : 'low', calibratedProbability: null };
}
