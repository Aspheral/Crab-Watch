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

function baselineObservations(engineBaseline) {
  const comparison = engineBaseline?.comparison;
  const summary = engineBaseline?.summary;
  if (!comparison || comparison.status !== 'complete' || !summary || summary.gamesSampled < 4 || summary.positionsScored < 4) return [];
  const observations = [];
  if (comparison.baselineMedianCpl !== null && comparison.currentMedianCpl !== null && comparison.currentMedianCpl <= comparison.baselineMedianCpl * 0.45) observations.push({ source: 'personal-baseline', strength: 'moderate', kind: 'historical-engine-improvement', text: `The selected critical decisions had a median engine loss of about ${Math.round(comparison.currentMedianCpl)} cp versus about ${Math.round(comparison.baselineMedianCpl)} cp in the sampled historical baseline.` });
  if (comparison.baselineMatchRate !== null && comparison.currentMatchRate !== null && comparison.matchRateDelta >= 0.35) observations.push({ source: 'personal-baseline', strength: 'moderate', kind: 'historical-top-move-improvement', text: `Top-move agreement was about ${Math.round(comparison.currentMatchRate * 100)}% in this game versus ${Math.round(comparison.baselineMatchRate * 100)}% in the sampled historical baseline.` });
  return observations;
}

function changePointObservations(changePointAnalysis) {
  if (!changePointAnalysis || changePointAnalysis.status !== 'complete' || !changePointAnalysis.candidate) return [];
  const candidate = changePointAnalysis.candidate;
  const observations = [];
  if (candidate.ratingShift !== null && Math.abs(candidate.ratingShift) >= 200) observations.push({ source: 'change-point', strength: 'moderate', kind: 'sustained-rating-shift', text: `The recent account segment is about ${Math.round(Math.abs(candidate.ratingShift))} rating points ${candidate.ratingShift >= 0 ? 'higher' : 'lower'} than the older segment.` });
  if (candidate.resultShift !== null && Math.abs(candidate.resultShift) >= 0.25) observations.push({ source: 'change-point', strength: 'low', kind: 'sustained-result-shift', text: `The recent segment's score rate changed by about ${Math.round(Math.abs(candidate.resultShift) * 100)} percentage points.` });
  if (candidate.moveShift !== null && Math.abs(candidate.moveShift) >= 12) observations.push({ source: 'change-point', strength: 'low', kind: 'sustained-game-length-shift', text: `The recent segment's average game length changed by about ${Math.round(Math.abs(candidate.moveShift))} plies.` });
  return observations;
}

function similarPositionObservations(similarPositionAnalysis) {
  if (!similarPositionAnalysis || similarPositionAnalysis.status !== 'complete') return [];
  const matches = Array.isArray(similarPositionAnalysis.selected) ? similarPositionAnalysis.selected : [];
  const strong = matches.filter(item => item.adjustedSimilarity >= 0.9);
  if (!strong.length) return [];
  const uniqueGames = new Set(strong.map(item => item.gameUrl || item.gameId).filter(Boolean));
  return [{
    source: 'similar-position',
    strength: strong.length >= 4 && uniqueGames.size >= 3 ? 'moderate' : 'low',
    kind: 'structurally-similar-decisions',
    text: `${strong.length} structurally similar historical decision${strong.length === 1 ? '' : 's'} found across ${uniqueGames.size || strong.length} game${uniqueGames.size === 1 ? '' : 's'}.`
  }];
}

