import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCriticalPositions } from '../src/analysis/critical.js';

test('detects tactical moves as stronger critical candidates', async () => {
  const pgn = '[White "A"] [Black "B"] 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 Bc5 5. Bxf7+ 1-0';
  const report = await detectCriticalPositions(pgn, 'w', 5);
  assert.ok(report.analyzedPlies >= 9);
  assert.ok(report.selected.length >= 1);
  assert.ok(report.candidates.some(item => item.san === 'Bxf7+'));
  const tactic = report.candidates.find(item => item.san === 'Bxf7+');
  assert.ok(tactic.difficulty >= 20);
  assert.ok(tactic.reasons.includes('check or mate'));
  assert.ok(tactic.reasons.includes('capture'));
});

test('keeps selected critical positions separated', async () => {
  const pgn = '[White "A"] [Black "B"] 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 1-0';
  const report = await detectCriticalPositions(pgn, 'w', 8);
  for (let i = 1; i < report.selected.length; i += 1) {
    assert.ok(Math.abs(report.selected[i].ply - report.selected[i - 1].ply) > 2);
  }
});
