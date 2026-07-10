-- 0060_set_primary_space_ambiguous_column_fix.sql
--
-- Fixes 0042. The `set_primary_space(target_school, target_subject)` RPC — the sole
-- write path for the header space-switcher — raised at runtime for EVERY real switch:
--   ERROR: column reference "school_id" is ambiguous (SQLSTATE 42702)
-- The function `returns table (school_id uuid, subject_id uuid, ...)`, so `school_id`
-- and `subject_id` are in scope as PL/pgSQL OUT variables. The two `update`
-- statements referenced those same names UNQUALIFIED in their WHERE clauses
-- (`... and not (school_id = target_school and subject_id = target_subject)` and
-- `... and school_id = target_school and subject_id = target_subject`), so Postgres
-- could not tell the OUT variable from the table column and refused to plan the
-- statement. (The ownership-gate `exists (...)` and the final `return query` were
-- already alias-qualified with `sm.`, so only the updates tripped.)
--
-- WHY IT LOOKED ASYMMETRIC. The failure is total — the RPC never succeeded for
-- anyone — but it only SURFACES when you switch to a space that is not already the
-- active one. `getActiveSpace()` resolves an unset user to their English membership
-- (English-first default), and the switcher client early-returns without calling the
-- action when you pick the already-active row (`if (space.membershipId === activeId)
-- return`). So clicking English (the default) is a silent no-op that "works", while
-- clicking any OTHER space (e.g. a newly-added Arabic membership) actually invokes
-- the RPC and hits the 42702. Curriculum/year config has nothing to do with it — an
-- empty space is meant to be switchable and now is.
--
-- FIX: alias the update target (`update public.subject_membership as sm ... where
-- sm.school_id = ...`) so every column reference is unambiguous. Behaviour, return
-- shape, ownership gate, and the clear-before-set ordering that protects the
-- `uq_membership_primary` partial-unique index are all unchanged.
--
-- PROVENANCE / HOW TO APPLY: applied by hand in the Supabase SQL editor like
-- 0010/0015/0024/0042/0044/0047/0056/0059; committed idempotently (CREATE OR REPLACE)
-- so the schema stays the locked source of truth and `supabase db reset` reproduces
-- it. The agent never executes SQL. Re-running is safe.

create or replace function public.set_primary_space(target_school uuid, target_subject uuid)
returns table (
  school_id    uuid,
  subject_id   uuid,
  subject_code text,
  subject_name text,
  school_name  text,
  role         public.membership_role
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  -- Ownership gate: the caller must already hold this exact membership. Raise
  -- (privilege-not-granted) rather than silently no-op, so the action can surface
  -- the failure and revert its optimistic UI.
  if not exists (
    select 1 from public.subject_membership sm
    where sm.profile_id = auth.uid()
      and sm.school_id  = target_school
      and sm.subject_id = target_subject
  ) then
    raise exception 'Not a member of this space' using errcode = '42501';
  end if;

  -- Clear the caller's existing primary BEFORE setting the target, so the partial
  -- unique index (one primary per profile) is never momentarily violated. Alias the
  -- target table (`sm`) so `school_id` / `subject_id` resolve to the column and never
  -- the like-named OUT parameters in this function's RETURNS TABLE (fixes 42702).
  update public.subject_membership as sm
     set is_primary = false
   where sm.profile_id = auth.uid()
     and sm.is_primary
     and not (sm.school_id = target_school and sm.subject_id = target_subject);

  update public.subject_membership as sm
     set is_primary = true
   where sm.profile_id = auth.uid()
     and sm.school_id  = target_school
     and sm.subject_id = target_subject;

  return query
    select sm.school_id, sm.subject_id, subj.code, subj.name, s.name, sm.role
    from public.subject_membership sm
    join public.subjects subj on subj.id = sm.subject_id
    join public.schools  s    on s.id    = sm.school_id
    where sm.profile_id = auth.uid()
      and sm.school_id  = target_school
      and sm.subject_id = target_subject;
end;
$$;

revoke execute on function public.set_primary_space(uuid, uuid) from public;
grant  execute on function public.set_primary_space(uuid, uuid) to authenticated;
