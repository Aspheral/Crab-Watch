import test from 'node:test';
import assert from 'node:assert/strict';
import { positionFingerprints } from '../src/analysis/chess-position.js';

test('reconstructs a basic opening into stable position fingerprints', () => {
  const pgn = '[White "A"] [Black "B"] 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0';
  const positions = positionFingerprints(pgn);
  assert.equal(positions.length, 6);
  assert.equal(positions[0].san, 'e4');
  assert.equal(positions[0].move.from, 'e2');
  assert.equal(positions[0].move.to, 'e4');
  assert.equal(positions[1].san, 'e5');
  assert.equal(positions[1].move.from, 'e7');
  assert.notEqual(positions[0].before, positions[0].after);
});

test('handles castling', () => {
  const pgn = '[White "A"] [Black "B"] 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O 1-0';
  const positions = positionFingerprints(pgn);
  const castle = positions.at(-1);
  assert.equal(castle.san, 'O-O');
  assert.equal(castle.move.from, 'e1');
  assert.equal(castle.move.to, 'g1');
});
