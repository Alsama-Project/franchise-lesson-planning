-- 0018_remove_class_group.sql
--
-- Remove the GROUP concept from classes. A class is now identified by the tuple
-- (school_id, subject_id, year) alone — no group letter. This drops
-- `classes.group_label` and reworks uniqueness from the old 4-column key
-- (school_id, subject_id, year, group_label) to a 3-column key.
--
-- DATA-LOSS GUARD: collapsing groups would merge/orphan classes (and their
-- members + plans) wherever a single (school, subject, year) currently has more
-- than one ACTIVE class. This migration REFUSES to run if any such collision
-- exists — it raises and rolls back instead of silently dropping rows. Resolve
-- the collisions first (merge or re-key the duplicate classes by hand), then
-- re-run. See the standalone collision-check query in the Phase 0 report.
--
-- Uniqueness is enforced on ACTIVE rows only (archived_at is null), via a
-- partial unique index — matching the soft-archive model from 0014, so an
-- archived class never blocks a freshly created one on the same tuple.
--
-- NOTE ON PROVENANCE: this DDL is also applied manually by an operator in the
-- Supabase SQL editor (George applies it to the live database). It is committed
-- here, idempotently, so the schema stays the locked source of truth in-repo and
-- a local `supabase db reset` reproduces it. Every statement is guarded so
-- re-running is safe.

-- 1. Refuse to collapse if any active (school, subject, year) holds >1 class.
do $$
declare
  collisions text;
begin
  select string_agg(
           format('  school_id=%s subject_id=%s year=%s → %s active classes',
                  school_id, subject_id, year, n),
           e'\n' order by school_id, subject_id, year)
    into collisions
  from (
    select school_id, subject_id, year, count(*) as n
    from public.classes
    where archived_at is null
    group by school_id, subject_id, year
    having count(*) > 1
  ) dupes;

  if collisions is not null then
    raise exception
      e'Cannot remove class group: these (school, subject, year) tuples have multiple active classes.\n%\nResolve them before applying this migration.',
      collisions;
  end if;
end $$;

-- 2. Drop the group column. Postgres auto-drops the old 4-column unique
--    constraint (school_id, subject_id, year, group_label) that depends on it.
alter table public.classes drop column if exists group_label;

-- 3. New uniqueness on active rows only: one class per (school, subject, year).
create unique index if not exists classes_school_subject_year_active_key
  on public.classes (school_id, subject_id, year)
  where archived_at is null;
