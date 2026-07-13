// Content-locale strings for the student-worksheet ARTIFACT (the A4 preview and its
// printed/PDF output).
//
// The worksheet is a content-language artifact: its scaffold (STUDENT WORKSHEET,
// Name/Date/Class, the objective prefix, "Exercise N", the footer) must follow the
// SUBJECT's language — an Arabic-subject worksheet stays Arabic for an English-UI
// teacher, and an English-subject worksheet stays English for an Arabic-UI teacher.
//
// This is DELIBERATELY separate from next-intl / `useTranslations`, which resolve
// the UI locale (the NEXT_LOCALE cookie) — the wrong signal here. We import both
// catalogs statically and select by the subject's `content_language`, threaded to
// the render as `WorksheetContext.contentLanguage`. Client-safe (no `server-only`,
// no fs): both mastheads and the block heading render in client components.

import en from '../../../messages/en/worksheetArtifact.json';
import ar from '../../../messages/ar/worksheetArtifact.json';

/** The language a subject's content is taught/produced in. Mirrors the DB CHECK on
 *  `subjects.content_language` (see migration 0061). */
export type WorksheetContentLanguage = 'en' | 'ar';

/** The artifact catalog shape (keys are fixed by the English source of truth). */
export type WorksheetArtifactCatalog = typeof en;
export type WorksheetArtifactKey = keyof WorksheetArtifactCatalog;

const CATALOGS: Record<WorksheetContentLanguage, WorksheetArtifactCatalog> = { en, ar };

/** The full catalog for a content language (falls back to English for any unknown). */
export function worksheetArtifactCatalog(
  language: WorksheetContentLanguage,
): WorksheetArtifactCatalog {
  return CATALOGS[language] ?? CATALOGS.en;
}

/** Interpolate `{name}` placeholders in a catalog template. Unmatched names are left
 *  as-is, so a missing var is visible rather than silently dropped. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}

/**
 * Resolve one artifact string in the subject's content language, interpolating any
 * `{year}` / `{code}` / `{i}` / `{n}` placeholders.
 *
 *   worksheetArtifactText('ar', 'name')                    // "الاسم"
 *   worksheetArtifactText('en', 'exerciseHeading', { n: 3 }) // "Exercise 3"
 */
export function worksheetArtifactText(
  language: WorksheetContentLanguage,
  key: WorksheetArtifactKey,
  vars?: Record<string, string | number>,
): string {
  return interpolate(worksheetArtifactCatalog(language)[key], vars);
}
