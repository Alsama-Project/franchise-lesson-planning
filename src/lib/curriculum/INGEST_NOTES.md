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

## Validate before any migration

```bash
npm test                       # unit tests (synthetic xlsx fixtures, one per hazard)
npm run ingest:curriculum -- "<path-to.xlsx>" --subject <code> [--sheet "<name>"]
```

The dev script dry-runs the parser and prints the column map, unmapped headers,
missing fields, warnings, and sample records. **Run it against all 8 real subject
files and confirm the mappings** — new synonyms are a one-line change in `ALIASES`.

## Proposed migration — running list (DRAFT, finalize after dry-run on all 8 files)

The canonical model needs columns the locked `curriculum_lesson` lacks, **and** three
constraints must relax for weekly-grain (Awareness) + non-instructional rows. This is
the additive/relaxing diff to write as `00XX_curriculum_import_fields.sql` once the
real-file mappings are confirmed. **Not additive-only** — `period`/`week`/`month`/`year`
must become nullable and the `year`/`period` CHECKs dropped.

`curriculum_lesson`:

| Change | Why |
|---|---|
| `add column source_key text` + **unique index**; backfill existing rows first | new upsert + soft-archive diff key (`lesson_key`/5-tuple stays for now) |
| `add column grain text` (`'daily'`/`'weekly'`) | weekly-grain subjects |
| `add column period_label text` | raw `"Period 1"` / `"Baseline Evaluation"` |
| `alter column period drop not null` + **drop CHECK (1..6)** | non-instructional / weekly rows |
| `alter column week drop not null` | weekly merges / non-instructional |
| `alter column month drop not null` | defensive (non-instructional) |
| `add column year_label text`; `alter column year drop not null` + **drop CHECK (0..6)** | raw label + `Preparatory Year` already → 0, but keep null-safe |
| `add column subject_learning_outcome text` | sheet-level Subject LO |
| `add column annual_lo text` | annual learning outcome |
| `add column monthly_lo text` | **single** monthly LO (distinct from existing `monthly_skills_lo`/`monthly_knowledge_lo`) |
| `add column topic text` | distinct from existing `theme`/`focus_area` |
| `add column resource_url text` | scalar hyperlink (existing `resources` jsonb keeps `[{label,url}]`) |

`lesson_identifier` → existing `taxonomy_id` already covers it (kept verbatim).

`curriculum_sync_run`:

| Change | Why |
|---|---|
| `add column file_name text` | provenance |
| `add column needs_review boolean default false` | report flag for coordinator/George |
| `add column inserted int`, `updated int`, `archived int` | richer run counts (alongside existing `rows_upserted`/`rows_deactivated`) |

Once these land, `import.ts` upserts on `source_key`, writes the full canonical record,
soft-archives by `source_key` diff, and records the richer run counts.

## App-side note to surface (do NOT fix here)

The lesson-identifier code (e.g. `1.S1.K0.H1`) — its **first segment is the Focus
Area #, not the year**. In the baked `curriculum.json` the `id`'s first digit happens
to mirror `yearNum`, and `curriculumUtils.ts` (`getLessonById`, see its own comment at
~line 107) matches on `taxonomy_id`, which "can match multiple year[s]". The importer
correctly takes year from the dedicated **Year** column. The id-first-segment-as-year
assumption should be fixed separately so it doesn't leak back in.
