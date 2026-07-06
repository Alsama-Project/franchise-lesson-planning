-- 0047_curriculum_active_subjects.sql
-- Distinct active curriculum subject codes, as a view, for the /curriculum picker's
-- subject list.
--
-- WHY: the picker list used to come from "load ALL active curriculum_lesson rows, then
-- dedupe subject_code in memory". PostgREST caps a plain table select at 1000 rows, so
-- with 6071 active rows that read truncated to the first 1000 — only English /
-- Professionalism / a few Maths rows — and Arabic/IT/Science/Yoga vanished from the
-- dropdown (and, via the same shared read, from the weekly board and editor). This view
-- returns at most one row per subject (~7), so it is uncapped BY CONSTRUCTION — the
-- 1000-row limit can never apply. curriculumUtils.getCurriculumSubjectCodes reads it.
--
-- `security_invoker = true` → the view runs with the querying role's privileges, so the
-- existing curriculum_lesson RLS (curr_read: authenticated may select) still governs.
-- In practice it is read via the service-role client (which bypasses RLS), but the grant
-- + invoker semantics keep it correct for any authenticated caller too.
--
-- PROVENANCE: applied by hand in the Supabase SQL editor (like 0010/0015/0024/0044);
-- committed idempotently so the schema stays the locked source of truth in repo and a
-- local `supabase db reset` reproduces it. Re-running is safe.

create or replace view public.curriculum_active_subjects
  with (security_invoker = true) as
  select distinct subject_code
  from public.curriculum_lesson
  where is_active;

grant select on public.curriculum_active_subjects to authenticated, service_role;
