import test from 'node:test';
import assert from 'node:assert/strict';
import { structuralSimilarity, findSimilarDecisions } from '../src/analysis/similar.js';

const base = '........................k...................................K/w/-/-';
const same = '.................p.............k..........................P...K/w/-/-';
const differentTurn = '.................p.............k..........................P...K/b/-/-';

test('scores structurally similar positions highly', () => {
  const score = structuralSimilarity(same, same);
  const nearby = structuralSimilarity(same, base);
  assert.equal(score, 1);
  assert.ok(nearby > 0.82);
  assert.equal(structuralSimilarity(same, differentTurn), 0);
});

test('finds comparable historical decisions without requiring exact FEN equality', () => {
  const pgn = '[White "opponent"] [Black "hero"] [Result "1-0"] 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0';
  const matches = findSimilarDecisions(same, [{ pgn, url: 'https://chess.com/game/123', white: { username: 'opponent', result: 'win' }, black: { username: 'hero', result: 'loss' } }], 'opponent');
  assert.ok(Array.isArray(matches));
});
