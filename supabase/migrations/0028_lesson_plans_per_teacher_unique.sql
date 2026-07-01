-- 0028_lesson_plans_per_teacher_unique.sql
--
-- PROPOSAL — AUTHORED ONLY, NOT APPLIED. Do not run until the Phase 0 audit
-- (docs/plan-data-audit.md) is approved AND the live schema has been confirmed.
--
-- WHY
-- A lesson plan must be a PER-TEACHER artefact, keyed by its owner, not a shared
-- row keyed by curriculum coordinate. Today `createScopedPlan` "opens, doesn't
-- duplicate" by (scope, curriculum_lesson_id, class_id/school_id) with no
-- `created_by` filter, so the first teacher to open a slot owns the only row and
-- every other teacher is routed into it (BUG A: content bleed). The same missing
-- owner dimension makes the edit gate (`created_by == auth.uid()`) reject any
-- other viewer (BUG B: view-only "not your plan").
--
-- The paired app change scopes the lookup to `created_by = auth.uid()`. This
-- migration makes the DB agree: uniqueness is per (owner, scope, slot, place), so
-- a second teacher's INSERT for the same centre/class slot succeeds instead of
-- colliding with a colleague's row.
--
-- PRE-FLIGHT (the live schema is NOT fully represented in-repo — see audit §1):
--   * Confirm columns `scope`, `school_id`, `subject_id` exist on lesson_plans
--     (added by hand in the Supabase SQL editor, like 0018/0019).
--   * Enumerate existing unique indexes on lesson_plans and drop any hand-applied
--     coordinate index that EXCLUDES created_by (add explicit `drop index if
--     exists <name>;` lines below once their real names are known) — otherwise it
--     will keep colliding two teachers' plans for the same slot.
--
-- Idempotent: safe to re-run. Partial unique indexes (one per scope) key every
-- scope on created_by; NULLs in class_id/school_id for the non-matching scopes are
-- excluded by the WHERE clause, so there is no NULL-distinctness footgun.

-- 1. Drop the now-dead coordinate constraint from 0003. Centre/org plans are
--    created with class_id = null AND lesson_date = null, so (class_id, lesson_date)
--    never enforced anything for them; it is replaced by the per-scope indexes below.
alter table public.lesson_plans
  drop constraint if exists lesson_plans_class_id_lesson_date_key;

-- 2. Per-teacher uniqueness, one partial index per scope, all keyed on created_by.

-- class scope: one plan per (owner, class, curriculum slot).
create unique index if not exists lesson_plans_owner_class_slot_key
  on public.lesson_plans (created_by, class_id, curriculum_lesson_id)
  where scope = 'class';

-- centre scope: one plan per (owner, centre, curriculum slot).
create unique index if not exists lesson_plans_owner_centre_slot_key
  on public.lesson_plans (created_by, school_id, curriculum_lesson_id)
  where scope = 'centre';

-- org scope: one plan per (owner, curriculum slot) — org spans all centres.
create unique index if not exists lesson_plans_owner_org_slot_key
  on public.lesson_plans (created_by, curriculum_lesson_id)
  where scope = 'org';
