import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleImagePrompt } from '../image-prompt';

// The image prompt is a flat string (no system/user split). These pin the three
// outcomes that matter: a resolved subject adds one sentence in the right place;
// an absent subject (null id, or lookup miss) produces a string byte-identical to
// the pre-change, brief-only assembly. The pre-change assembly is reproduced here
// verbatim as the oracle so a drift in either direction is caught.

const BRIEF = '  Draw a single labelled beaker of water on a plain background.  ';
const COMPOSED = 'ROLE line\n\nPRECEDENCE …\n\n━━━ LAYER 4 … ━━━\ndoc body\n\n━━━ FLOOR … ━━━\nfloor';

/** The exact string the route produced before this change (brief-only). */
const briefOnly = `━━━ IMAGE BRIEF (what to draw) ━━━\n${BRIEF.trim()}\n\n${COMPOSED}`;

test('subject resolves → sentence present, positioned after the header, before the brief', () => {
  const out = assembleImagePrompt({ brief: BRIEF, composedSystem: COMPOSED, subjectName: 'Science' });
  assert.equal(
    out,
    `━━━ IMAGE BRIEF (what to draw) ━━━\nThis illustration will appear on a Science worksheet.\n\n${BRIEF.trim()}\n\n${COMPOSED}`,
  );
  // The sentence sits between the header and the brief, not inside the composed stack.
  const headerIdx = out.indexOf('━━━ IMAGE BRIEF');
  const sentenceIdx = out.indexOf('This illustration will appear on a Science worksheet.');
  const briefIdx = out.indexOf('Draw a single labelled beaker');
  const composedIdx = out.indexOf('ROLE line');
  assert.ok(headerIdx < sentenceIdx && sentenceIdx < briefIdx && briefIdx < composedIdx);
});

test('subjectName is null → byte-identical to the pre-change brief-only assembly', () => {
  const out = assembleImagePrompt({ brief: BRIEF, composedSystem: COMPOSED, subjectName: null });
  assert.equal(out, briefOnly);
});

test('subjectName omitted (lookup miss) → byte-identical to the pre-change assembly', () => {
  const out = assembleImagePrompt({ brief: BRIEF, composedSystem: COMPOSED });
  assert.equal(out, briefOnly);
});

test('blank/whitespace subjectName → dropped cleanly, no partial sentence', () => {
  const out = assembleImagePrompt({ brief: BRIEF, composedSystem: COMPOSED, subjectName: '   ' });
  assert.equal(out, briefOnly);
});
