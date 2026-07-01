-- seed_centres_classes.sql
--
-- Ensure the four centres and the full Year 1–6 English class list exist, so the
-- onboarding year/class picker offers every year at every centre (the picker is
-- already multi-select; the earlier "only Year 3" symptom was missing data).
--
-- Runs with the service-role connection (Supabase SQL editor or psql) and
-- bypasses RLS — never from a user request. Fully idempotent: it only inserts
-- what is missing, and it does NOT rename, merge, or delete any existing centre
-- or class. If the live database already holds centres under different names
-- (e.g. the old "Shatila Centre" / "Bourj al-Barajneh Centre"), those are left
-- untouched — reconcile or archive them by hand if you want them retired.
--
-- ASSUMPTIONS to confirm before running:
--   • Centre names: 'Shatila 1', 'Shatila 2', 'Bourj 1', 'Bourj 2'.
--   • Curriculum runs Years 1–6, one English class per (centre, year).
--   • `literacy` is left at the column default ('mixed'). If a centre streams a
--     year by literacy, adjust that class row afterwards.

-- 1. Centres — insert only the ones not already present (matched by name).
insert into public.schools (name)
select v.name
from (values ('Shatila 1'), ('Shatila 2'), ('Bourj 1'), ('Bourj 2')) as v(name)
where not exists (
  select 1 from public.schools s where s.name = v.name
);

-- 2. English classes, Years 1–6, at each of the four centres. Insert only where
--    no ACTIVE class already holds that (centre, subject, year) tuple — mirrors
--    the partial unique index from 0018 (archived_at is null).
insert into public.classes (school_id, subject_id, year)
select s.id, sub.id, y.year
from public.schools s
cross join public.subjects sub
cross join generate_series(1, 6) as y(year)
where sub.code = 'english'
  and s.name in ('Shatila 1', 'Shatila 2', 'Bourj 1', 'Bourj 2')
  and not exists (
    select 1 from public.classes c
    where c.school_id = s.id
      and c.subject_id = sub.id
      and c.year = y.year
      and c.archived_at is null
  );
