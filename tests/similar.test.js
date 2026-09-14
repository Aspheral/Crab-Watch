import test from 'node:test';
import assert from 'node:assert/strict';
import { structuralSimilarity, decisionSimilarity, findSimilarDecisions } from '../src/analysis/similar.js';

const board = (whitePawn = false) => {
  const squares = Array(64).fill('.');
  squares[4] = 'k';
  squares[60] = 'K';
  if (whitePawn) squares[36] = 'P';
  else squares[35] = 'p';
  return squares.join('');
};

const same = `${board(true)}/w/-/-`;
const differentTurn = `${board(true)}/b/-/-`;

test('scores structurally similar positions highly', () => {
  const score = structuralSimilarity(same, same);
  const nearby = structuralSimilarity(same, `${board(true)}/w/KQkq/-`);
  assert.equal(score, 1);
  assert.ok(nearby > 0.82);
  assert.equal(structuralSimilarity(same, differentTurn), 0);
});

test('scores analogous decisions higher than unrelated moves', () => {
  const current = { from: 'e2', to: 'e4' };
  assert.equal(decisionSimilarity(current, 'e4', { from: 'e2', to: 'e4' }, 'e4'), 1);
  assert.ok(decisionSimilarity(current, 'e4', { from: 'e2', to: 'e3' }, 'e3') >= 0.75);
  assert.ok(decisionSimilarity(current, 'e4', { from: 'g1', to: 'f3' }, 'Nf3') < 0.5);
});

test('finds comparable historical decisions without requiring exact FEN equality', () => {
  const pgn = '[White "opponent"] [Black "hero"] [Result "1-0"] 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0';
  const matches = findSimilarDecisions(same, [{ pgn, url: 'https://chess.com/game/123', white: { username: 'opponent', result: 'win' }, black: { username: 'hero', result: 'loss' } }], 'opponent', { currentMove: { from: 'e2', to: 'e4' }, currentSan: 'e4' });
  assert.ok(Array.isArray(matches));
  assert.ok(matches.every(match => 'decisionSimilarity' in match));
});
