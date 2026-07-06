-- 0053_curriculum_taxonomy_coverage_real.sql
--
-- Corrects the Logic-tree COVERAGE GATE so it reflects REAL taxonomy coverage.
--
-- 0052 counted any row matching the shape ^[0-9]+\.S[0-9]+\.K[0-9]+\.H[0-9]+$ as
-- "well-formed". But `*.S0.K0.*` is the SENTINEL for "no real skill/knowledge assigned"
-- — a placeholder, not an outcome. Counting it inflated coverage and let a subject whose
-- taxonomy is almost entirely sentinels build a giant, meaningless single-node tree
-- (English showed one 77-hour node). Redefine well-formed to EXCLUDE the sentinel:
--
--   matches ^[0-9]+\.S[0-9]+\.K[0-9]+\.H[0-9]+$
--   AND split_part(taxonomy_id, '.', 2) <> 'S0'
--   AND split_part(taxonomy_id, '.', 3) <> 'K0'
--
-- Coverage = real_well_formed / total is then gated against the SAME app-side
-- TAXONOMY_COVERAGE_MIN = 0.5. On live data every subject now falls below 0.5 (english
-- ~2%, professionalism ~5%, the rest 0), so the Logic tree shows disabled-with-reason
-- for ALL subjects today — correct and intended: the tree lights up per-subject only
-- once REAL taxonomy is populated. `total − well_formed` (the disclosure banner's count
-- of unmapped rows) now correctly counts S0/K0 sentinels as unmapped, consistent with
-- the gate.
--
-- Security: SECURITY INVOKER (default, explicit) so `curr_read` RLS still governs; read
-- via the service-role client in practice. Grants mirror the other curriculum RPCs.
--
-- PROVENANCE / HOW TO APPLY: applied by hand in the Supabase SQL editor like
-- 0010/0015/0024/0044/0047/0049/0050/0051/0052; committed idempotently (CREATE OR
-- REPLACE) so the schema stays the locked source of truth and `supabase db reset`
-- reproduces it. The agent never executes SQL. Re-running is safe.

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
        and split_part(cl.taxonomy_id, '.', 2) <> 'S0'   -- exclude the S0 sentinel
        and split_part(cl.taxonomy_id, '.', 3) <> 'K0'   -- exclude the K0 sentinel
    )::bigint                                                                         as well_formed
  from public.curriculum_lesson cl
  where cl.is_active
    and cl.subject_code = p_subject;
$$;

revoke execute on function public.curriculum_taxonomy_coverage(text) from public;
grant  execute on function public.curriculum_taxonomy_coverage(text) to authenticated, service_role;
