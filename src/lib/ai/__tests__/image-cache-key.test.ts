import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageCacheKey, normaliseSubject } from '../image-cache-key';

// Fault 2 — the money fix, proven by behaviour, not inspection.
//
// The key hashes the SUBJECT and never the brief. These tests observe the outcomes
// that matter: the brief is not even an input; trivially-equivalent subjects collide;
// genuinely different subjects diverge; and a teacher instruction forks the key so an
// adjusted image can't poison a later plain request.

test('the key is brief-invariant: same subject → same key regardless of any prose', () => {
  // The route previously hashed the model-authored brief, which differs every run.
  // The key now takes only the subject — there is no brief parameter to vary.
  const a = imageCacheKey('a bus');
  const b = imageCacheKey('a bus');
  assert.equal(a, b, 'identical subjects must produce the identical key');
});

test('trivially-equivalent subjects collide (case, punctuation, leading article)', () => {
  const base = imageCacheKey('a bus');
  assert.equal(imageCacheKey('A bus'), base, 'case must not matter');
  assert.equal(imageCacheKey('the bus'), base, 'a leading article must not matter');
  assert.equal(imageCacheKey('bus'), base, 'article-stripped form must match');
  assert.equal(imageCacheKey('  a   bus. '), base, 'whitespace/punctuation must not matter');
});

test('genuinely different subjects produce different keys', () => {
  assert.notEqual(imageCacheKey('a bus'), imageCacheKey('a car'));
  assert.notEqual(imageCacheKey('a busy street scene'), imageCacheKey('a bus'));
});

test('a teacher instruction forks the key (anti cache-poisoning), and is itself stable', () => {
  const plain = imageCacheKey('a bus');
  const steered = imageCacheKey('a bus', 'make it simpler');
  assert.notEqual(steered, plain, 'an adjusted image must not be stored under the plain-subject key');
  assert.equal(steered, imageCacheKey('a bus', 'make it simpler'), 'the steered key is deterministic');
  // A blank/whitespace instruction is inert — identical to no instruction.
  assert.equal(imageCacheKey('a bus', '   '), plain);
  assert.equal(imageCacheKey('a bus', null), plain);
});

test('normaliseSubject is the deliberately literal fold it claims to be', () => {
  assert.equal(normaliseSubject('The Bus!'), 'bus');
  assert.equal(normaliseSubject('a busy market street'), 'busy market street');
  // Unicode-aware: Arabic subjects survive the punctuation strip.
  assert.equal(normaliseSubject('حافلة'), 'حافلة');
});
