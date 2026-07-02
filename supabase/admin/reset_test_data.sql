-- reset_test_data.sql
--
-- ⚠️ DESTRUCTIVE — one-off. Resets the whole (centre, class) layer to a clean,
-- uniform test set in ONE transaction. Run report_test_data.sql FIRST and eyeball
-- the counts before running this.
--
-- FINAL STATE after a successful run:
--   • Exactly five centres: Shatila 1, Shatila 2, Bourj 1, Bourj 2, Homs.
--   • Each centre has English Year 0-6 classes (7 per centre = 35 total).
--     (Only English is seeded here — George adds any other subjects' classes from
--      the admin page. The check `year between 0 and 6` accepts Year 0.)
--   • ALL prior lesson_plans / class_teachers / classes are wiped.
--
-- HOW THE FIVE CENTRES ARE REACHED (this DB currently holds ONLY the two REAL
-- centres — there are no seed-duplicate centres to delete):
--   • RENAME  Shatila Centre            42c11721-… -> "Shatila 1"
--   • RENAME  Bourj al-Barajneh Centre  c87896b6-… -> "Bourj 1"
--   • CREATE  "Shatila 2", "Bourj 2", "Homs" (only if missing, matched by name)
-- The two REAL centres are RENAMED, never deleted — their ids (and every
-- persona/tester subject_membership pinned to them) stay valid. No membership row
-- is ever touched.
--
-- FK ORDER (nothing in the class/centre graph cascades; deletes are explicit,
-- bottom-up). Note resource_usage.lesson_plan_id is a NO-ACTION, nullable FK to
-- lesson_plans — it would BLOCK the plan wipe, so it is NULLed first (usage
-- history rows survive). plan_comments / plan_events cascade from lesson_plans.
--     resource_usage.lesson_plan_id  (NULLed)
--   → lesson_plans   (all)  -- cascades plan_comments / plan_events
--   → class_teachers (all)
--   → classes        (all)
--   → schools        (RENAME two, CREATE three — never deleted)
--   → classes        (INSERT English Year 0-6 x 5 centres)
--
-- ATOMICITY. Wrapped in ONE transaction with abort-guards: if either REAL centre
-- id is missing, if the English subject is missing, or if any final centre name
-- resolves to more than one row, it RAISEs and the whole thing rolls back —
-- nothing partial. Any unexpected FK likewise rolls it all back.
--
-- Re-running after a successful reset re-wipes and rebuilds to the same end state
-- (idempotent by result; the renames and centre creates no-op the second time).
--
-- Runs with the service-role connection (Supabase SQL editor or psql); bypasses
-- RLS. Never from a user request / anon key.

begin;

do $$
declare
  v_shatila  uuid := '42c11721-c16b-4221-a945-473c028278b7';  -- REAL Shatila
  v_bourj    uuid := 'c87896b6-0f6d-4b20-bb32-1c31660645c1';  -- REAL Bourj
  v_english  uuid;
  v_names    text[] := array['Shatila 1','Shatila 2','Bourj 1','Bourj 2','Homs'];
  v_name     text;
  v_dupe     text;
  v_ru       bigint;
  v_lp       bigint;
  v_ct       bigint;
  v_classes  bigint;
  v_created  bigint;
  v_inserted bigint;
begin
  -- ── Pre-flight abort-guards ────────────────────────────────────────────────
  if not exists (select 1 from public.schools where id = v_shatila) then
    raise exception 'ABORT: REAL Shatila centre % not found — refusing to reset.', v_shatila;
  end if;
  if not exists (select 1 from public.schools where id = v_bourj) then
    raise exception 'ABORT: REAL Bourj centre % not found — refusing to reset.', v_bourj;
  end if;

  select id into v_english from public.subjects where code = 'english';
  if v_english is null then
    raise exception 'ABORT: no subject with code=''english'' — refusing to create 0 classes.';
  end if;

  -- ── 1. NULL the no-cascade FK that would block the plan wipe ───────────────
  update public.resource_usage set lesson_plan_id = null where lesson_plan_id is not null;
  get diagnostics v_ru = row_count;

  -- ── 2. Wipe ALL lesson_plans (cascades plan_comments / plan_events) ────────
  delete from public.lesson_plans;
  get diagnostics v_lp = row_count;

  -- ── 3. Wipe ALL class_teachers ─────────────────────────────────────────────
  delete from public.class_teachers;
  get diagnostics v_ct = row_count;

  -- ── 4. Wipe ALL classes ────────────────────────────────────────────────────
  delete from public.classes;
  get diagnostics v_classes = row_count;

  -- ── 5. Rename the two REAL centres (keeps ids -> memberships intact) ───────
  update public.schools set name = 'Shatila 1' where id = v_shatila;
  update public.schools set name = 'Bourj 1'   where id = v_bourj;

  -- ── 6. Create the three new centres if missing (matched by name) ───────────
  insert into public.schools (name)
  select v.name
  from (values ('Shatila 2'), ('Bourj 2'), ('Homs')) as v(name)
  where not exists (select 1 from public.schools s where s.name = v.name);
  get diagnostics v_created = row_count;

  -- ── 6b. Guard: each final name must resolve to exactly ONE centre ──────────
  -- (schools.name has no unique constraint; a stray duplicate would silently
  --  double-seed classes. Abort if that ever happens.)
  foreach v_name in array v_names loop
    if (select count(*) from public.schools where name = v_name) <> 1 then
      raise exception 'ABORT: centre name "%" resolves to % rows (expected exactly 1).',
        v_name, (select count(*) from public.schools where name = v_name);
    end if;
  end loop;

  -- ── 7. Create English Year 0-6 at all five centres ────────────────────────
  --    ON CONFLICT mirrors the partial unique index from 0018
  --    (school_id, subject_id, year) WHERE archived_at IS NULL.
  insert into public.classes (school_id, subject_id, year)
  select s.id, v_english, y.year
  from public.schools s
  cross join generate_series(0, 6) as y(year)
  where s.name = any(v_names)
  on conflict (school_id, subject_id, year) where archived_at is null do nothing;
  get diagnostics v_inserted = row_count;

  raise notice 'RESET DONE — wiped: resource_usage nulled=%, lesson_plans=%, class_teachers=%, classes=%; created centres=%; created English Y0-6 classes=% (expect 35).',
    v_ru, v_lp, v_ct, v_classes, v_created, v_inserted;
end $$;

commit;
