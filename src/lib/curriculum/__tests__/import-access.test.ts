import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mayRunImport } from '../import-access';

test('H3: a subject member may do a dry run', () => {
  assert.equal(mayRunImport('member', true), true);
});

test('H3: a subject member may not run a real import', () => {
  assert.equal(mayRunImport('member', false), false);
});

test('H3: admins and the subject\'s coordinators may run a real import', () => {
  assert.equal(mayRunImport('admin', false), true);
  assert.equal(mayRunImport('coordinator', false), true);
});

test('H3: someone outside the subject may do neither', () => {
  assert.equal(mayRunImport('none', true), false);
  assert.equal(mayRunImport('none', false), false);
});
