// Behavioural tests for the frame processing pipeline (parse + scope). The transform
// is the load-bearing part of the branch: it turns a complete design-tool document
// into safe, scoped { bodyHtml, css } without pushing a fragment contract onto the
// uploader. Node's built-in test runner (see package.json "test").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseFrame } from '../parse';
import { validateFrameHtml, FRAME_ROOT_SELECTOR } from '../frame';
import { defaultFrameHtml } from '../defaults';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(HERE, 'fixtures', name), 'utf8');

test('a full document with global selectors: html/body/:root → root, * → descendants, others prefixed', () => {
  const html = [
    '<!DOCTYPE html>',
    '<html><head><style>',
    '  * { box-sizing: border-box; }',
    '  html { background: #eee; }',
    '  body { font-size: 12pt; color: #111; }',
    '  :root { --x: 1; }',
    '  .masthead td { border: 1pt solid #000; }',
    '  a:hover { color: red; }',
    '</style></head>',
    '<body><main>{{exercises}}</main></body></html>',
  ].join('\n');

  const { css } = parseFrame(html);
  const R = FRAME_ROOT_SELECTOR;
  assert.ok(css.includes(`${R} *`), 'universal selector scoped to descendants');
  assert.ok(css.includes(`${R} {`) || css.includes(`${R} {`.replace(' ', '')), 'html/body/:root map to the root');
  // html, body and :root all collapse onto the root container (no bare html/body left).
  assert.ok(!/(^|[^-\w.])html\s*\{/.test(css), 'no bare html rule remains');
  assert.ok(!/(^|[^-\w.])body\s*\{/.test(css), 'no bare body rule remains');
  assert.ok(css.includes(`${R} .masthead td`), 'descendant selector prefixed with root');
  assert.ok(css.includes(`${R} a:hover`), 'pseudo-class selector prefixed with root');
});

test('an @page rule is hoisted verbatim, not scoped', () => {
  const html = [
    '<html><head><style>',
    '@page { size: A4 portrait; margin: 20mm; }',
    '.body { padding: 8mm; }',
    '</style></head><body>{{exercises}}</body></html>',
  ].join('\n');

  const { css } = parseFrame(html);
  assert.ok(/@page\s*\{[^}]*A4 portrait/.test(css), '@page preserved');
  // The @page rule must NOT be prefixed with the root container.
  assert.ok(!css.includes(`${FRAME_ROOT_SELECTOR} @page`), '@page not scoped');
  assert.ok(!/@page[^{]*\.ws-frame-root/.test(css), '@page selector untouched');
});

test('a @media print block is preserved and its inner rules scoped', () => {
  const html = [
    '<html><head><style>',
    '@media print {',
    '  html, body { background: #fff; }',
    '  .screen-footer { display: none; }',
    '}',
    '</style></head><body>{{exercises}}</body></html>',
  ].join('\n');

  const { css } = parseFrame(html);
  const R = FRAME_ROOT_SELECTOR;
  assert.ok(css.includes('@media print'), '@media print kept');
  assert.ok(css.includes(`${R} .screen-footer`), 'inner selector scoped');
  // html, body inside the media block collapse to the root container.
  const mediaBlock = css.slice(css.indexOf('@media print'));
  assert.ok(mediaBlock.includes(`${R} {`), 'html/body inside @media map to the root');
  assert.ok(!/@media print\s*\{[\s\S]*\bhtml\s*,/.test(css), 'no bare html left inside @media');
});

test('the {{exercises}} marker survives inside nested elements, in the body HTML', () => {
  const html =
    '<html><head><style>.body{}</style></head>' +
    '<body><div class="sheet"><main class="body"><div class="slot">{{exercises}}</div></main></div></body></html>';

  const { bodyHtml } = parseFrame(html);
  assert.ok(bodyHtml.includes('{{exercises}}'), 'marker preserved in body');
  assert.ok(bodyHtml.includes('class="sheet"') && bodyHtml.includes('class="body"'), 'nesting preserved');
  // The marker is not extracted or moved — it is still inside the nested structure.
  assert.match(bodyHtml, /<main class="body">[\s\S]*\{\{exercises\}\}[\s\S]*<\/main>/);
});

test('a document containing a <script> (and other active content) is stripped from the body', () => {
  const html = [
    '<html><head><style>.body{}</style></head>',
    '<body>',
    '  <main>{{exercises}}</main>',
    '  <script>alert(1)</script>',
    '  <iframe src="x"></iframe>',
    '  <object data="y"></object>',
    '  <div onclick="go()">hi</div>',
    '  <a href="javascript:go()">x</a>',
    '</body></html>',
  ].join('\n');

  const { bodyHtml } = parseFrame(html);
  assert.ok(!/<script/i.test(bodyHtml), 'script removed');
  assert.ok(!/<iframe/i.test(bodyHtml), 'iframe removed');
  assert.ok(!/<object/i.test(bodyHtml), 'object removed');
  assert.ok(!/onclick/i.test(bodyHtml), 'event handler attribute removed');
  assert.ok(!/javascript:/i.test(bodyHtml), 'javascript: URL removed');
  assert.ok(bodyHtml.includes('>hi<'), 'the element itself is kept, only the handler stripped');
});

test('external font <link> and @import are dropped; @font-face is dropped', () => {
  const html = [
    '<html><head>',
    '<link href="https://fonts.googleapis.com/css2?family=Sora" rel="stylesheet">',
    '<style>',
    '@import url("https://example.com/x.css");',
    '@font-face { font-family: Foo; src: url(https://x/f.woff2); }',
    '.body { color: #000; }',
    '</style></head><body><link rel="stylesheet" href="https://x/y.css">{{exercises}}</body></html>',
  ].join('\n');

  const { bodyHtml, css } = parseFrame(html);
  assert.ok(!/<link/i.test(bodyHtml), 'link element removed from body');
  assert.ok(!/@import/i.test(css), '@import dropped');
  assert.ok(!/@font-face/i.test(css), '@font-face dropped');
});

test('font families are mapped onto the app self-hosted faces', () => {
  const html = [
    '<html><head><style>',
    'body { font-family: "Noto Sans Arabic", Sora, sans-serif; }',
    '</style></head><body>{{exercises}}</body></html>',
  ].join('\n');

  const { css } = parseFrame(html);
  assert.ok(css.includes('var(--font-ibm-plex-arabic)'), 'Noto Sans Arabic → IBM Plex var');
  assert.ok(css.includes('var(--font-sora)'), 'Sora → Sora var');
  assert.ok(!/Noto Sans Arabic/.test(css), 'no literal Noto family left');
});

// ── The two supplied files, unmodified ──────────────────────────────────────────

for (const name of ['alsama-page-en.html', 'alsama-page-ar.html']) {
  test(`supplied file ${name} passes validateFrameHtml unmodified`, () => {
    const html = fixture(name);
    assert.deepEqual(validateFrameHtml(html), { ok: true });
  });

  test(`supplied file ${name} parses to non-empty body + scoped css with the marker`, () => {
    const { bodyHtml, css } = parseFrame(fixture(name));
    assert.ok(bodyHtml.includes('{{exercises}}'), 'marker preserved');
    assert.ok(bodyHtml.length > 0 && css.length > 0, 'non-empty output');
    assert.ok(css.includes(FRAME_ROOT_SELECTOR), 'css scoped to the root container');
    assert.ok(!/<script/i.test(bodyHtml), 'no active content in body');
  });
}

test('the Arabic supplied file carries dir=rtl and lang=ar onto the parsed frame', () => {
  const parsed = parseFrame(fixture('alsama-page-ar.html'));
  assert.equal(parsed.dir, 'rtl');
  assert.equal(parsed.lang, 'ar');
});

// ── The built-in defaults (the fixed versions shipped in code) ──────────────────

for (const lang of ['en', 'ar'] as const) {
  test(`built-in default (${lang}) validates, parses, and applies the three fixes`, () => {
    const html = defaultFrameHtml(lang);
    assert.deepEqual(validateFrameHtml(html), { ok: true });

    const { bodyHtml, css } = parseFrame(html);
    // Fix 1: the marker is not wrapped in a .slot placeholder container.
    assert.ok(bodyHtml.includes('{{exercises}}'), 'marker present');
    assert.ok(!/class="slot"/.test(bodyHtml), 'no .slot placeholder wrapper');
    assert.ok(!/\.slot\s*\{/.test(css), 'no .slot styling');
    // Fix 2: {{theme}} is the lesson title, {{lesson_key}} sits beneath it.
    assert.ok(/lesson-title[^>]*>\{\{theme\}\}/.test(bodyHtml), '{{theme}} in the title');
    assert.ok(bodyHtml.includes('{{lesson_key}}'), '{{lesson_key}} kept beneath');
    // Fix 3: no A4 paper simulation on .sheet (the pane draws the page).
    assert.ok(!/\.sheet[^}]*box-shadow/.test(css.replace(/\s+/g, ' ')), 'no .sheet box-shadow');
    assert.ok(!/210mm/.test(css), 'no A4 width simulation');
    // Logo points at the real asset, not a public-root file that does not exist.
    assert.ok(bodyHtml.includes('/brand/alsama-logo.png'), 'logo → /brand/alsama-logo.png');
    assert.ok(!bodyHtml.includes('"/alsama-logo.png"'), 'no public-root logo path');
  });
}

test('the Arabic default uses the app IBM Plex Sans Arabic face (no dead web font)', () => {
  const { css } = parseFrame(defaultFrameHtml('ar'));
  assert.ok(css.includes('var(--font-ibm-plex-arabic)'), 'Arabic font from the app');
  assert.ok(!/Noto Sans Arabic/.test(css), 'no Noto dependency');
});
