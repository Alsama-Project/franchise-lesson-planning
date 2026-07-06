-- 0048_curriculum_outcome_columns.sql
--
-- Adds the two OUTCOME-LEVEL columns the curriculum surfaces need at the top of the
-- Logic-tree spine (Subject → Yearly → S.K group → hours) and as an Insights axis:
--
--   subject_learning_outcome  — the subject-level outcome (one per subject).
--   annual_learning_outcome   — the yearly/annual outcome (one per subject × year).
--
-- WHY THEY DIDN'T EXIST. `curriculum_lesson` carried monthly/weekly/daily outcomes
-- (monthly_lo, monthly_skills_lo, monthly_knowledge_lo, weekly_*_lo, daily_outcome)
-- but no subject- or year-level outcome column. The importer's canonical
-- `CurriculumRecord` ALREADY captures both — `subjectLearningOutcome` (sheet-level
-- constant) and `annualLearningOutcome` (a forward-filled per-year column) — but they
-- were report-only and never persisted (see curriculum/INGEST_NOTES.md, "richer
-- fields with no column yet"). This lands the columns so the parser can write them
-- and the tree/insights can read them.
--
-- GRAIN (why per-row text columns hold them 1:1). Both are coarser than the row, so
-- they DENORMALISE onto every row of their scope — identical to how `monthly_lo`
-- already repeats across a month's rows:
--   * subject_learning_outcome  is constant across ALL rows of a subject_code.
--   * annual_learning_outcome   is constant across all rows of a (subject_code, year).
-- No new key or join is introduced; nullable so a row without the text renders
-- conditionally (same null-tolerant pattern as monthly_skills_lo / focus_area).
--
-- BACKFILL — deliberately NOT included here.
--   The outcome TEXT lives only in the per-subject curriculum workbooks, which are
--   core IP and gitignored (see test/fixtures/curriculum/README.md); it is NOT in the
--   committed src/data/curriculum.json (that baked export has no subject/annual LO
--   field) nor in the redacted gold-master CSVs (structural, text-free). So no
--   backfill can be authored from committed data without fabricating values.
--   It is regenerated exactly as 0024 was — by running the SAME importer
--   (src/lib/curriculum/parse.ts → parseCurriculumWorkbook) over the workbook and
--   emitting UPDATEs keyed by the stable lesson_key / (subject_code, year) — and
--   committed as a follow-up numbered migration (0049_backfill_*). For the other
--   seven subjects the values populate when their workbook is (re)imported through
--   the normal ingest path, which will set these columns going forward.
--
-- PROVENANCE / HOW TO APPLY: like 0010/0015/0024/0044/0047 this is applied by hand in
-- the Supabase SQL editor; committed idempotently so the schema stays the locked
-- source of truth in-repo and a local `supabase db reset` reproduces it. The agent
-- never executes SQL. Re-running is safe (IF NOT EXISTS).

alter table public.curriculum_lesson
  add column if not exists subject_learning_outcome text;

alter table public.curriculum_lesson
  add column if not exists annual_learning_outcome text;

comment on column public.curriculum_lesson.subject_learning_outcome is
  'Subject-level learning outcome (constant per subject_code). Nullable; populated by the importer.';
comment on column public.curriculum_lesson.annual_learning_outcome is
  'Yearly/annual learning outcome (constant per subject_code + year). Nullable; populated by the importer.';
