-- 0058_born_approved_insert_guard.sql
--
-- PROPOSAL — AUTHORED ONLY, NOT APPLIED. George reviews and applies this to the
-- live database (Supabase SQL editor), exactly like 0019/0028/0048/0057. Committed
-- idempotently so the schema stays the locked source of truth in-repo.
--
-- WHAT — a plan may be BORN `approved` only when its author coordinates its subject.
--
-- Policy: when a coordinator authors a plan in a subject they coordinate, there is
-- no review to do — they are the approval authority — so the plan is created
-- directly as `approved` (Save, not Submit). It must never pass through `submitted`,
-- so it never fires a review notification and never enters anyone's review queue.
--
-- `enforce_approval_role` (0019) gates the approved/needs_review transition, but it
-- is a BEFORE UPDATE trigger — it does not run on INSERT. So without this guard, an
-- INSERT could set `status = 'approved'` for a NON-coordinator (RLS INSERT only
-- checks created_by = self). This BEFORE INSERT trigger closes that gap: it is the
-- INSERT-time twin of enforce_approval_role.
--
-- Behaviour: if a row is inserted with status in ('approved','needs_review') and the
-- author does NOT coordinate the plan's subject (nor is admin), the status is forced
-- back to `in_progress` rather than raising — defence-in-depth that can never break a
-- legitimate insert. The app create path already sets `approved` only for a
-- coordinator-author, so in normal operation this trigger is a no-op; it exists so
-- the "born approved" privilege cannot be forged by a crafted INSERT.
--
-- The subject/centre are resolved the same class-optional way as the policies and
-- enforce_approval_role: the plan's class (when it has one), else its own columns.
--
-- Idempotent: create or replace / drop trigger if exists. Safe to re-run.

create or replace function public.enforce_insert_approval_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school uuid;
  v_subject uuid;
begin
  if new.status in ('approved', 'needs_review') then
    select c.school_id, c.subject_id
      into v_school, v_subject
      from public.classes c
     where c.id = new.class_id;

    -- Class-less plans (coordinator-authored, class_id = null): fall back to the
    -- plan's own provenance columns.
    v_school := coalesce(v_school, new.school_id);
    v_subject := coalesce(v_subject, new.subject_id);

    -- Only a coordinator of the plan's subject (or an admin) may create it already
    -- decided. Anyone else's attempt is quietly downgraded to a normal draft.
    if not (public.is_coordinator_of_subject(v_school, v_subject) or public.is_admin()) then
      new.status := 'in_progress';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_insert_approval_role on public.lesson_plans;
create trigger enforce_insert_approval_role
  before insert on public.lesson_plans
  for each row
  execute function public.enforce_insert_approval_role();
