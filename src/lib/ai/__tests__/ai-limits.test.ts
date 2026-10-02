import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DAILY_LIMITS, dailyLimit, inputSize, MAX_AI_INPUT_CHARS } from '../ai-limits';

test('H8: every AI feature has a default daily limit', () => {
  for (const f of ['objective_check', 'resource', 'worksheet_plan', 'worksheet_exercise', 'worksheet_image'] as const) {
    assert.ok(DEFAULT_DAILY_LIMITS[f] > 0, f);
  }
});

test('H8: a daily limit can be changed per feature with an environment variable', () => {
  assert.equal(dailyLimit('worksheet_image', { AI_DAILY_LIMIT_WORKSHEET_IMAGE: '7' }), 7);
  assert.equal(dailyLimit('worksheet_image', {}), DEFAULT_DAILY_LIMITS.worksheet_image);
  assert.equal(dailyLimit('worksheet_image', { AI_DAILY_LIMIT_WORKSHEET_IMAGE: 'nonsense' }), DEFAULT_DAILY_LIMITS.worksheet_image);
});

test('H8: input size counts every text a request sends to the model', () => {
  assert.equal(inputSize(['abc', undefined, null, 'de']), 5);
  assert.equal(inputSize([{ a: 'xyz' }]), JSON.stringify({ a: 'xyz' }).length);
  assert.ok(inputSize(['x'.repeat(MAX_AI_INPUT_CHARS + 1)]) > MAX_AI_INPUT_CHARS);
});
