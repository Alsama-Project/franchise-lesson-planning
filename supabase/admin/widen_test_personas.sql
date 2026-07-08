-- widen_test_personas.sql
--
-- RE-RUNNABLE FIXTURE — "widen the shared impersonation personas to FULL coverage".
--
-- This SUPERSEDES the English-only trim (reset_personas_english_shatila.sql). That
-- reset pinned teacher1 / coordinator1 to English·Shatila and nothing else, which
-- broke testing every OTHER subject with "You are not a member of this class" —
-- plans couldn't be created or reviewed. This fixture re-widens both shared personas
-- so any impersonator can run the full teacher → coordinator → teacher loop in ANY
-- subject at the testing centres:
--
--   teacher1     : a role='teacher'      subject_membership for every subject × centre,
--                  plus class_teachers links (Y1 + Y2) so lesson creation auto-binds.
--   coordinator1 : a coordinator_subject (POWER) row for every subject, AND a
--                  role='coordinator' subject_membership (CHROME) for every subject ×
--                  centre so the review board/chip render. No class links (it reviews).
--
-- It is ADDITIVE (widening only) and SCOPED to these two personas' rows plus the
-- classes/links they need — it deletes nobody else's data and touches no other user.
--
-- ── HOW TO APPLY ──────────────────────────────────────────────────────────────
-- Runs with the service-role connection (Supabase SQL editor or psql) and bypasses
-- RLS — NEVER from a user request or the anon key. CC does not run it; George applies
-- it. Plain DML in one transaction; no path assumes auth.uid() (the SQL editor has a
-- null session user). Fully idempotent (upserts / ON CONFLICT / clear-then-set), so
-- re-pasting it is safe and never duplicates rows.
--
-- ── SCHEMA BINDINGS (verified against the migrations, not assumed) ─────────────
--   • subjects(id, name, code, archived_at)                         — 0002 / 0014.
--   • schools(id, name, archived_at)                                — 0002 / 0014.
--   • classes(id, school_id, subject_id, year 0–6, literacy default 'mixed',
--       archived_at); group_label DROPPED in 0018; partial-unique
--       classes_school_subject_year_active_key on (school_id, subject_id, year)
--       WHERE archived_at is null — so ON CONFLICT infers that index (mirrors 0030).
--   • subject_membership(profile_id, school_id, subject_id, role membership_role,
--       is_primary) — unique (profile_id, school_id, subject_id) (0012); partial-
--       unique uq_membership_primary on (profile_id) WHERE is_primary (0042).
--   • coordinator_subject(profile_id, subject_id) — pk (profile_id, subject_id) (0040).
--   • class_teachers(class_id, teacher_id) — unique (class_id, teacher_id) (0002).
--   • membership_role enum is ('teacher','coordinator') (0012).
--
-- ── ANCHORS (live ids — confirmed, do not re-derive) ──────────────────────────
--   teacher1     profile : 4d8be40e-8479-47a3-8b48-0a1fd9955d8c
--   coordinator1 profile : a4e79fa9-2231-4fd2-81a8-d7754d4cdb33
--   English subject      : a1812346-77ca-45c1-8a94-33260fbb8729  (default active space)
--   Shatila 1 centre     : 42c11721-c16b-4221-a945-473c028278b7
--   Bourj 1 centre       : c87896b6-0f6d-4b20-bb32-1c31660645c1
--
-- "Every subject" is resolved DYNAMICALLY from public.subjects (active rows only),
-- so this covers whatever subjects the live DB holds without hardcoding their ids —
-- it re-adds coverage as subjects are added. The testing centres are an explicit,
-- editable list below (extend it if testers use more centres).

begin;

-- ══════════════════════════════════════════════════════════════════════════════
-- Target scope: (testing centre × active subject)
-- ══════════════════════════════════════════════════════════════════════════════

-- Testing centres. EDIT THIS LIST if testers use more centres — everything below
-- derives from it. Guarded against a bad/archived id just after.
create temporary table _centres (school_id uuid) on commit drop;
insert into _centres (school_id) values
  ('42c11721-c16b-4221-a945-473c028278b7'),  -- Shatila 1
  ('c87896b6-0f6d-4b20-bb32-1c31660645c1');  -- Bourj 1
