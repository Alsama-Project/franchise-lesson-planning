// Behavioural tests for the page-design frame data layer: validation collects EVERY
// failure (never fail-fast) and reports 1-based script line numbers, and the render
// helper injects exercises BEFORE the placeholder pass so exercise content is never
// chewed. Node's built-in test runner (see package.json "test").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXERCISE_SLOT,
  validateFrameHtml,
  renderWorksheetFrame,
} from '../frame';

test('the marker is double-braced {{exercises}}', () => {
  assert.equal(EXERCISE_SLOT, '{{exercises}}');
});

test('a clean frame (marker present, no code) validates', () => {
  const html = '<main><h1>{{subject}}</h1>{{exercises}}</main>';
  const result = validateFrameHtml(html);
  assert.deepEqual(result, { ok: true });
});

test('a missing marker AND a <script> block both report, with correct line numbers', () => {
  // No {{exercises}} anywhere; <script> blocks open on lines 3 and 6.
  const html = [
    '<main>', // 1
    '  <h1>Worksheet</h1>', // 2
    '  <script>alert(1)</script>', // 3
    '  <section>', // 4
    '    content', // 5
    '    <script src="x.js"></script>', // 6
    '  </section>', // 7
    '</main>', // 8
  ].join('\n');

  const result = validateFrameHtml(html);
  assert.equal(result.ok, false);
  assert.ok(!result.ok); // narrow the type
  if (!result.ok) {
    assert.equal(result.rejection.missingMarker, true);
    assert.deepEqual(result.rejection.scriptLines, [3, 6]);
  }
});

test('a marker present but a script still rejects (marker not enough)', () => {
  const html = '<main>{{exercises}}<script>go()</script></main>\n';
  const result = validateFrameHtml(html);
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.missingMarker, false);
    assert.deepEqual(result.rejection.scriptLines, [1]);
  }
});

test('other active-content vectors (iframe, object, on…=, javascript:) are caught by line', () => {
  const html = [
    '<main>{{exercises}}', // 1
    '  <iframe src="x"></iframe>', // 2
    '  <object data="y"></object>', // 3
    '  <div onclick="go()">hi</div>', // 4
    '  <a href="javascript:go()">x</a>', // 5
    '</main>', // 6
  ].join('\n');
  const result = validateFrameHtml(html);
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.missingMarker, false);
    assert.deepEqual(result.rejection.scriptLines, [2, 3, 4, 5]);
  }
});

test('render substitutes known placeholders and blanks unknown ones', () => {
  const html = '<h1>{{subject}} · {{year}}</h1><p>{{unknown}}</p>{{exercises}}';
  const out = renderWorksheetFrame(html, { subject: 'English', year: 2026 }, '<ol></ol>');
  assert.equal(out, '<h1>English · 2026</h1><p></p><ol></ol>');
});

test('exercises are injected BEFORE the placeholder pass — a {{…}} inside them survives', () => {
  // The exercise content itself contains a {{placeholder}}-looking token. Because the
  // marker is split out first and the placeholder pass runs on the frame segments
  // only, that token must pass through the injected exercises verbatim.
  const html = '<main>{{subject}}: {{exercises}}</main>';
  const exercises = '<p>Fill in {{blank}} and keep {{subject}} literal.</p>';
  const out = renderWorksheetFrame(html, { subject: 'Maths' }, exercises);
  assert.equal(out, '<main>Maths: <p>Fill in {{blank}} and keep {{subject}} literal.</p></main>');
});

test('a repeated marker injects the exercises at each occurrence', () => {
  const html = '{{exercises}}--{{exercises}}';
  const out = renderWorksheetFrame(html, {}, 'X');
  assert.equal(out, 'X--X');
});
