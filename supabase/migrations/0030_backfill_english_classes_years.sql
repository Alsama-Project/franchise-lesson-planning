-- 0030_backfill_english_classes_years.sql
--
-- Backfill the full Year 1–6 English class list so the onboarding / settings
-- "My classes" year picker offers every year at every centre.
--
-- Phase 0 finding: the picker is data-driven — it groups `classes` filtered to
-- the teacher's subject spaces by `year`, with NO code cap. The "only up to
-- Year 2" symptom is therefore simply missing `classes` rows in that
-- environment, not a code limit. This migration ensures the rows exist.
--
-- Mirrors supabase/admin/seed_centres_classes.sql exactly (same columns, default
-- literacy, active rows only) but generalises from the four named centres to
-- EVERY active school. Scoped to active schools + the active English subject to
-- match planning semantics (archived centres/subjects are hidden from planning,
-- so seeding classes under them would create invisible rows); if you also want
-- archived centres backfilled, drop the `s.archived_at is null` filter.
--
-- Idempotent: ON CONFLICT DO NOTHING against the post-0018 partial unique index
-- classes_school_subject_year_active_key — (school_id, subject_id, year) WHERE
-- archived_at IS NULL — so it no-ops wherever an ACTIVE class already holds that
-- (centre, subject, year) tuple, and it never touches archived rows, centre
-- names, or literacy streams.
--
-- English subject: resolved by `subjects.code = 'english'` (a UNIQUE column), the
-- same convention the seed uses. In the live DB that is the English row id
-- a1812346-77ca-45c1-8a94-33260fbb8729. `literacy` is left at the column default
-- ('mixed'), matching the seed; adjust any literacy-streamed year by hand after.
--
-- CC never applies migrations — George runs this in the Supabase SQL editor.
-- Idempotent: safe to re-run.

insert into public.classes (school_id, subject_id, year)
select s.id, sub.id, y.year
from public.schools s
cross join public.subjects sub
cross join generate_series(1, 6) as y(year)
where sub.code = 'english'
  and sub.archived_at is null
  and s.archived_at is null
on conflict (school_id, subject_id, year) where archived_at is null do nothing;
