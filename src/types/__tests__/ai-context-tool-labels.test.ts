import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AI_CONTEXT_TOOLS } from '../ai-context';

// The layer-4 tool labels (`settings.aiInstructions.tools.<tool>`) are the human
// names the AI-instructions board shows for each tool in AI_CONTEXT_TOOLS. Nothing
// in the type system connects the two, and this app configures no next-intl
// fallback — so a tool added to AI_CONTEXT_TOOLS without a matching label ships
// label-less (silently, in prod). That is exactly how `worksheet_image` shipped
// unlabelled until PR #229. This test pins the invariant so the fifth tool can't
// repeat it: every tool must have a non-empty label in EVERY locale file.

/** Locale files that must carry a label for every tool. */
const LOCALES = ['en', 'ar'] as const;

/** Read `settings.aiInstructions.tools` from a locale's settings namespace. The
 *  messages JSON wraps its namespace in a top-level `settings` key. */
function toolLabels(locale: string): Record<string, unknown> {
  const path = fileURLToPath(
    new URL(`../../../messages/${locale}/settings.json`, import.meta.url),
  );
  const json = JSON.parse(readFileSync(path, 'utf8')) as {
    settings?: { aiInstructions?: { tools?: Record<string, unknown> } };
  };
  return json.settings?.aiInstructions?.tools ?? {};
}

for (const locale of LOCALES) {
  test(`${locale}: every AI_CONTEXT_TOOLS entry has a tool label`, () => {
    const labels = toolLabels(locale);
    for (const tool of AI_CONTEXT_TOOLS) {
      const label = labels[tool];
      assert.equal(
        typeof label === 'string' && label.trim().length > 0,
        true,
        `Missing/empty label for tool "${tool}" in messages/${locale}/settings.json ` +
          `(settings.aiInstructions.tools.${tool}).`,
      );
    }
  });
}
