-- 0013_profiles_comember_read.sql
--
-- Owner attribution on the Weekly Overview ("whose plan" avatars) and the people
-- filter need a member to read the *display name* of teammates they share a space
-- with. The base profiles policy (0006 `profiles_select_own`) is self-only, so
-- this ADDS a separate, scoped co-member SELECT policy alongside it — it does not
-- widen or replace the self-read.
--
-- Scope: a reader may select a profile row only when they share at least one
-- (school_id, subject_id) `subject_membership` with that profile. The app reads
-- ONLY `id` and `full_name` for co-members (see src/lib/weekly-overview.ts and
-- src/lib/actions/create-lesson.ts); RLS gates row visibility, the query layer
-- keeps the columns minimal. No service-role key is used on this path.
--
-- Fully idempotent (CREATE OR REPLACE / DROP POLICY IF EXISTS): safe to re-run.
-- NOTE ON PROVENANCE: applied manually by an operator in the Supabase SQL editor;
-- committed here so the schema stays the locked source of truth in-repo.

-- ── security-definer helper ──────────────────────────────────────────────────
-- True when the caller shares a (school, subject) space with `p_profile`. Reads
-- `subject_membership` regardless of the caller's own row visibility (RLS-bypass),
-- so it can be referenced from the profiles policy below without recursing through
-- profiles' RLS. STABLE: same result within a statement.
create or replace function public.shares_subject_space(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subject_membership me
    join public.subject_membership them
      on them.school_id = me.school_id
     and them.subject_id = me.subject_id
    where me.profile_id = auth.uid()
      and them.profile_id = p_profile
  );
$$;

-- ── co-member read policy (additive) ─────────────────────────────────────────
-- Multiple PERMISSIVE select policies OR together, so this grants visibility to
-- co-members' rows on top of the existing self-read — it never restricts it.
drop policy if exists profiles_select_comember on public.profiles;
create policy profiles_select_comember
  on public.profiles for select to authenticated
  using (public.shares_subject_space(id));
