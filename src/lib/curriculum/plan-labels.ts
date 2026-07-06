// Pure, server-free helpers for resolving a per-plan curriculum label PINNED to
// the plan's stamped curriculum version. Split out from `curriculumUtils` (which
// is `server-only`) so the version-keying contract is unit-testable in isolation,
// the same way `search-match` is split from the server search loader.
//
// The batched DB read that consumes these — `getPlanCurriculumLabels` — lives in
// `@/lib/curriculumUtils` (it needs the service-role client). Both sides agree on
// the key via {@link planCurriculumLabelKey}.

/** The daily outcome + focus area for one lesson row, trimmed for display. */
export interface PlanCurriculumLabel {
  dailyOutcome: string;
  focusArea: string;
}

/**
 * The map key under which a plan's label is stored: a `(lessonKey, versionId)`
 * pair, so two plans sharing a lesson key but stamped to different curriculum
 * versions each resolve their own label — the exact case a re-author creates.
 * A `null`/absent version (a legacy, unstamped plan) collapses to the active
 * bucket. Callers build the same key from their plan rows.
 */
export function planCurriculumLabelKey(
  lessonKey: string,
  versionId: string | null | undefined,
): string {
  // NUL delimiter — never present in a lesson key (`subject|Y2|March|W1|P3`) or a
  // version UUID — so the two segments can never bleed into each other.
  return `${lessonKey}\u0000${versionId ?? ''}`;
}
