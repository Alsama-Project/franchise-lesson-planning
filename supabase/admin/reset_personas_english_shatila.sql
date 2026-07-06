-- reset_personas_english_shatila.sql
--
-- RE-RUNNABLE FIXTURE — "reset the impersonation personas to English · Shatila".
--
-- The two canonical impersonation personas (teacher1 / coordinator1) drift during
-- end-to-end testing: teacher1 accumulates extra subject memberships (and class
-- links) so it can author non-English plans, and coordinator1's chrome ends up
-- pointing at the wrong centre/subject while its coordinator power sprawls across
-- many subjects. That breaks the teacher → coordinator → teacher review loop. This
-- script pins BOTH personas back to English · Shatila and nothing else, and is
-- fully idempotent — re-paste it into the Supabase SQL editor whenever they drift.
--
-- ── HOW TO APPLY ──────────────────────────────────────────────────────────────
-- Runs with the service-role connection (Supabase SQL editor or psql) and bypasses
-- RLS — NEVER from a user request or the anon key. CC does not run it; George
-- applies it. It is plain DML in one transaction: no path assumes auth.uid() (the
-- SQL editor has a null session user). The only trigger it deliberately satisfies
-- is the lesson-plan soft-delete guard, via set_config('app.soft_delete','on').
--
-- ── WHY subject_membership *and* coordinator_subject *and* class_teachers ──────
-- The coordinator scope is split (PR #66):
--   • coordinator_subject = POWER, school-agnostic. Drives the console Members /
--     Curriculum tabs and the all-schools plan-access RLS branch. → English only.
--   • subject_membership role='coordinator' at Shatila·English = CHROME. Drives the
--     persona chip label ("Shatila 1 · English" + Coordinator badge), the read-only
--     review board, and the review-queue notifications. This is the load-bearing
--     row 0039 already establishes — WITHOUT it the coordinator view renders no
--     coordinator chrome. → exactly this one row.
-- And the planning board turns ANY class_teachers row into a board "space" even with
-- no matching membership (weekly-overview.ts: taught classes are folded into the
-- space map). So pinning membership without pinning class links leaves the exact
-- hole this exercise closes — it is how teacher1 authored the Arabic plan in the
-- first place. Hence class_teachers is scoped too.
--
-- ── END STATE (asserted by the verify SELECT at the bottom) ───────────────────
--   teacher1     : 1 subject_membership (English·Shatila, role='teacher', primary)
--                  0 coordinator_subject
--                  2 class_teachers (English·Shatila Y1 + Y2)
--   coordinator1 : 1 subject_membership (English·Shatila, role='coordinator', primary)
--                  1 coordinator_subject (English)
--                  0 class_teachers  (it reviews; it does not teach — any row would
--                                     break isSingleSpace and the read-only board)
--
-- ── ANCHORS (live ids — confirmed, do not re-derive) ──────────────────────────
--   teacher1     profile : 4d8be40e-8479-47a3-8b48-0a1fd9955d8c
--   coordinator1 profile : a4e79fa9-2231-4fd2-81a8-d7754d4cdb33
--   English subject      : a1812346-77ca-45c1-8a94-33260fbb8729
--   Shatila centre       : 42c11721-c16b-4221-a945-473c028278b7
--   English classes @ Shatila (keep for teacher1): Y1 b6b691e6-2213-4692-ba03-7c662f09cbdc
--                                                  Y2 652e1098-d3f2-46fd-8b59-b501aeb328b8
--   Abandoned Arabic-centre plan (soft-deleted)  : 577f2207-31ea-4afe-8d4e-40d45b293097

begin;

-- ══════════════════════════════════════════════════════════════════════════════
-- teacher1 → English · Shatila teacher, and nothing else
-- ══════════════════════════════════════════════════════════════════════════════

-- subject_membership: delete every row EXCEPT the canonical English·Shatila one.
-- Doing the delete BEFORE the upsert guarantees the one-primary-per-profile partial
-- unique index (uq_membership_primary) can never be transiently violated when we
-- set is_primary below — any stale is_primary=true row is gone first.
delete from public.subject_membership sm
where sm.profile_id = '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'
  and not (sm.school_id  = '42c11721-c16b-4221-a945-473c028278b7'
       and sm.subject_id = 'a1812346-77ca-45c1-8a94-33260fbb8729');

-- Upsert the one canonical teacher membership; force role + primary on re-run.
insert into public.subject_membership (profile_id, school_id, subject_id, role, is_primary)
values (
  '4d8be40e-8479-47a3-8b48-0a1fd9955d8c',
  '42c11721-c16b-4221-a945-473c028278b7',
  'a1812346-77ca-45c1-8a94-33260fbb8729',
  'teacher'::public.membership_role,
  true
)
on conflict (profile_id, school_id, subject_id)
  do update set role = 'teacher'::public.membership_role,
               is_primary = true;

-- teacher1 holds no coordinator power (belt-and-braces: a teacher persona must have
-- zero coordinator_subject rows, or it would silently gain all-schools review).
delete from public.coordinator_subject cs
where cs.profile_id = '4d8be40e-8479-47a3-8b48-0a1fd9955d8c';

-- class_teachers: keep ONLY the two English·Shatila links; delete any others (the
-- stray links that let teacher1 open non-English/other-centre bands on the board).
delete from public.class_teachers ct
where ct.teacher_id = '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'
  and ct.class_id not in (
    'b6b691e6-2213-4692-ba03-7c662f09cbdc',  -- English Y1 @ Shatila
    '652e1098-d3f2-46fd-8b59-b501aeb328b8'   -- English Y2 @ Shatila
  );

-- Ensure the two English links exist. SELECT-from-classes (not a bare VALUES) so a
-- missing class id is a harmless no-op rather than an FK error.
insert into public.class_teachers (class_id, teacher_id)
select c.id, '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'
from public.classes c
where c.id in (
  'b6b691e6-2213-4692-ba03-7c662f09cbdc',
  '652e1098-d3f2-46fd-8b59-b501aeb328b8'
)
on conflict (class_id, teacher_id) do nothing;

-- ══════════════════════════════════════════════════════════════════════════════
-- coordinator1 → English · Shatila coordinator, and nothing else
-- ══════════════════════════════════════════════════════════════════════════════

-- subject_membership (CHROME): reduce to exactly the English·Shatila coordinator
-- row. Delete-then-upsert, same primary-safety ordering as teacher1. The current
-- drift here is a role='teacher' row at Bourj — wrong role AND wrong centre — which
-- this removes.
delete from public.subject_membership sm
where sm.profile_id = 'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'
  and not (sm.school_id  = '42c11721-c16b-4221-a945-473c028278b7'
       and sm.subject_id = 'a1812346-77ca-45c1-8a94-33260fbb8729');

insert into public.subject_membership (profile_id, school_id, subject_id, role, is_primary)
values (
  'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33',
  '42c11721-c16b-4221-a945-473c028278b7',
  'a1812346-77ca-45c1-8a94-33260fbb8729',
  'coordinator'::public.membership_role,
  true
)
on conflict (profile_id, school_id, subject_id)
  do update set role = 'coordinator'::public.membership_role,
               is_primary = true;

-- coordinator_subject (POWER): reduce to exactly the English row; drop the other
-- (up to eight) subjects it sprawled across.
delete from public.coordinator_subject cs
where cs.profile_id = 'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'
  and cs.subject_id <> 'a1812346-77ca-45c1-8a94-33260fbb8729';

insert into public.coordinator_subject (profile_id, subject_id)
values (
  'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33',
  'a1812346-77ca-45c1-8a94-33260fbb8729'
)
on conflict (profile_id, subject_id) do nothing;

-- class_teachers: a coordinator reviews, it does not teach. Any taught class would
-- add a second board space and break the single-space read-only review surface, so
-- remove them all.
delete from public.class_teachers ct
where ct.teacher_id = 'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33';

-- ══════════════════════════════════════════════════════════════════════════════
-- Optional: soft-delete the abandoned Arabic-centre plan so it stops cluttering
-- test views. Reversible via restore_lesson_plan(id). Idempotent — the `deleted_at
-- is null` guard means a re-run never re-stamps an already-trashed row. The
-- set_config satisfies guard_lesson_plan_soft_delete (0048); no status changes, so
-- enforce_approval_role / log_plan_event stay dormant under the null session user.
-- ══════════════════════════════════════════════════════════════════════════════
do $$
begin
  perform set_config('app.soft_delete', 'on', true);
  update public.lesson_plans
     set deleted_at = now(),
         deleted_by = null   -- system/fixture soft-delete, no user actor
   where id = '577f2207-31ea-4afe-8d4e-40d45b293097'
     and deleted_at is null;
end $$;

commit;

-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFY — run after applying. Each persona should read PASS with the count legend
-- sm_total / cs_total / ct_total = "1 / 0 / 2" (teacher1) and "1 / 1 / 0"
-- (coordinator1). sm_english_shatila_ok = 1 means the single membership is exactly
-- English·Shatila with the expected role; ct_unexpected = 0 means no stray links.
-- ══════════════════════════════════════════════════════════════════════════════
with expected (profile_id, persona, want_role, want_sm, want_cs, want_ct, allowed_classes) as (
  values
    ('4d8be40e-8479-47a3-8b48-0a1fd9955d8c'::uuid, 'teacher1',     'teacher',     1, 0, 2,
       array['b6b691e6-2213-4692-ba03-7c662f09cbdc',
             '652e1098-d3f2-46fd-8b59-b501aeb328b8']::uuid[]),
    ('a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'::uuid, 'coordinator1', 'coordinator', 1, 1, 0,
       array[]::uuid[])
)
select
  e.persona,
  (select count(*) from public.subject_membership sm
     where sm.profile_id = e.profile_id)                              as sm_total,
  (select count(*) from public.subject_membership sm
     where sm.profile_id = e.profile_id
       and sm.school_id  = '42c11721-c16b-4221-a945-473c028278b7'
       and sm.subject_id = 'a1812346-77ca-45c1-8a94-33260fbb8729'
       and sm.role::text = e.want_role)                               as sm_english_shatila_ok,
  (select count(*) from public.coordinator_subject cs
     where cs.profile_id = e.profile_id)                              as cs_total,
  (select count(*) from public.coordinator_subject cs
     where cs.profile_id = e.profile_id
       and cs.subject_id = 'a1812346-77ca-45c1-8a94-33260fbb8729')    as cs_english,
  (select count(*) from public.class_teachers ct
     where ct.teacher_id = e.profile_id)                             as ct_total,
  (select count(*) from public.class_teachers ct
     where ct.teacher_id = e.profile_id
       and ct.class_id <> all (e.allowed_classes))                  as ct_unexpected,
  case when
        (select count(*) from public.subject_membership sm
           where sm.profile_id = e.profile_id) = e.want_sm
    and (select count(*) from public.subject_membership sm
           where sm.profile_id = e.profile_id
             and sm.school_id  = '42c11721-c16b-4221-a945-473c028278b7'
             and sm.subject_id = 'a1812346-77ca-45c1-8a94-33260fbb8729'
             and sm.role::text = e.want_role) = 1
    and (select count(*) from public.coordinator_subject cs
           where cs.profile_id = e.profile_id) = e.want_cs
    and (select count(*) from public.class_teachers ct
           where ct.teacher_id = e.profile_id) = e.want_ct
    and (select count(*) from public.class_teachers ct
           where ct.teacher_id = e.profile_id
             and ct.class_id <> all (e.allowed_classes)) = 0
       then 'PASS' else 'FAIL' end                                    as result
from expected e
order by e.persona;

-- Arabic plan soft-delete check: expect deleted = true (deleted_at set).
select
  id,
  (deleted_at is not null) as deleted
from public.lesson_plans
where id = '577f2207-31ea-4afe-8d4e-40d45b293097';
