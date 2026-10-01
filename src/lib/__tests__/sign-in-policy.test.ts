import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedEmail, signInErrorKey } from '../sign-in-policy';

test('H1: with an allow-list set, only those email domains may sign in', () => {
  assert.equal(isAllowedEmail('teacher@alsama.org', 'alsama.org'), true);
  assert.equal(isAllowedEmail('Teacher@ALSAMA.org', 'alsama.org, alsama-project.org'), true);
  assert.equal(isAllowedEmail('someone@gmail.com', 'alsama.org'), false);
  assert.equal(isAllowedEmail('x@evil-alsama.org', 'alsama.org'), false);
  assert.equal(isAllowedEmail(null, 'alsama.org'), false);
});

test('H1: with no allow-list set, nobody is refused by this check (tenant pinning still applies)', () => {
  assert.equal(isAllowedEmail('someone@gmail.com', undefined), true);
  assert.equal(isAllowedEmail('someone@gmail.com', '  '), true);
});

test('H1: the sign-in page maps each callback error to a message', () => {
  assert.equal(signInErrorKey('not_allowed'), 'notAllowed');
  assert.equal(signInErrorKey('exchange_failed'), 'failed');
  assert.equal(signInErrorKey('missing_code'), 'failed');
  assert.equal(signInErrorKey('something-else'), 'failed');
  assert.equal(signInErrorKey(undefined), null);
});
