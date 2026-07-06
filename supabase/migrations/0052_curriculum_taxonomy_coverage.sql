-- 0052_curriculum_taxonomy_coverage.sql
--
-- Backs the Logic-tree COVERAGE GATE. Returns, per subject, the total active row count
-- and the count of rows whose taxonomy_id is well-formed — matching the strict
--   ^[0-9]+\.S[0-9]+\.K[0-9]+\.H[0-9]+$
-- (Focus Area . Skill-LO . Knowledge-LO . Hour). The app gates the Logic tree on
-- well_formed / total ≥ a threshold, and discloses `total − well_formed` as the count
-- of rows not mapped to the taxonomy (shown, not silently dropped).
--
-- Exact regex on purpose: the app's threshold and the disclosure banner must agree to
-- the row, so this uses the SAME anchored pattern the app documents rather than the
-- looser segment checks in the `curriculum_taxonomy` view (which allows an optional 'H'
-- and is unanchored). One sequential count per subject — a two-number result.
--
-- Security: SECURITY INVOKER (default, explicit) so `curr_read` RLS still governs; read
-- via the service-role client in practice. Grants mirror the other curriculum RPCs.
--
-- PROVENANCE / HOW TO APPLY: applied by hand in the Supabase SQL editor like
-- 0010/0015/0024/0044/0047/0049/0050/0051; committed idempotently (CREATE OR REPLACE)
-- so the schema stays the locked source of truth and `supabase db reset` reproduces it.
-- The agent never executes SQL. Re-running is safe.

create or replace function public.curriculum_taxonomy_coverage(p_subject text)
returns table (total bigint, well_formed bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::bigint                                                                  as total,
    count(*) filter (
      where cl.taxonomy_id ~ '^[0-9]+\.S[0-9]+\.K[0-9]+\.H[0-9]+$'
    )::bigint                                                                         as well_formed
  from public.curriculum_lesson cl
  where cl.is_active
    and cl.subject_code = p_subject;
$$;

revoke execute on function public.curriculum_taxonomy_coverage(text) from public;
grant  execute on function public.curriculum_taxonomy_coverage(text) to authenticated, service_role;
