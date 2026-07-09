-- 0057_lesson_plans_subject_visibility.sql
--
-- PROPOSAL — AUTHORED ONLY, NOT APPLIED. George reviews and applies this to the
-- live database (Supabase SQL editor), exactly like 0018/0019/0028/0048. It is
-- committed here, idempotently, so the schema stays the locked source of truth
-- in-repo and a local `supabase db reset` reproduces it.
--
-- WHAT — decouple plan VISIBILITY from centre/class; key it on SUBJECT.
--
-- The model changes: a lesson plan is keyed to a curriculum slot (subject, year,
-- month/week/period). Centre and class are PROVENANCE (who made it, where, for
-- which class if any) — recorded on the row, but NO LONGER a scoping dimension.
-- Every teacher/coordinator of a subject sees EVERY plan for that subject, across
-- all centres and all years. Cross-SUBJECT isolation is retained in full.
--
-- Today one FOR ALL policy (`lp_member_all`, 0019) governs both read and write with
-- one predicate: "member of the plan's (centre, subject) space." That predicate
-- ties visibility to the plan's centre (via its class, or its own school_id), so a
-- teacher sees only their own centre's plans. This migration SPLITS that policy:
--
--   • lp_select (SELECT) — WIDENS to subject-wide. A participant of the plan's
--     SUBJECT (member OR coordinator, at ANY school) sees it. The school_id is gone
--     from the predicate; subject_id STAYS — that is what holds cross-subject
--     isolation together once centre drops out.
--
--   • lp_write (INSERT/UPDATE) — TIGHTENS to author + coordinator + admin. Today's
--     FOR ALL incidentally lets any space member UPDATE a colleague's plan; the app
--     already hides that behind `canEdit = created_by`, so tightening RLS to match
--     costs no user anything they can do in the UI — it makes "edit only your own"
--     true at the database, not just the component. The coordinator branch is
--     retained so the review path (decidePlan / status transitions / worksheet
--     edits on a submitted plan the coordinator did not author) still works; the
--     `enforce_approval_role` trigger (0019) still gates the approved/needs_review
--     transition itself.
--
-- DELETE is unaffected: the restrictive `lp_no_direct_delete` (0048) already denies
-- all direct client deletes, and purge_lesson_plan is SECURITY DEFINER. Dropping the
-- FOR ALL policy removes the incidental permissive DELETE grant, which the
-- restrictive policy denied anyway — so no permissive delete policy is recreated.
--
-- Idempotent: `create or replace` / `drop policy if exists` / `create policy`
-- throughout. Safe to re-run.

-- ── 1. school-agnostic subject-participation helper ──────────────────────────
-- One row in EITHER subject_membership (teacher, per school) OR coordinator_subject
-- (coordinator, school-agnostic) for this subject makes the caller a participant of
-- it. School is deliberately not an argument — participation is subject-wide. Mirrors
-- the deactivation guard the other access helpers carry (0032/0033). SECURITY
-- DEFINER so it reads regardless of the caller's own row visibility and can be
-- referenced inside the RLS policy below without recursing.
create or replace function public.is_participant_of_subject(p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (not public.is_deactivated()) and (
    exists (
      select 1 from public.subject_membership
      where profile_id = auth.uid()
        and subject_id = p_subject
    )
    or exists (
      select 1 from public.coordinator_subject
      where profile_id = auth.uid()
        and subject_id = p_subject
    )
  );
$$;

revoke execute on function public.is_participant_of_subject(uuid) from public;
grant  execute on function public.is_participant_of_subject(uuid) to authenticated;

-- ── 2. replace the FOR ALL policy with a SELECT + a WRITE policy ──────────────
-- The plan's subject is its class's subject when it has one (authoritative for
-- class-scoped rows), else the plan's own subject_id column. Both are populated as
-- provenance on every plan the app creates, so a class_id=null plan resolves its
-- subject from subject_id and is fully visible to the whole subject.
drop policy if exists lp_member_all on public.lesson_plans;

-- Read: any participant of the plan's SUBJECT (all centres, all years). No school in
-- the predicate; subject_id is retained, so a Maths participant never sees English.
drop policy if exists lp_select on public.lesson_plans;
create policy lp_select
  on public.lesson_plans for select to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
    or public.is_participant_of_subject(
         coalesce(
           (select c.subject_id from public.classes c where c.id = lesson_plans.class_id),
           lesson_plans.subject_id
         )
       )
  );

-- Insert: a user may only create their OWN plan (created_by = self); an admin may
-- create any. Same predicate shape as the write gate below; the coordinator branch
-- is harmless here since coordinator inserts are always created_by = self.
drop policy if exists lp_insert on public.lesson_plans;
create policy lp_insert
  on public.lesson_plans for insert to authenticated
  with check (
    created_by = auth.uid()
    or public.is_admin()
    or public.is_coordinator_of_subject(
         coalesce(
           (select c.school_id from public.classes c where c.id = lesson_plans.class_id),
           lesson_plans.school_id
         ),
         coalesce(
           (select c.subject_id from public.classes c where c.id = lesson_plans.class_id),
           lesson_plans.subject_id
         )
       )
  );

-- Update: the author (edit your own), a coordinator of the plan's subject (the
-- review path — approve/return/worksheet on a plan they did not author), or an
-- admin. This is the tightening: a plain co-member of the space may no longer write
-- a colleague's plan. `enforce_approval_role` still gates the status transition.
drop policy if exists lp_update on public.lesson_plans;
create policy lp_update
  on public.lesson_plans for update to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
    or public.is_coordinator_of_subject(
         coalesce(
           (select c.school_id from public.classes c where c.id = lesson_plans.class_id),
           lesson_plans.school_id
         ),
         coalesce(
           (select c.subject_id from public.classes c where c.id = lesson_plans.class_id),
           lesson_plans.subject_id
         )
       )
  )
  with check (
    created_by = auth.uid()
    or public.is_admin()
    or public.is_coordinator_of_subject(
         coalesce(
           (select c.school_id from public.classes c where c.id = lesson_plans.class_id),
           lesson_plans.school_id
         ),
         coalesce(
           (select c.subject_id from public.classes c where c.id = lesson_plans.class_id),
           lesson_plans.subject_id
         )
       )
  );
