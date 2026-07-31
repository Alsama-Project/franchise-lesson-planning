-- 0063_curriculum_subject_shape.sql
-- Per-subject curriculum SHAPE signal for the collapsed single-period browse view.
--
-- WHY. isSinglePeriodSubject() (src/lib/curriculumUtils.ts) decides "at most one DISTINCT
-- period across a subject's active rows". It used to pull EVERY active row with
-- `.select('period')` and dedupe in JS. The Supabase/PostgREST client caps a plain select
-- at 1000 rows by default, and several subjects exceed that (english/maths/arabic each
-- carry >1000 active rows) — so on a large subject the verdict was decided from a
-- truncated 1000-row sample. It never actually flipped a verdict (a multi-period subject
-- surfaces >= 2 distinct periods well inside the first 1000 rows), but it is the exact
-- PostgREST truncation trap this codebase has been bitten by before (see 0047). This view
-- aggregates in Postgres instead: one row per subject, so the 1000-row cap can never apply.
--
-- SEMANTICS — must match the old in-memory Set<number> EXACTLY, empty set included:
--   distinct_period_count = COUNT(DISTINCT period) over the subject's ACTIVE rows.
--   COUNT(DISTINCT ...) ignores NULLs, so an all-NULL-period subject (Awareness) yields 0.
--   The caller's `<= 1` test (NOT `= 1`) admits it (0 <= 1), preserving "collapse Awareness".
--   Verified against the live DB: awareness -> 0, yoga -> 1 (both collapse); it -> 3,
--   science/english/arabic/maths/professionalism -> 5 (none collapse). Identical to the
--   Set<number> the JS built (Awareness -> {}, Yoga -> {1}, IT -> {1,2,3}, ...).
--
-- security_invoker = true -> the view runs with the querying role's privileges, so the
-- underlying curriculum_lesson RLS still governs; in practice it is read via the
-- service-role client (curriculum is global reference data), mirroring
-- curriculum_active_subjects (0047). Reads the curriculum_lesson_active view (0056), which
-- already scopes to the active version AND is_active rows, so no extra predicate is needed.
--
-- PROVENANCE / HOW TO APPLY: like 0010/0015/0024/0044/0047/0056 this is applied BY HAND in
-- the Supabase SQL editor; committed idempotently so the schema stays the locked source of
-- truth in-repo and a local `supabase db reset` reproduces it. The agent never executes SQL.
-- Re-running is safe (create or replace). Apply this BEFORE deploying the code that reads
-- the view.

create or replace view public.curriculum_subject_shape
  with (security_invoker = true) as
  select subject_code,
         count(distinct period)::int as distinct_period_count
  from public.curriculum_lesson_active
  group by subject_code;

grant select on public.curriculum_subject_shape to authenticated, service_role;

comment on view public.curriculum_subject_shape is
  'Per-subject curriculum shape: COUNT(DISTINCT period) over active rows. Drives isSinglePeriodSubject (<= 1 => collapsed single-period view). Aggregated in Postgres so the PostgREST 1000-row cap can never truncate the sample.';
