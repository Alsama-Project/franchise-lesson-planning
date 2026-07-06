// Canonical parser for the curriculum taxonomy identifier — the single source of
// truth every consumer must use, so the historical FA-as-year bug can never leak
// back in.
//
// FORMAT: `FA.S.K.H`
//   FA — Focus Area number      (segment 1)   ← NOT the year. The old baked
//        `curriculum.json` id's first digit *coincides* with the year only for
//        Year 0 (FA 0); for Years 1–6 the Focus Area runs 1–4 independently of the
//        year (verified: seg1 ∈ {0..4} across years 0..6; seg1 ≠ yearNum in 75% of
//        English rows). `curriculumUtils.getLessonById` used to resolve a stored id
//        by matching `taxonomy_id` alone and returned MULTIPLE year rows because the
//        id is not year-unique — see INGEST_NOTES "App-side note to surface".
//   S  — Skill learning-outcome ref        (segment 2, e.g. "S1")
//   K  — Knowledge learning-outcome ref    (segment 3, e.g. "K1")
//   H  — Hour ordinal within the S.K composition (segment 4, e.g. "H3")
//
// The source spreadsheets also carry PLACEHOLDER identifiers whose first segment is
// a letter — exam/evaluation slots ("E.*") and empty rows ("L.*"). These are not
// real taxonomy leaves and must be excluded from the Logic tree. A separate flat
// artefact — `*.S0.K0.*` — carries no real skill/knowledge and must be discounted
// from the spiral recurrence signal (else it reads as false spiralling).

/** The parsed segments of a `FA.S.K.H` taxonomy id. */
export interface ParsedTaxonomyId {
  /** Segment 1 as a number — the Focus Area. `null` for placeholder / malformed ids. */
  focusArea: number | null;
  /** Segment 2 normalised to `S{n}` (e.g. "S1"), or `null` when absent/malformed. */
  skillLo: string | null;
  /** Segment 3 normalised to `K{n}` (e.g. "K1"), or `null` when absent/malformed. */
  knowledgeLo: string | null;
  /** Segment 4 as a number — the hour ordinal. `null` when absent/malformed. */
  hour: number | null;
  /** The original id, trimmed. Empty string when the input was null/blank. */
  raw: string;
  /** True only for the strict numeric `FA.S{n}.K{n}.H{n}` shape. */
  wellFormed: boolean;
  /** True when segment 1 is non-numeric (an "E.*" / "L.*" exam or empty slot). */
  isPlaceholder: boolean;
}

/** Strict, canonical shape: numeric Focus Area then S / K / H refs. */
const STRICT = /^(\d+)\.S(\d+)\.K(\d+)\.H(\d+)$/i;

const EMPTY: ParsedTaxonomyId = {
  focusArea: null,
  skillLo: null,
  knowledgeLo: null,
  hour: null,
  raw: '',
  wellFormed: false,
  isPlaceholder: false,
};

/**
 * Parse a `curriculum_lesson.taxonomy_id` into its four segments.
 *
 * Tolerant by design: a well-formed id returns `wellFormed: true` with every
 * segment populated; a placeholder ("E.S0.K0.H1") returns `isPlaceholder: true` with
 * `focusArea: null` but still recovers the S/K/H it carries; anything else recovers
 * whatever segments it can and leaves the rest `null`. Never throws.
 */
export function parseTaxonomyId(id: string | null | undefined): ParsedTaxonomyId {
  const raw = (id ?? '').trim();
  if (!raw) return { ...EMPTY };

  const m = STRICT.exec(raw);
  if (m) {
    return {
      focusArea: Number(m[1]),
      skillLo: `S${Number(m[2])}`,
      knowledgeLo: `K${Number(m[3])}`,
      hour: Number(m[4]),
      raw,
      wellFormed: true,
      isPlaceholder: false,
    };
  }

  // Non-strict: recover segments positionally-tolerantly and flag placeholders.
  const parts = raw.split('.');
  const seg1 = parts[0] ?? '';
  const skill = parts.find((p) => /^S\d+$/i.test(p));
  const knowledge = parts.find((p) => /^K\d+$/i.test(p));
  const hour = parts.find((p) => /^H\d+$/i.test(p));
  return {
    focusArea: /^\d+$/.test(seg1) ? Number(seg1) : null,
    skillLo: skill ? `S${Number(skill.slice(1))}` : null,
    knowledgeLo: knowledge ? `K${Number(knowledge.slice(1))}` : null,
    hour: hour ? Number(hour.slice(1)) : null,
    raw,
    wellFormed: false,
    // A letter-led first segment ("E"/"L") marks an exam/empty placeholder row.
    isPlaceholder: /^[A-Za-z]/.test(seg1),
  };
}

/**
 * A leaf belongs in the Logic tree only when it carries a real Focus Area (numeric
 * segment 1). Placeholder rows ("E.*"/"L.*") and ids with no numeric Focus Area are
 * excluded — they are exam/empty slots, not curriculum outcomes.
 */
export function isTaxonomyLeaf(parsed: ParsedTaxonomyId): boolean {
  return !parsed.isPlaceholder && parsed.focusArea !== null;
}

/**
 * `*.S0.K0.*` is a flat artefact of the broken source numbering — it recurs across
 * years without expressing a real recurring skill/knowledge topic. Discount it from
 * the spiral so flat artefacts don't read as genuine spiralling.
 */
export function isFlatArtefact(parsed: ParsedTaxonomyId): boolean {
  return parsed.skillLo === 'S0' && parsed.knowledgeLo === 'K0';
}

/** The stable `S{n}.K{n}` composite key for a taxonomy leaf's monthly-outcome group. */
export function skillKnowledgeKey(parsed: ParsedTaxonomyId): string {
  return `${parsed.skillLo ?? 'S?'}.${parsed.knowledgeLo ?? 'K?'}`;
}
