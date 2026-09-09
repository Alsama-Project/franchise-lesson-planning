-- 20260909074201_evaluation_weeks.sql
--
-- Org-wide EVALUATION WEEKS in the Term calendar. Three evaluations per academic
-- year — Baseline (Sep), Midline (Feb), Endline (Jul). An evaluation week is NOT a
-- teaching week: it is standalone at the academic-year level, INDEPENDENT of terms
-- and with NO centre/year scope (the same dates apply to the whole org). Admins set
-- these in Settings → Term calendar.
--
-- WHAT READS THIS
--   The admin Term calendar tab reads `evaluation` to (a) render each set evaluation
--   as a non-teaching band on the academic-year axis and (b) subtract evaluation
--   weeks from a term's *displayed* teaching-week count. Both are pure DISPLAY
--   derivations in the client.
--
-- ZERO INVOLVEMENT WITH term_week / week_no
--   This table does not feed, gate, or alter `term_week` generation or `week_no`
--   assignment. The teaching-week spine stays exactly date-driven off `term`. A term
--   whose displayed count now nets out an evaluation week may therefore diverge from
--   the stored `term_week` rows — that divergence is EXPECTED and owned separately.
--
-- SHAPE
--   One row per (academic_year, type). Setting an evaluation UPSERTS the row;
--   clearing it DELETES the row. `unique (academic_year, type)` backs the upsert.
--
-- DATES: plain Gregorian `date`, Latin numerals, Lebanon wall-clock. NO UTC
-- conversion — a `date` carries no timezone and must not be shifted. `starts_on` is
-- the Monday of the evaluation week; the app snaps to a Monday before writing and the
-- check rejects any non-Monday that bypasses the UI (Postgres isodow: 1 = Monday).
--
-- PROVENANCE: like the other migrations, this DDL is applied by hand in the Supabase
-- SQL editor by George (see migrations/README.md). Sessions AUTHOR the file and
-- NEVER execute it. `is_admin()` is defined in migration 0012 and `set_updated_at()`
-- in migration 0003, so both are available here.

-- ── evaluation_type: the three fixed evaluation kinds ───────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'evaluation_type') then
    create type public.evaluation_type as enum ('baseline', 'midline', 'endline');
  end if;
end $$;

-- ── evaluation: org-wide, year-level evaluation weeks ───────────────────────
create table if not exists public.evaluation (
  id uuid primary key default gen_random_uuid(),
  -- The academic year keyed by its START year (August boundary, matching
  -- `academicYearOf` in src/lib/week.ts): 2026 == "2026 / 27".
  academic_year int not null,
  type public.evaluation_type not null,
  -- The Monday of the evaluation week (see header note on the isodow check).
  starts_on date not null check (extract(isodow from starts_on) = 1),
  num_weeks smallint not null default 1 check (num_weeks between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per (year, type): upsert sets it, delete clears it.
  unique (academic_year, type)
);

-- Bands and the count derivation filter by academic year; index the filter key.
create index if not exists evaluation_academic_year_idx on public.evaluation (academic_year);

-- Maintain updated_at on every edit (reuses the shared helper from migration 0003).
drop trigger if exists evaluation_set_updated_at on public.evaluation;
create trigger evaluation_set_updated_at
  before update on public.evaluation
  for each row
  execute function public.set_updated_at();

-- ── RLS: all authenticated read; only admins write (mirrors `term`, 0026) ────
alter table public.evaluation enable row level security;

drop policy if exists evaluation_read on public.evaluation;
create policy evaluation_read
  on public.evaluation for select to authenticated
  using (true);

drop policy if exists evaluation_admin_insert on public.evaluation;
create policy evaluation_admin_insert
  on public.evaluation for insert to authenticated
  with check (public.is_admin());

drop policy if exists evaluation_admin_update on public.evaluation;
create policy evaluation_admin_update
  on public.evaluation for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists evaluation_admin_delete on public.evaluation;
create policy evaluation_admin_delete
  on public.evaluation for delete to authenticated
  using (public.is_admin());

-- Ledger (going-forward convention; see 20260803093441).
insert into applied_migration (filename, note)
values ('20260909074201_evaluation_weeks.sql', null)
on conflict (filename) do nothing;
