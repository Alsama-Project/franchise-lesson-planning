-- 0050_curriculum_taxonomy_aggregates.sql
--
-- The SQL foundation both read-only curriculum surfaces (the Logic-tree Explorer and
-- the coordinator Insights page) sit on. Two parts:
--
--   1) A view that PARSES `taxonomy_id` ("FA.S.K.H") into its segments once, in the
--      DB, so every consumer agrees on the mapping — segment 1 = Focus Area (NOT the
--      year), 2 = Skill LO, 3 = Knowledge LO, 4 = Hour. This is the SQL twin of
--      src/lib/curriculum/taxonomy.ts; keep the two in step.
--   2) Aggregate RPCs for the Insights page. Each SCANS a whole subject (English is
--      ~1190 active rows) but RETURNS a small GROUP BY result, so the PostgREST
--      1000-row cap can never truncate them — the reason these are functions, NOT a
--      client-side reduction over a bulk `select` (which would silently cap at 1000).
--
-- Placeholder rows — "E.*" (exam/evaluation) and "L.*" (empty) whose first segment is
-- a letter — are EXCLUDED everywhere: they are not curriculum outcomes. The spiral
-- additionally discounts the flat `*.S0.K0.*` artefact so broken-source recurrence
-- does not read as genuine spiralling.
--
-- Scope: every RPC takes `p_subject` and filters to it — per-subject by construction,
-- matching the app's per-consumer scoping rule. `taxonomy_id is null` rows drop out of
-- the view, so a subject whose ids are unpopulated simply yields empty aggregates
-- (the surfaces render their empty state) rather than wrong numbers.
--
-- Security: the view is `security_invoker` and the functions are SECURITY INVOKER
-- (the default, stated explicitly) so the existing `curr_read` RLS still governs; in
-- practice they are read via the service-role client (reference data, identical for
-- every user). Grants mirror curriculum_active_subjects (0047).
--
-- PROVENANCE / HOW TO APPLY: applied by hand in the Supabase SQL editor like
-- 0010/0015/0024/0044/0047/0049; committed idempotently (CREATE OR REPLACE) so the
-- schema stays the locked source of truth and `supabase db reset` reproduces it. The
-- agent never executes SQL. Re-running is safe.

-- ── 1) Parsed-taxonomy view ─────────────────────────────────────────────────────────

create or replace view public.curriculum_taxonomy
  with (security_invoker = true) as
  select
    cl.id,
    cl.subject_code,
    cl.year,
    cl.month,
    cl.week,
    cl.period,
    cl.taxonomy_id,
    -- Focus Area: segment 1, but ONLY when numeric (letter-led = placeholder).
    case when split_part(cl.taxonomy_id, '.', 1) ~ '^[0-9]+$'
         then split_part(cl.taxonomy_id, '.', 1)::int end                as focus_area,
    -- Skill / Knowledge LO refs, normalised upper-case (e.g. 'S1', 'K1').
    case when split_part(cl.taxonomy_id, '.', 2) ~* '^S[0-9]+$'
         then upper(split_part(cl.taxonomy_id, '.', 2)) end              as skill_lo,
    case when split_part(cl.taxonomy_id, '.', 3) ~* '^K[0-9]+$'
         then upper(split_part(cl.taxonomy_id, '.', 3)) end              as knowledge_lo,
    -- Hour ordinal: segment 4, digits only (strip the leading 'H').
    case when split_part(cl.taxonomy_id, '.', 4) ~* '^H?[0-9]+$'
         then nullif(regexp_replace(split_part(cl.taxonomy_id, '.', 4), '[^0-9]', '', 'g'), '')::int
    end                                                                  as hour,
    -- Placeholder: a letter-led first segment ("E.*"/"L.*").
    (split_part(cl.taxonomy_id, '.', 1) !~ '^[0-9]+$')                   as is_placeholder,
    -- Flat artefact of the broken source numbering — discounted from the spiral.
    (upper(split_part(cl.taxonomy_id, '.', 2)) = 'S0'
       and upper(split_part(cl.taxonomy_id, '.', 3)) = 'K0')             as is_flat_artefact,
    cl.theme,
    cl.focus_area as focus_area_text
  from public.curriculum_lesson cl
  where cl.is_active and cl.taxonomy_id is not null;

grant select on public.curriculum_taxonomy to authenticated, service_role;

-- ── 2) Insights aggregate RPCs (per subject) ────────────────────────────────────────

-- Hours per (year, month) — the Insights "hours-per-month, per year" chart.
create or replace function public.curriculum_hours_per_month(p_subject text)
returns table (year int, month text, hours bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select t.year, t.month, count(*)::bigint
  from public.curriculum_taxonomy t
  where t.subject_code = p_subject
    and not t.is_placeholder
  group by t.year, t.month;
$$;

-- Hours per (Focus Area, S.K topic) — optionally within one year.
create or replace function public.curriculum_hours_by_focus_topic(
  p_subject text,
  p_year int default null
)
returns table (year int, focus_area int, skill_lo text, knowledge_lo text, hours bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select t.year, t.focus_area, t.skill_lo, t.knowledge_lo, count(*)::bigint
  from public.curriculum_taxonomy t
  where t.subject_code = p_subject
    and not t.is_placeholder
    and (p_year is null or t.year = p_year)
  group by t.year, t.focus_area, t.skill_lo, t.knowledge_lo;
$$;

-- Coverage matrix: hour counts per (Focus Area, S.K topic, year).
create or replace function public.curriculum_coverage_matrix(p_subject text)
returns table (focus_area int, skill_lo text, knowledge_lo text, year int, hours bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select t.focus_area, t.skill_lo, t.knowledge_lo, t.year, count(*)::bigint
  from public.curriculum_taxonomy t
  where t.subject_code = p_subject
    and not t.is_placeholder
  group by t.focus_area, t.skill_lo, t.knowledge_lo, t.year;
$$;

-- Spiral: presence (hour count) of an S.K topic per year. Flat S0.K0 artefacts are
-- discounted so they don't read as real recurrence. v1 carries no depth proxy — no
-- source column expresses increasing complexity across years (see the Phase 0 report),
-- so the spiral shows presence/recurrence only.
create or replace function public.curriculum_spiral(p_subject text)
returns table (skill_lo text, knowledge_lo text, year int, hours bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select t.skill_lo, t.knowledge_lo, t.year, count(*)::bigint
  from public.curriculum_taxonomy t
  where t.subject_code = p_subject
    and not t.is_placeholder
    and not t.is_flat_artefact
    and t.skill_lo is not null
  group by t.skill_lo, t.knowledge_lo, t.year;
$$;

revoke execute on function public.curriculum_hours_per_month(text)        from public;
revoke execute on function public.curriculum_hours_by_focus_topic(text, int) from public;
revoke execute on function public.curriculum_coverage_matrix(text)        from public;
revoke execute on function public.curriculum_spiral(text)                 from public;

grant execute on function public.curriculum_hours_per_month(text)         to authenticated, service_role;
grant execute on function public.curriculum_hours_by_focus_topic(text, int) to authenticated, service_role;
grant execute on function public.curriculum_coverage_matrix(text)         to authenticated, service_role;
grant execute on function public.curriculum_spiral(text)                  to authenticated, service_role;
