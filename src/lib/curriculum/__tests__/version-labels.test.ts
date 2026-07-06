import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCurriculumLabelKey } from '../plan-labels';

// The label map that `getPlanCurriculumLabels` returns is keyed by
// `planCurriculumLabelKey(lessonKey, versionId)`. Its whole job is to keep two
// plans that share a lesson_key but were stamped to DIFFERENT curriculum versions
// from colliding — the exact case a re-author creates. These tests pin that
// contract so the version can never silently drop out of the key.

test('same lesson key + different version → distinct buckets', () => {
  const key = 'english|Y2|March|W1|P3';
  assert.notEqual(
    planCurriculumLabelKey(key, 'ver-1'),
    planCurriculumLabelKey(key, 'ver-2'),
  );
});

test('same lesson key + same version → identical bucket (stable, batchable)', () => {
  const key = 'english|Y2|March|W1|P3';
  assert.equal(
    planCurriculumLabelKey(key, 'ver-1'),
    planCurriculumLabelKey(key, 'ver-1'),
  );
});

test('null and undefined version collapse to the SAME active bucket', () => {
  const key = 'english|Y2|March|W1|P3';
  // A legacy/unstamped plan (null) and one passed undefined both resolve against
  // the active-version view, so they must land in one bucket.
  assert.equal(
    planCurriculumLabelKey(key, null),
    planCurriculumLabelKey(key, undefined),
  );
});

test('a stamped version is distinct from the active (null) bucket', () => {
  const key = 'english|Y2|March|W1|P3';
  assert.notEqual(
    planCurriculumLabelKey(key, 'ver-1'),
    planCurriculumLabelKey(key, null),
  );
});

test('different lesson keys never collide even on the same version', () => {
  assert.notEqual(
    planCurriculumLabelKey('english|Y2|March|W1|P3', 'ver-1'),
    planCurriculumLabelKey('english|Y2|March|W1|P4', 'ver-1'),
  );
});
