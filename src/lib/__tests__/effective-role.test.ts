import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveRole } from '../role';

test('L5: a stored admin role only counts while the database says admin', () => {
  assert.equal(effectiveRole('admin', true), 'admin');
});

test('L5: a deactivated admin (database says not admin) is treated as a teacher at once', () => {
  assert.equal(effectiveRole('admin', false), 'teacher');
});

test('L5: other roles are unchanged', () => {
  assert.equal(effectiveRole('teacher', false), 'teacher');
  assert.equal(effectiveRole('coordinator', false), 'coordinator');
});
