function parseClock(value) {
  const parts = String(value || '').trim().split(':').map(Number);
  if (parts.some(part => !Number.isFinite(part))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

function parseIncrement(timeControl) {
  const match = String(timeControl || '').match(/\+(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function parsePlies(pgn = '') {
  const timeControl = pgn.match(/\[TimeControl\s+"([^"]+)"\]/i)?.[1] || null;
  const increment = parseIncrement(timeControl);
  const comments = pgn.match(/\{[^}]*\}/g) || [];
  const clocks = [];
  for (const comment of comments) {
    const match = comment.match(/\[%clk\s+([^\]]+)\]/i);
    if (!match) continue;
    clocks.push(parseClock(match[1]));
  }

  const movetext = pgn
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, ' ')
    .split(/\s+/)
    .map(token => token.replace(/^\d+\.(\.\.)?/, '').replace(/^\.+/, '').trim())
    .filter(token => token && !/^\d+$/.test(token) && !/^\$\d+$/.test(token));

  return { timeControl, increment, movetext, clocks };
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

export function analyzeTiming(pgn = '', focusColor = null) {
  const parsed = parsePlies(pgn);
  const entries = [];
  let lastClock = { w: null, b: null };
  let ply = 0;

  for (let i = 0; i < parsed.movetext.length && i < parsed.clocks.length; i += 1) {
    const san = parsed.movetext[i];
    const clock = parsed.clocks[i];
    if (!Number.isFinite(clock)) continue;
    ply += 1;
    const color = ply % 2 === 1 ? 'w' : 'b';
    const previous = lastClock[color];
    let spent = null;
    if (previous !== null) {
      spent = previous - clock + parsed.increment;
      if (spent < 0 || spent > 3600) spent = null;
    }
    lastClock[color] = clock;
    if (!focusColor || color === focusColor) {
      entries.push({ ply, moveNumber: Math.ceil(ply / 2), color, san, remaining: clock, spent });
    }
  }

  const moveTimes = entries.map(entry => entry.spent).filter(Number.isFinite);
  const known = moveTimes.length;
  const veryFast = moveTimes.filter(seconds => seconds <= 2).length;
  const fast = moveTimes.filter(seconds => seconds <= 5).length;
  const medianSeconds = median(moveTimes);
  const p90Seconds = percentile(moveTimes, 0.9);
  const averageSeconds = known ? moveTimes.reduce((sum, value) => sum + value, 0) / known : null;
  const fastShare = known ? fast / known : null;
  const veryFastShare = known ? veryFast / known : null;

  const mean = averageSeconds;
  const variance = known > 1 && mean !== null
    ? moveTimes.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (known - 1)
    : null;
  const standardDeviation = variance !== null ? Math.sqrt(variance) : null;

  return {
    status: known ? 'complete' : 'no-clock-data',
    timeControl: parsed.timeControl,
    increment: parsed.increment,
    focusColor,
    sampleSize: entries.length,
    timedMoves: known,
    entries,
    medianSeconds,
    averageSeconds,
    p90Seconds,
    standardDeviation,
    fastShare,
    veryFastShare
  };
}
