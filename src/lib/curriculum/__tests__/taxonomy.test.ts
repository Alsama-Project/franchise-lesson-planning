import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTaxonomyId,
  isTaxonomyLeaf,
  isFlatArtefact,
  skillKnowledgeKey,
} from '../taxonomy';

// ── The FA-as-year bug, pinned ────────────────────────────────────────────────────
//
// Segment 1 is the Focus Area, not the year. These cases are drawn from the real
// baked English data where seg1 (Focus Area) diverges from the row's year — proving
// no consumer may infer year from the identifier.

test('parses a well-formed FA.S.K.H id into its four segments', () => {
  const t = parseTaxonomyId('4.S3.K0.H6');
  assert.equal(t.focusArea, 4); // Focus Area 4 — NOT a year (this row is Year 1)
  assert.equal(t.skillLo, 'S3');
  assert.equal(t.knowledgeLo, 'K0');
  assert.equal(t.hour, 6);
  assert.equal(t.wellFormed, true);
  assert.equal(t.isPlaceholder, false);
  assert.equal(isTaxonomyLeaf(t), true);
});

test('Year 0 id (FA 0) still parses focusArea 0, not conflated with the year', () => {
  const t = parseTaxonomyId('0.S1.K1.H1');
  assert.equal(t.focusArea, 0);
  assert.equal(t.skillLo, 'S1');
  assert.equal(t.knowledgeLo, 'K1');
  assert.equal(t.hour, 1);
  assert.equal(t.wellFormed, true);
});

test('placeholder "E.*" ids are flagged and excluded from the tree', () => {
  const t = parseTaxonomyId('E.S0.K0.H1');
  assert.equal(t.focusArea, null);
  assert.equal(t.isPlaceholder, true);
  assert.equal(t.wellFormed, false);
  assert.equal(t.skillLo, 'S0'); // still recovers what it carries
  assert.equal(t.knowledgeLo, 'K0');
  assert.equal(t.hour, 1);
  assert.equal(isTaxonomyLeaf(t), false);
});

test('placeholder "L.*" empty-row ids are flagged', () => {
  const t = parseTaxonomyId('L.S0.K0.H2');
  assert.equal(t.isPlaceholder, true);
  assert.equal(isTaxonomyLeaf(t), false);
});

test('flat S0.K0 artefacts are detected for spiral discounting', () => {
  assert.equal(isFlatArtefact(parseTaxonomyId('2.S0.K0.H4')), true);
  assert.equal(isFlatArtefact(parseTaxonomyId('2.S1.K1.H4')), false);
});

test('skillKnowledgeKey composes the S.K group key', () => {
  assert.equal(skillKnowledgeKey(parseTaxonomyId('3.S2.K5.H1')), 'S2.K5');
});

test('null / blank / malformed ids never throw', () => {
  for (const bad of [null, undefined, '', '   ', 'garbage', '1.2.3']) {
    const t = parseTaxonomyId(bad as string | null);
    assert.equal(t.wellFormed, false);
    assert.equal(isTaxonomyLeaf(t) || t.focusArea === null, true);
  }
});

test('recovers segments from lower-case and spacing variants', () => {
  const t = parseTaxonomyId('  2.s5.k2.h4  ');
  assert.equal(t.focusArea, 2);
  assert.equal(t.skillLo, 'S5');
  assert.equal(t.knowledgeLo, 'K2');
  assert.equal(t.hour, 4);
  assert.equal(t.wellFormed, true);
});
