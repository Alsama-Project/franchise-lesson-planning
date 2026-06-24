-- 0015_curriculum_import_fields.sql
-- Curriculum ingest: import all eight subjects (not just English) and surface the
-- editor's Grammar & Vocabulary panel.
--
-- NOTE ON PROVENANCE: like 0010, this DDL is also applied by hand in the Supabase
-- SQL editor by the operator (see the curriculum-ingest brief, "① SQL"). It is
-- committed here, idempotently, so the schema stays the locked source of truth in
-- repo and a local `supabase db reset` reproduces it. Re-running is safe.
--
-- Why these four:
--   • grammar_vocabulary — English col Y "Content covered within grammar". The editor
--     panel read focus_area (always empty for English) → showed "—". Now it reads here.
--   • monthly_lo — the single combined "Monthly Learning Outcome" column (distinct
--     from the split monthly_skills_lo / monthly_knowledge_lo).
--   • period drop not null — weekly-grain subjects (Awareness) and non-instructional
--     rows (Baseline/Orientation/Evaluation) have no period. The existing
--     check (period between 1 and 6) still passes for NULL (a NULL check is not FALSE),
--     and the (subject_code, year, month, week, period) unique treats NULLs as
--     distinct, so neither constraint needs to change.
--   • lesson_key unique index — the import now upserts on lesson_key (the 5-tuple can
--     no longer key a row once period is nullable). 0010 already declares a
--     unique (lesson_key) table constraint; this `if not exists` index is a harmless
--     no-op there and reproduces the hand-applied statement exactly.

alter table public.curriculum_lesson add column if not exists grammar_vocabulary text;
alter table public.curriculum_lesson add column if not exists monthly_lo text;
alter table public.curriculum_lesson alter column period drop not null;
create unique index if not exists curriculum_lesson_lesson_key_uidx
  on public.curriculum_lesson (lesson_key);
