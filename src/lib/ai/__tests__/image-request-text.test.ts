import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageRequestText } from '../image-cache-key';

test('H4: the image is drawn from the stored slot subject, not the text the browser sends', () => {
  assert.equal(imageRequestText('an apple', 'something else entirely'), 'an apple');
});

test('H4: legacy slots with no stored subject fall back to the brief (key and prompt still match)', () => {
  assert.equal(imageRequestText(null, 'a red bus'), 'a red bus');
  assert.equal(imageRequestText('   ', 'a red bus'), 'a red bus');
});
