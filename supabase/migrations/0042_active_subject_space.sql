-- 0042_active_subject_space.sql
--
-- One canonical "active subject space" per user. Until now three surfaces each
-- resolved the signed-in user's subject independently (the header chip by earliest
-- membership, the curriculum browser English-first, the planning board by taught-
-- class count), so a user in more than one `subject_membership` saw them disagree
-- within a single session. This adds a persisted, user-settable primary membership
-- that one resolver (`getActiveSpace()` in src/lib/active-space.ts) reads for every
-- surface.
--
-- Shape:
--   * `subject_membership.is_primary boolean not null default false` — the user's
--     chosen active space. Backfilled by nobody: existing users fall back to the
--     resolver's deterministic default (English membership, else earliest) until
--     they pick one, so no data migration is needed.
--   * A partial unique index enforces AT MOST ONE primary per user. It does not
--     collide with the existing plain `(profile_id)` index or the composite
--     `unique (profile_id, school_id, subject_id)` from 0012.
--   * `set_primary_space(target_school, target_subject)` — a SECURITY DEFINER RPC.
--     `subject_membership` has no self-UPDATE RLS policy (0012 grants a teacher only
--     self-INSERT and self-DELETE), so a client-side `.update()` of `is_primary`
--     would be blocked; the definer RPC is the write path. It asserts the caller
--     owns the target membership, then clears the old primary BEFORE setting the new
--     one so the partial-unique index is never transiently violated, and returns the
--     resolved active-space row.
--
-- CC never applies migrations — George runs this in the Supabase SQL editor.
-- Idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / CREATE OR
-- REPLACE): safe to re-run.

-- ── column ────────────────────────────────────────────────────────────────────
alter table public.subject_membership
  add column if not exists is_primary boolean not null default false;

-- ── at most one primary per user ──────────────────────────────────────────────
create unique index if not exists uq_membership_primary
  on public.subject_membership (profile_id)
  where is_primary;

-- ── write path: set the caller's active space ─────────────────────────────────
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
  -- unique index (one primary per profile) is never momentarily violated.
  update public.subject_membership
     set is_primary = false
   where profile_id = auth.uid()
     and is_primary
     and not (school_id = target_school and subject_id = target_subject);

  update public.subject_membership
     set is_primary = true
   where profile_id = auth.uid()
     and school_id  = target_school
     and subject_id = target_subject;

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
