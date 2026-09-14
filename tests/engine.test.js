import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintToFen, parseBestmove, parseInfoScore, scoreLoss } from '../src/analysis/engine.js';

test('converts a position fingerprint into FEN', () => {
  const board = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';
  assert.equal(fingerprintToFen(`${board}/w/KQkq/-`), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
});

test('parses Stockfish UCI lines', () => {
  assert.equal(parseBestmove('bestmove e2e4 ponder e7e5'), 'e2e4');
  assert.deepEqual(parseInfoScore('info depth 15 score cp 37 nodes 1000'), { type: 'cp', value: 37 });
  assert.deepEqual(parseInfoScore('info depth 15 score mate -3'), { type: 'mate', value: -3 });
});

test('computes non-negative centipawn loss', () => {
  assert.equal(scoreLoss({ type: 'cp', value: 82 }, { type: 'cp', value: 21 }), 61);
  assert.equal(scoreLoss({ type: 'cp', value: 21 }, { type: 'cp', value: 82 }), 0);
});
