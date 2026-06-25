-- 0019_lesson_plans_visibility_no_class.sql
--
-- Lesson visibility (and coordinator approval) must follow the plan's
-- (centre, subject) SPACE, never require a class. The 0012 policy + approval
-- trigger both resolved that space exclusively through the plan's class:
--
--   exists (select 1 from classes c where c.id = lesson_plans.class_id ...)
--
-- For a centre-/org-scoped plan `class_id` is null, so `c.id = null` matches no
-- row and the membership branch is always false. Such a plan was therefore
-- visible only to its creator or an admin — every other member of its space got
-- an empty SELECT, which surfaced as a 404 on /plan/[id]. This mirrors the
-- app-side weekly-overview fix (visibility gated on subject membership, not class
-- assignment) down into the RLS layer that actually enforces it.
--
-- The fix derives (school_id, subject_id) from the plan's class WHEN it has one
-- (the authoritative source for class-scoped plans, unchanged behaviour), else
-- falls back to the plan's own scope columns. `is_member_of_subject(null, ...)`
-- returns false, so a plan with neither a class nor school/subject stays hidden —
-- no accidental widening.
--
-- NOTE ON PROVENANCE: like 0018, this DDL is also applied manually by an operator
-- in the Supabase SQL editor (George applies it to the live database). It is
-- committed here, idempotently, so the schema stays the locked source of truth
-- in-repo and a local `supabase db reset` reproduces it.

-- ── visibility / edit access: gate on the plan's (school, subject) space ─────
drop policy if exists lp_member_all on public.lesson_plans;
create policy lp_member_all
  on public.lesson_plans for all to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
    or public.is_member_of_subject(
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
    or public.is_member_of_subject(
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

-- ── approval role check: same (school, subject) space, class-optional ────────
-- The 0012 trigger resolved the coordinator's space from new.class_id only, so
-- approving/sending-back a centre-scoped plan raised "Only a coordinator of this
-- subject can change approval status". Resolve the space the same class-optional
-- way as the policy above.
create or replace function public.enforce_approval_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school uuid;
  v_subject uuid;
begin
  if new.status is distinct from old.status
     and new.status in ('approved', 'needs_review') then
    select c.school_id, c.subject_id
      into v_school, v_subject
      from public.classes c
     where c.id = new.class_id;

    -- Centre-/org-scoped plans (no class): fall back to the plan's own columns.
    v_school := coalesce(v_school, new.school_id);
    v_subject := coalesce(v_subject, new.subject_id);

    if not (public.is_coordinator_of_subject(v_school, v_subject) or public.is_admin()) then
      raise exception 'Only a coordinator of this subject can change approval status';
    end if;
  end if;
  return new;
end;
$$;

-- Trigger definition is unchanged from 0012; recreate idempotently so a fresh
-- `supabase db reset` binds the updated function.
drop trigger if exists enforce_approval_role on public.lesson_plans;
create trigger enforce_approval_role
  before update on public.lesson_plans
  for each row
  execute function public.enforce_approval_role();
