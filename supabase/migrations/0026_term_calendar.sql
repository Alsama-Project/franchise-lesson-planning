-- 0025_term_calendar.sql
--
-- The admin-defined academic-year term calendar ("Option B" timeline). Admins
-- lay out the school's terms as editable bands; the planning board then shows
-- real week-commencing dates instead of "Week of —".
--
-- SCOPE: org-level v1 — ONE shared calendar for the whole org (no centre column).
-- Per-centre calendars are a deliberate FUTURE extension; do not build them here.
--
-- TWO objects:
--   1. `term`       — the editable rows (name, the Monday of Week 1, a week count).
--   2. `term_week`  — REPLACES the old hand-maintained `public.term_week` table
--      (which George kept empty and seeded by SQL) with a VIEW derived from `term`.
--      It exposes the SAME flat contract the board already reads — `(week_no,
--      starts_on)` — so `src/lib/term-week.ts` and the whole board are untouched:
--      teaching-week N resolves to the Nth term-Monday across all terms in date
--      order. It additionally exposes `term_id` / `week_number` / `week_commencing`
--      for callers that want the per-term shape. A view means zero sync code and no
--      drift: editing a term instantly re-resolves every week.
--
-- DATES: plain Gregorian `date`, Latin numerals, Lebanon wall-clock. NO UTC
-- conversion — a `date` carries no timezone and must not be shifted.
--
-- NOTE ON PROVENANCE: like the other numbered migrations, this DDL is applied by
-- hand in the Supabase SQL editor (George applies it to the live database). It is
-- committed here, idempotently, so the schema stays the locked source of truth in
-- repo and a local `supabase db reset` reproduces it. `is_admin()` is defined in
-- migration 0012, so it is available here.

-- ── term: the editable bands ────────────────────────────────────────────────
create table if not exists public.term (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- The Monday of Week 1. The app always snaps to a Monday before writing; this
  -- check rejects any non-Monday that bypasses the UI (Postgres dow: 1 = Monday).
  starts_on date not null check (extract(isodow from starts_on) = 1),
  num_weeks smallint not null check (num_weeks between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bands are laid out in start-date order on the timeline and concatenated into the
-- global week sequence; index the sort key.
create index if not exists term_starts_on_idx on public.term (starts_on);

-- Maintain updated_at on every edit (reuses the shared helper from migration 0003).
drop trigger if exists term_set_updated_at on public.term;
create trigger term_set_updated_at
  before update on public.term
  for each row
  execute function public.set_updated_at();

-- ── term_week: a VIEW over term (replaces the old empty table) ───────────────
-- The legacy object may exist as a TABLE (in prod) or, on a re-run, as this VIEW.
-- `drop ... if exists` does NOT tolerate the wrong relkind, so branch on it.
do $$
begin
  if exists (
    select 1 from pg_class
    where relname = 'term_week'
      and relnamespace = 'public'::regnamespace
      and relkind = 'r'
  ) then
    execute 'drop table public.term_week cascade';
  end if;
  if exists (
    select 1 from pg_class
    where relname = 'term_week'
      and relnamespace = 'public'::regnamespace
      and relkind = 'v'
  ) then
    execute 'drop view public.term_week';
  end if;
end $$;

-- security_invoker: the view respects the CALLER's RLS on `term` (authenticated
-- read), rather than running as the view owner. `week_no` is the global running
-- teaching-week number across all terms in start-date order — the key the board
-- already queries by. `starts_on` is kept for board compatibility; `week_commencing`
-- is the same value under the per-term name.
create view public.term_week
  with (security_invoker = true)
as
select
  (row_number() over (order by t.starts_on, t.id, wk.week_number))::int as week_no,
  t.id as term_id,
  wk.week_number,
  (t.starts_on + (wk.week_number - 1) * 7)::date as starts_on,
  (t.starts_on + (wk.week_number - 1) * 7)::date as week_commencing
from public.term t
cross join lateral generate_series(1, t.num_weeks) as wk(week_number);

-- ── RLS: all authenticated read term; only admins write ─────────────────────
alter table public.term enable row level security;

drop policy if exists term_read on public.term;
create policy term_read
  on public.term for select to authenticated
  using (true);

drop policy if exists term_admin_insert on public.term;
create policy term_admin_insert
  on public.term for insert to authenticated
  with check (public.is_admin());

drop policy if exists term_admin_update on public.term;
create policy term_admin_update
  on public.term for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists term_admin_delete on public.term;
create policy term_admin_delete
  on public.term for delete to authenticated
  using (public.is_admin());

-- The view carries no RLS of its own; security_invoker defers to term_read above.
grant select on public.term_week to authenticated;
