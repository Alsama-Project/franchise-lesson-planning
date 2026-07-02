-- report_test_data.sql
--
-- READ-ONLY. Run this BEFORE reset_test_data.sql and eyeball the counts. It
-- writes nothing — it only shows the current centres and how much class/plan data
-- the reset will WIPE, so an operator can confirm before running the destructive
-- reset. Safe to re-run.
--
-- CONTEXT. reset_test_data.sql resets the whole (centre, class) layer to a clean,
-- uniform test set: it wipes ALL lesson_plans, class_teachers and classes, then
-- renames the two REAL centres and creates the rest so the final five are
-- Shatila 1 / Shatila 2 / Bourj 1 / Bourj 2 / Homs, each with English Year 0-6.
-- The two REAL centres are never deleted — only renamed — so their ids (and every
-- persona/tester subject_membership pinned to them) stay valid:
--   • Shatila Centre            42c11721-c16b-4221-a945-473c028278b7  -> "Shatila 1"
--   • Bourj al-Barajneh Centre  c87896b6-0f6d-4b20-bb32-1c31660645c1  -> "Bourj 1"
--
-- WHAT THE RESET REMOVES (this report counts it):
--   • ALL lesson_plans (wiped — cascades plan_comments / plan_events)
--   • ALL class_teachers
--   • ALL classes (recreated fresh as English Year 0-6 across the 5 centres)
--   • resource_usage.lesson_plan_id is NULLed (not deleted) so the plan wipe is
--     not blocked by that no-cascade FK; usage history rows survive.
-- WHAT IS NEVER TOUCHED:
--   • subject_membership (reported below for visibility ONLY — never deleted)
--   • the two REAL centre rows (renamed, not deleted)
--
-- Runs with the service-role connection (Supabase SQL editor or psql); bypasses
-- RLS. Never from a user request / anon key.

-- ── NOTICES: global wipe totals + dynamic (class-less plan) checks ────────────
-- Emitted to the editor's "Messages" pane. The per-centre grid follows.
do $$
declare
  v_has_lp_school  boolean;
  v_has_lp_subject boolean;
  v_lp_total       bigint;
  v_lp_classless   bigint := 0;
  v_ct_total       bigint;
  v_classes_total  bigint;
  v_ru_to_null     bigint;
  v_english        uuid;
begin
  select count(*) into v_lp_total      from public.lesson_plans;
  select count(*) into v_ct_total      from public.class_teachers;
  select count(*) into v_classes_total from public.classes;

  -- resource_usage.lesson_plan_id — no-cascade FK the reset must NULL first.
  select count(*) into v_ru_to_null
    from public.resource_usage where lesson_plan_id is not null;

  -- class-less, centre-scoped plans (lesson_plans.school_id) — column may be absent.
  select exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'lesson_plans'
              and column_name = 'school_id'
         ) into v_has_lp_school;
  if v_has_lp_school then
    execute 'select count(*) from public.lesson_plans where school_id is not null'
      into v_lp_classless;
  end if;

  select id into v_english from public.subjects where code = 'english';

  raise notice '── reset_test_data.sql will WIPE (global): ──';
  raise notice 'lesson_plans total (all deleted): %', v_lp_total;
  raise notice '  of which class-less / centre-scoped (school_id set): %', v_lp_classless;
  raise notice 'class_teachers total (all deleted): %', v_ct_total;
  raise notice 'classes total (all deleted, then recreated): %', v_classes_total;
  raise notice 'resource_usage rows to be NULLed (lesson_plan_id, not deleted): %', v_ru_to_null;
  if v_english is null then
    raise notice 'WARNING: no subject with code=''english'' — reset would create ZERO classes.';
  else
    raise notice 'english subject id resolved: %  (English Year 0-6 x 5 centres = 35 classes)', v_english;
  end if;
end $$;

-- ── Per-centre grid (all current centres) ─────────────────────────────────────
-- One row per centre currently in `schools`. subject_membership_refs is shown for
-- awareness only — the reset NEVER deletes membership rows.
select
  s.name                                                                 as centre,
  s.id                                                                   as centre_id,
  case
    when s.id = '42c11721-c16b-4221-a945-473c028278b7' then 'REAL -> rename "Shatila 1"'
    when s.id = 'c87896b6-0f6d-4b20-bb32-1c31660645c1' then 'REAL -> rename "Bourj 1"'
    else 'other'
  end                                                                    as disposition,
  (select count(*) from public.classes c
      where c.school_id = s.id)                                          as classes_total,
  (select count(*) from public.classes c
      where c.school_id = s.id and c.archived_at is null)                as classes_active,
  (select count(*) from public.classes c
      where c.school_id = s.id and c.archived_at is not null)            as classes_archived,
  (select count(*) from public.class_teachers ct
      join public.classes c on c.id = ct.class_id
     where c.school_id = s.id)                                           as class_teachers_refs,
  (select count(*) from public.lesson_plans lp
      join public.classes c on c.id = lp.class_id
     where c.school_id = s.id)                                           as lesson_plans_by_class,
  (select count(*) from public.subject_membership sm
      where sm.school_id = s.id)                                         as subject_membership_refs
from public.schools s
order by s.name;