-- Keep only centres that actually exist and are active (a typo can't widen wrongly).
delete from _centres c
where not exists (
  select 1 from public.schools s
  where s.id = c.school_id and s.archived_at is null
);

-- Every active subject = "all subjects". Archived subjects are hidden from planning,
-- so seeding under them would create invisible rows.
create temporary table _subjects (subject_id uuid) on commit drop;
insert into _subjects (subject_id)
  select id from public.subjects where archived_at is null;

-- The full (centre × subject) matrix every persona is widened across.
create temporary table _scope (school_id uuid, subject_id uuid) on commit drop;
insert into _scope (school_id, subject_id)
  select c.school_id, s.subject_id
  from _centres c
  cross join _subjects s;

-- ══════════════════════════════════════════════════════════════════════════════
-- teacher1 → teacher membership across every subject × centre
-- ══════════════════════════════════════════════════════════════════════════════

-- Upsert a role='teacher' membership for each scope cell. On re-run, force the role
-- back to 'teacher' (teacher1 is purely a teacher) without touching is_primary.
insert into public.subject_membership (profile_id, school_id, subject_id, role)
select '4d8be40e-8479-47a3-8b48-0a1fd9955d8c', sc.school_id, sc.subject_id,
       'teacher'::public.membership_role
from _scope sc
on conflict (profile_id, school_id, subject_id)
  do update set role = 'teacher'::public.membership_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- coordinator1 → full coordinator scope across everything
-- ══════════════════════════════════════════════════════════════════════════════

-- POWER: coordinate every subject, school-agnostic (drives Members/Curriculum tabs
-- and the all-schools plan-access RLS branch).
insert into public.coordinator_subject (profile_id, subject_id)
select 'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33', s.subject_id
from _subjects s
on conflict (profile_id, subject_id) do nothing;

-- CHROME: a role='coordinator' membership for every subject × centre. Without this
-- row the coordinator chip/review board never render coordinator chrome (0039). On
-- re-run, force the role to 'coordinator' without touching is_primary.
insert into public.subject_membership (profile_id, school_id, subject_id, role)
select 'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33', sc.school_id, sc.subject_id,
       'coordinator'::public.membership_role
from _scope sc
on conflict (profile_id, school_id, subject_id)
  do update set role = 'coordinator'::public.membership_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- Classes so plans can bind — one per (centre × subject) for Y1 and Y2
-- ══════════════════════════════════════════════════════════════════════════════

-- Ensure an ACTIVE class exists for each scope cell at Year 1 and Year 2. Reuses any
-- existing active class for the tuple (ON CONFLICT DO NOTHING against the post-0018
-- partial-unique index); only missing ones are created. literacy defaults to 'mixed'.
insert into public.classes (school_id, subject_id, year)
select sc.school_id, sc.subject_id, y.year
from _scope sc
cross join (values (1), (2)) as y(year)
on conflict (school_id, subject_id, year) where archived_at is null do nothing;

-- Link teacher1 to those Y1 + Y2 classes so createTeacherPlan auto-binds and the
-- "You are not a member of this class" error disappears. coordinator1 is left
-- unlinked on purpose — it reviews, it does not teach.
insert into public.class_teachers (class_id, teacher_id)
select c.id, '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'
from public.classes c
join _scope sc on sc.school_id = c.school_id and sc.subject_id = c.subject_id
where c.archived_at is null
  and c.year in (1, 2)
on conflict (class_id, teacher_id) do nothing;

-- ══════════════════════════════════════════════════════════════════════════════
-- Exactly ONE active space per persona (default landing = English · Shatila)
-- ══════════════════════════════════════════════════════════════════════════════
-- The active subject space is subject_membership.is_primary (resolved by
-- resolveActiveMembership: is_primary wins, else English-first, else earliest). The
-- partial-unique uq_membership_primary allows at most one primary per profile. Clear
-- every primary, then set a single deterministic one (English·Shatila if the persona
-- holds it, else its earliest membership) — idempotent, and never two primaries.
-- Testers switch to the subject they are testing via the header space switcher.
do $$
declare
  v_persona uuid;
  v_pick    uuid;
begin
  foreach v_persona in array array[
    '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'::uuid,  -- teacher1
    'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'::uuid   -- coordinator1
  ]
  loop
    -- Clear all primaries for this persona first (so the set below can't collide
    -- with a stale primary on the one-primary-per-profile index).
    update public.subject_membership
       set is_primary = false
     where profile_id = v_persona
       and is_primary;

    -- Deterministic pick: prefer English · Shatila, else the earliest-created row.
    select id
      into v_pick
      from public.subject_membership
     where profile_id = v_persona
     order by (school_id = '42c11721-c16b-4221-a945-473c028278b7'
               and subject_id = 'a1812346-77ca-45c1-8a94-33260fbb8729') desc,
              created_at,
              id
     limit 1;

    if v_pick is not null then
      update public.subject_membership
         set is_primary = true
       where id = v_pick;
    end if;
  end loop;
end $$;

commit;

-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFY — run after applying. Two result sets.
-- ══════════════════════════════════════════════════════════════════════════════

-- (A) Per-persona coverage summary. With A active subjects and C testing centres,
-- expect for teacher1:     sm_teacher = A*C, sm_coordinator = 0, cs = 0,
--                          class_links = A*C*2, primary_rows = 1.
--            coordinator1: sm_coordinator = A*C, sm_teacher = 0, cs = A,
--                          class_links = 0, primary_rows = 1.
with personas (profile_id, persona) as (
  values
    ('4d8be40e-8479-47a3-8b48-0a1fd9955d8c'::uuid, 'teacher1'),
    ('a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'::uuid, 'coordinator1')
),
active_subjects as (select count(*) as n from public.subjects where archived_at is null),
testing_centres as (
  select count(*) as n from public.schools
  where id in ('42c11721-c16b-4221-a945-473c028278b7',
               'c87896b6-0f6d-4b20-bb32-1c31660645c1')
    and archived_at is null
)
select
  p.persona,
  (select n from active_subjects)                                    as active_subjects,
  (select n from testing_centres)                                    as testing_centres,
  (select count(*) from public.subject_membership sm
     where sm.profile_id = p.profile_id and sm.role = 'teacher')     as sm_teacher,
  (select count(*) from public.subject_membership sm
     where sm.profile_id = p.profile_id and sm.role = 'coordinator') as sm_coordinator,
  (select count(*) from public.coordinator_subject cs
     where cs.profile_id = p.profile_id)                             as cs_rows,
  (select count(*) from public.class_teachers ct
     where ct.teacher_id = p.profile_id)                             as class_links,
  (select count(*) from public.subject_membership sm
     where sm.profile_id = p.profile_id and sm.is_primary)           as primary_rows,
  (select count(distinct sm.subject_id) from public.subject_membership sm
     where sm.profile_id = p.profile_id)                             as distinct_subjects,
  (select count(distinct sm.school_id) from public.subject_membership sm
     where sm.profile_id = p.profile_id)                             as distinct_centres
from personas p
order by p.persona;

-- (B) Detailed subject × centre matrix per persona: the membership role held, whether
-- teacher1 has a Y1/Y2 class link there, and which cell is the active (is_primary)
-- space. Restricted to the testing centres for a readable grid.
with personas (profile_id, persona) as (
  values
    ('4d8be40e-8479-47a3-8b48-0a1fd9955d8c'::uuid, 'teacher1'),
    ('a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'::uuid, 'coordinator1')
)
select
  p.persona,
  subj.name                                                          as subject,
  sch.name                                                           as centre,
  sm.role                                                            as membership_role,
  sm.is_primary                                                      as active_space,
  (select count(*) from public.class_teachers ct
     join public.classes c on c.id = ct.class_id
    where ct.teacher_id = p.profile_id
      and c.school_id = sm.school_id
      and c.subject_id = sm.subject_id
      and c.archived_at is null)                                     as class_links
from personas p
join public.subject_membership sm on sm.profile_id = p.profile_id
join public.subjects subj on subj.id = sm.subject_id
join public.schools  sch  on sch.id = sm.school_id
where sm.school_id in ('42c11721-c16b-4221-a945-473c028278b7',
                       'c87896b6-0f6d-4b20-bb32-1c31660645c1')
order by p.persona, subj.name, sch.name;
