# Curriculum ingest — engine notes

The parser (`parse.ts` + `columnMatcher.ts`) turns the eight subject Excel workbooks
into canonical `CurriculumRecord`s **by header meaning**, not column position, so it
survives columns being added, renamed, reordered, or translated (English ↔ Arabic).

## What landed in this pass (parser-only — no schema change yet)

- `columnMatcher.ts` — normalisation (incl. Arabic tatweel/diacritics), an editable
  **alias dictionary** (English + Arabic), an exclusion list for hidden helpers /
  `#`-counters, fuzzy scoring (exact 1.0 / containment 0.85 / Levenshtein+Jaccard
  ≥ 0.80), greedy one-field-per-header assignment, and `unmappedHeaders` so a new or
  renamed column is **surfaced, never dropped**.
- `parse.ts` — sheet selection (never `sheetnames[0]`; Professionalism → highest
  `V<n>`, ambiguity → `needsReview` + `candidateSheets`), header-row detection (the
  `Column header` marker; **row 5 in one Arabic file, not always 7**), forward-fill of
  merged hierarchical columns, **daily vs weekly grain** detection (Awareness has no
  period column → weekly), **hyperlink target capture** (`cell.l.Target`, not just the
  "Click for Resource" text), and non-instructional rows (`Baseline Evaluation`, …)
  kept with `periodNumber: null`.
- `parseCurriculumWorkbook` returns `{ records, report, lessonRows, skippedLessonRows }`.
  `records` + `report` are the canonical surface (dry-run / dev script). `lessonRows`
  is the subset adapted **down** to today's `curriculum_lesson` 5-tuple key, built with
  the legacy field set so the **English daily-grain import is unchanged** (proved by
  `__tests__/parse.test.ts`). Weekly-grain / non-instructional records cannot satisfy
  the 5-tuple → counted in `skippedLessonRows`, surfaced in the report, not written.
- Endpoint: `POST /api/curriculum/import?dryRun=1` (or `dryRun` form field) returns the
  `ImportReport` with **no DB write**. Auth + the n8n contract are untouched.

## What landed in pass 2 — all 8 subjects + the Grammar panel

- **Schema:** `0015_curriculum_import_fields.sql` (applied by hand by the operator,
  committed idempotently): `add grammar_vocabulary text`, `add monthly_lo text`,
  `period drop not null`, and the `lesson_key` unique index. The `period between 1
  and 6` CHECK and the 5-tuple unique are left as-is — both are NULL-safe.
- **Mappings:** `grammar_vocabulary` ← "Content covered within grammar" (English col
  Y); `monthly_lo` ← the single combined "Monthly Learning Outcome"; `theme` absorbs
  "Topic"/"المحتوى". The bare `content` topic alias was removed so English col X
  ("Content covered within linguistic skill") is **dropped → unmapped** (visible in
  the report), not mis-captured as theme.
- **Write path:** `sync.ts` holds the parse→upsert→reconcile core (no `server-only`,
  so the ops script can reuse it). Upsert is now **on `lesson_key`** (the 5-tuple
  can't key a row once `period` is nullable). `import.ts` is a thin server wrapper
  that supplies the service-role client and revalidates the cache.
- **All grains written:** daily-grain instructional rows (numeric period, key
  `…|P{n}` — UNCHANGED), weekly-grain rows (Awareness, `period` NULL, key `…|wk`),
  and non-instructional rows (Baseline/Orientation, `period` NULL, key
  `…|wk:{slug}`). Only rows missing year/month/week are skipped (`skippedLessonRows`).
- **App wiring:** the editor's Grammar & Vocabulary panel read `focus_area` (always
  empty for English → "—"). `curriculumUtils` now selects `grammar_vocabulary` and
  routes it into the panel via `grammarFocus`. Theme is unchanged (reads `theme`).

## Validate / operate

```bash
npm test                       # unit tests (synthetic xlsx fixtures, one per hazard)

# 1) DRY-RUN every subject — confirm the column map, unmapped headers, warnings:
npm run ingest:curriculum -- "<path-to.xlsx>" --subject <code> [--sheet "<name>"]

# 2) WRITE (real import). Runs the lesson_key SAFETY GATE first: it aborts if any
#    existing active lesson_key for the subject would be lost (orphaning live plans).
#    Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (env or .env.local).
npm run ingest:curriculum -- "<path-to.xlsx>" --subject <code> [--sheet "<name>"] --write
#    --force overrides a "lost keys" abort (use only if intentional).
```

Intended order: dry-run all 8 → confirm mappings → **English `--write` only after the
gate reports 0 lost keys** → then the other 7. New synonyms are a one-line change in
`ALIASES`. The same import also runs via `POST /api/curriculum/import` (n8n + UI);
`?dryRun=1` returns the report with no write.

## Migration that landed (`0015_curriculum_import_fields.sql`)

Deliberately minimal — only what the eight files + the panel fix actually need. The
operator applies it by hand; it is committed idempotently so `supabase db reset`
reproduces it.

| Statement | Why |
|---|---|
| `add column grammar_vocabulary text` | English col Y "Content covered within grammar"; fixes the editor panel |
| `add column monthly_lo text` | single combined "Monthly Learning Outcome" (distinct from `monthly_skills_lo`/`monthly_knowledge_lo`) |
| `alter column period drop not null` | weekly-grain (Awareness) + non-instructional rows have no period |
| `create unique index … (lesson_key)` | upsert key now that the 5-tuple can't key a NULL-period row |

Left as-is on purpose: the `period between 1 and 6` CHECK and the `(subject_code,
year, month, week, period)` unique are both NULL-safe (a NULL CHECK is not FALSE;
NULLs are distinct in a unique), so neither blocks weekly/non-instructional rows. The
canonical `CurriculumRecord` still carries richer fields (subject/annual LO, topic,
grain, resource_url) with no column yet — they remain dry-run-report-only and are
adapted down to `ParsedCurriculumRow` on write. If a real import hits a CHECK/NOT
NULL violation, the write path surfaces the exact constraint + row rather than
blanket-altering anything (see the brief).

## App-side note to surface (do NOT fix here)

The lesson-identifier code (e.g. `1.S1.K0.H1`) — its **first segment is the Focus
Area #, not the year**. In the baked `curriculum.json` the `id`'s first digit happens
to mirror `yearNum`, and `curriculumUtils.ts` (`getLessonById`, see its own comment at
~line 107) matches on `taxonomy_id`, which "can match multiple year[s]". The importer
correctly takes year from the dedicated **Year** column. The id-first-segment-as-year
assumption should be fixed separately so it doesn't leak back in.
