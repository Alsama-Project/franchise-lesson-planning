-- 0025_plan_comments_member_select.sql
--
-- Teacher-facing read of coordinator review comments. Migration 0022 created
-- plan_comments with a DELIBERATELY coordinator-only SELECT policy — the teacher
-- reveal of returned feedback was a later slice. This is that slice.
--
-- The intent (per the submit/review lifecycle work): comment DISPLAY is gated on
-- existence, not status, on BOTH sides. The teacher must see the coordinator's
-- comments on a plan that was returned to them — which lands the plan back in
-- `in_progress` — so they know what to fix. A coordinator-only SELECT makes that
-- impossible; the editor's TeacherCommentsPanel reads [] and renders nothing.
--
-- DESIGN: comment visibility should equal PLAN visibility. Rather than a narrow
-- creator-only grant, we MIRROR the lesson_plans access predicate — the exact
-- USING clause of `lp_member_all` (migration 0019): a row is readable by its
-- creator, an admin, or a member of the plan's (centre, subject) space, resolved
-- the same class-optional way (plan scope columns, falling back to the class). So
-- whoever can open the plan can read its comments — no narrower, no wider.
--
-- Centralised in a security-definer helper so the policy stays a one-liner and
-- cannot recurse through plan_comments' own RLS (the same pattern 0022 used for
-- `is_coordinator_of_plan`). SECURITY DEFINER does not change auth.uid(): it still
-- resolves to the calling user, so the `created_by = auth.uid()` arm is correct.
--
-- This widens read access only (the coordinator-only INSERT policy and the absence
-- of UPDATE/DELETE are untouched — comments stay coordinator-authored and
-- immutable). The 0022 `plan_comments_coord_select` policy is left in place; it is
-- a strict subset of this one (coordinators are members), so the two compose
-- harmlessly as OR'd permissive SELECT policies.
--
-- NOTE ON PROVENANCE: like the other numbered migrations, this DDL is also applied
-- by hand in the Supabase SQL editor (George applies it to the live database). It
-- is committed here, idempotently, so the schema stays the locked source of truth
-- in-repo and a local `supabase db reset` reproduces it. Every statement is guarded.

-- ── space/member resolution helper (security definer, RLS-bypassing) ─────────
-- True when the caller may READ the plan: its creator, an admin, or a member of
-- the plan's (centre, subject) space. Mirrors lp_member_all's USING clause exactly,
-- resolving the space class-optionally (plan scope columns, else class). STABLE:
-- same result within a statement.
create or replace function public.is_member_of_plan(p_plan uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with space as (
    select
      lp.created_by,
      coalesce(c.school_id, lp.school_id) as school_id,
      coalesce(c.subject_id, lp.subject_id) as subject_id
    from public.lesson_plans lp
    left join public.classes c on c.id = lp.class_id
    where lp.id = p_plan
  )
  select coalesce(
    space.created_by = (select auth.uid())
      or public.is_admin()
      or public.is_member_of_subject(space.school_id, space.subject_id),
    false
  )
  from space;
$$;

-- ── RLS: member (= plan-visibility) read ─────────────────────────────────────
-- Whoever can see the plan can read its comments. Additive to the coordinator
-- SELECT from 0022; no INSERT/UPDATE/DELETE policy is added or changed.
drop policy if exists plan_comments_member_select on public.plan_comments;
create policy plan_comments_member_select
  on public.plan_comments for select to authenticated
  using (public.is_member_of_plan(plan_id));