export function createEvidenceReport({ game, history = [], player = null, historyAnalysis = null, criticalAnalysis = null, timingAnalysis = null, engineAnalysis = null, engineBaseline = null, changePointAnalysis = null, similarPositionAnalysis = null }) {
  if (!game?.finished) throw new Error('Crab Watch only accepts completed games.');
  const signals = SIGNALS.reduce((out, key) => { out[key] = { status: 'not-run', observations: [] }; return out; }, {});
  signals.accountHistory = { status: 'complete', observations: evidenceFromHistory(historyAnalysis?.observations || []) };
  signals.historicalStrength = { status: historyAnalysis?.stats ? 'complete' : 'not-run', observations: historyAnalysis?.stats?.ratingDelta !== null && historyAnalysis?.stats?.ratingDelta !== undefined ? [{ source: 'history', strength: 'context', kind: 'rating-span', text: `The sampled history spans ${Math.round(Math.abs(historyAnalysis.stats.ratingDelta))} rating points.` }] : [] };
  signals.repeatedDecision = { status: historyAnalysis?.current ? 'complete' : 'not-run', observations: (historyAnalysis?.current?.exactSameMoveMatches || []).length ? [{ source: 'history', strength: 'low', kind: 'exact-position-repeat', text: `${historyAnalysis.current.exactSameMoveMatches.length} recurring position-and-move pattern${historyAnalysis.current.exactSameMoveMatches.length === 1 ? '' : 's'} found.` }] : [] };
  const selectedCritical = criticalAnalysis?.selected || [];
  signals.positionDifficulty = { status: criticalAnalysis ? 'complete' : 'not-run', observations: selectedCritical.length ? [{ source: 'position-model', strength: selectedCritical.some(item => item.classification === 'critical') ? 'moderate' : 'low', kind: 'critical-position-scan', text: `${selectedCritical.length} decision points were selected for deeper analysis.` }] : [] };
  signals.criticalDecision = { status: criticalAnalysis ? 'complete' : 'not-run', observations: selectedCritical.filter(item => item.classification === 'critical').slice(0, 8).map(item => ({ source: 'position-model', strength: 'moderate', kind: 'critical-decision', text: `${item.san} on move ${item.moveNumber} was flagged as a high-difficulty decision (${item.difficulty}/100): ${item.reasons.join(', ')}.` })) };
  signals.timing = { status: timingAnalysis?.status === 'complete' ? 'complete' : timingAnalysis ? 'no-data' : 'not-run', observations: timingObservations(timingAnalysis) };
  signals.moveQuality = { status: engineAnalysis?.status === 'complete' ? 'complete' : engineAnalysis ? engineAnalysis.status : 'not-run', observations: engineObservations(engineAnalysis) };
  signals.humanErrorProfile = { status: engineBaseline?.comparison?.status === 'complete' ? 'complete' : engineBaseline ? 'no-baseline' : 'not-run', observations: baselineObservations(engineBaseline) };
  signals.changePoint = { status: changePointAnalysis?.status === 'complete' ? 'complete' : changePointAnalysis ? changePointAnalysis.status : 'not-run', observations: changePointObservations(changePointAnalysis) };
  signals.similarPosition = { status: similarPositionAnalysis?.status === 'complete' ? 'complete' : similarPositionAnalysis ? similarPositionAnalysis.status : 'not-run', observations: similarPositionObservations(similarPositionAnalysis) };

  return { version: 9, player, sample: { currentGame: game, historyGames: history.length }, critical: criticalAnalysis || { status: 'not-run' }, timing: timingAnalysis || { status: 'not-run' }, engine: engineAnalysis || { status: 'not-run' }, personalBaseline: engineBaseline || { status: 'not-run' }, changePoint: changePointAnalysis || { status: 'not-run' }, similarPositions: similarPositionAnalysis || { status: 'not-run' }, signals, assessment: classifyAssessment({ signals }) };
}

export function classifyAssessment(report) {
  const observations = Object.values(report.signals).flatMap(signal => signal.observations || []);
  const scored = observations.map(item => LEVELS[item.strength] ?? 0);
  const strongest = scored.length ? Math.max(...scored) : 0;
  const independentKinds = new Set(observations.map(item => item.kind).filter(Boolean));
  if (!observations.length) return { level: 'insufficient-evidence', confidence: 'low', calibratedProbability: null };
  const hasActionable = observations.some(item => LEVELS[item.strength] >= LEVELS.moderate);
  const level = hasActionable && strongest >= LEVELS.high ? 'elevated-anomaly' : hasActionable && independentKinds.size >= 2 ? 'review-required' : 'context-only';
  return { level, confidence: independentKinds.size >= 3 ? 'moderate' : 'low', calibratedProbability: null };
}
