-- trim_test_personas_to_english.sql
--
-- Converge the two CANONICAL impersonation personas onto a SINGLE subject-space,
-- **Shatila 1 · English**, ACROSS BOTH coordinator models — because the app is
-- half-migrated (see the ⚠️ note below). Two effects:
--
--   1. The account chip's space switcher renders one row per `subject_membership`
--      row (getSpaceSwitcher / getMyMembershipsFull in src/lib/active-space.ts), so
--      a persona in eight spaces shows eight switcher entries. Trimming each persona
--      to one membership collapses the switcher to a single entry.
--   2. coordinator1 must actually be a coordinator under BOTH representations so the
--      impersonated coordinator both renders coordinator CHROME and holds coordinator
--      POWER (see ⚠️).
--
-- ⚠️ WHY THIS SCRIPT WRITES TWO TABLES (the half-migrated model) ───────────────
-- Migrations 0040/0041 ("Role-first access model") moved coordinator-ness OUT of
-- `subject_membership.role='coordinator'` and INTO the school-agnostic table
-- `coordinator_subject(profile_id, subject_id)`. After 0041:
--   • coordinator POWER (the setPlanStatus approval gate + RLS enforce_approval_role
--     / is_member_of_subject) reads ONLY `coordinator_subject`; and
--   • 0041 DELETES every `subject_membership` row with role='coordinator'.
-- BUT the app's coordinator CHROME was only half-migrated — four client reads still
-- key off the OLD `subject_membership.role='coordinator'`:
--     - src/lib/weekly-overview.ts   (board `isCoordinator` / coordinatorSpaces)
--     - src/lib/notifications.ts     (review bell)
--     - src/lib/console.ts           (settings console)
--     - src/components/app-shell/UserMenu.tsx (switcher role label)
-- Migrating those four reads to `coordinator_subject` is a SEPARATE task (the real
-- fix). Until then, coordinator1 needs a row in BOTH tables:
--     • subject_membership(Shatila 1, English, coordinator)  → chrome (old model)
--     • coordinator_subject(English)                         → power (new model)
-- The subject_membership coordinator row is old-model chrome and is FRAGILE: any
-- re-run of 0041 deletes it. THEREFORE APPLY THIS SCRIPT LAST — after all pending
-- migrations through 0042. This script SUPERSEDES 0039 A3 for coordinator1 (0039 A3
-- used a non-deterministic `limit 1` to pick the space and inserted a now-transient
-- subject_membership coordinator row); the convergent writes here are the source of
-- truth for the persona.
--
-- This is a DATA fix only. It touches NOTHING else: not the impersonation engine,
-- the Teacher/Coordinator toggle, the banner, resolve_impersonation_persona, or the
-- impersonation_canonical designation table. No schema change (no enum/constraint/
-- table-shape change). is_test_persona, can_impersonate, and profiles.role are left
-- exactly as they are. The four half-migrated client reads are NOT touched here.
--
-- Runs with the SERVICE-ROLE connection (Supabase SQL editor or psql) and bypasses
-- RLS — NEVER from a user request. Idempotent: re-running leaves both personas at
-- exactly the end-state below. Guarded: every write is bound to the two literal test
-- uids below and can never touch any other user's rows in either table.
--
-- ── The two (and ONLY two) canonical personas ────────────────────────────────
--   teacher1     = 4d8be40e-8479-47a3-8b48-0a1fd9955d8c  (profiles.role 'teacher')
--   coordinator1 = a4e79fa9-2231-4fd2-81a8-d7754d4cdb33  (profiles.role 'coordinator')
--
-- ── End-state this script converges to ───────────────────────────────────────
--   teacher1:      subject_membership = exactly (Shatila 1, English, teacher);
--                  coordinator_subject = ZERO rows.
--   coordinator1:  subject_membership = exactly (Shatila 1, English, coordinator);
--                  coordinator_subject = exactly ONE row (English).
--
-- ── Target space (RESOLVED, not guessed) ─────────────────────────────────────
--   Shatila 1 school = 42c11721-c16b-4221-a945-473c028278b7  (id preserved by the
--                      Shatila Centre → 'Shatila 1' rename; PART A verifies the name).
--   English subject  = resolved at run time by the stable unique key subjects.code
--                      = 'english'. PART A + the PART C guard STOP if it does not
--                      resolve to exactly one row. (Live id, cross-check only, is
--                      a1812346-77ca-45c1-8a94-33260fbb8729 — never hardcoded here.)
--
-- SCHEMA BINDINGS (verified against supabase/migrations, not assumed):
--   • subject_membership(profile_id, school_id, subject_id, role membership_role,
--       is_primary boolean) — UNIQUE (profile_id, school_id, subject_id) (0012);
--       is_primary + partial-unique(profile_id) where is_primary (0042).
--   • coordinator_subject(profile_id, subject_id, created_at) — PRIMARY KEY
--       (profile_id, subject_id), school-agnostic, no role column (0040).
--   • membership_role enum = ('teacher','coordinator') (0012) — 'coordinator' is
--       still a valid, insertable value (no migration drops it; service-role bypasses
--       the teacher-only sm_self_join RLS check).
--   • subjects(id, name, code text NOT NULL UNIQUE) (0002); schools(id, name) (0002).
--
-- HOW TO APPLY (three parts, in order; PART C LAST, after migrations through 0042):
--   PART A — verify Shatila 1 + resolve English (STOP if either is wrong).
--   PART B — preview BOTH tables' current rows for BOTH personas (eyeball counts).
--   PART C — the transaction: re-asserts A's guards, converges both tables, prints
--            the final both-tables state.


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART A — RESOLVE & VERIFY THE TARGET SPACE  (read-only; run first)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Expect ONE school row named like 'Shatila 1' at the pinned id, and EXACTLY ONE
-- English subject. If the school name is not a Shatila centre, or English resolves
-- to zero / more than one row, STOP — do not run PART C.

-- A1. The pinned Shatila 1 school (verify the rename landed on this id).
select 'school' as kind, id, name
from public.schools
where id = '42c11721-c16b-4221-a945-473c028278b7'::uuid;

-- A2. The English subject, resolved by the stable unique key subjects.code.
--     Row count MUST be 1.
select 'subject' as kind, id, name, code
from public.subjects
where lower(code) = 'english';


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART B — PREVIEW: current rows for the two personas, BOTH tables  (read-only)
-- ═══════════════════════════════════════════════════════════════════════════════
-- B1 — subject_membership (chrome / switcher). Everything not (Shatila 1 · English)
--      will be deleted; the target row is upserted at the persona's correct role.
select
  'subject_membership'      as source,
  case sm.profile_id
    when '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'::uuid then 'teacher1'
    when 'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'::uuid then 'coordinator1'
  end                       as persona,
  sm.profile_id,
  s.name                    as school_name,
  subj.name                 as subject_name,
  subj.code                 as subject_code,
  sm.role::text             as role,
  sm.is_primary
from public.subject_membership sm
join public.schools  s    on s.id    = sm.school_id
join public.subjects subj on subj.id = sm.subject_id
where sm.profile_id in (
  '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'::uuid,
  'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'::uuid
)
order by persona, s.name, subj.name;

-- B2 — coordinator_subject (power). School-agnostic (subject only). For coordinator1
--      every row whose subject ≠ English is deleted and the English row upserted; for
--      teacher1 every row is deleted (a teacher persona coordinates nothing).
select
  'coordinator_subject'     as source,
  case cs.profile_id
    when '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'::uuid then 'teacher1'
    when 'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'::uuid then 'coordinator1'
  end                       as persona,
  cs.profile_id,
  subj.name                 as subject_name,
  subj.code                 as subject_code
from public.coordinator_subject cs
join public.subjects subj on subj.id = cs.subject_id
where cs.profile_id in (
  '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'::uuid,
  'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'::uuid
)
order by persona, subj.name;


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART C — THE WRITES  (ONE transaction; run LAST, after A + B look right)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Re-resolves + asserts the target space (self-guarding even if run alone), then
-- converges BOTH tables for the two literal uids only. Any assert failure or
-- unexpected FK rolls the whole thing back — nothing partial.

begin;

do $$
declare
  k_teacher1     constant uuid := '4d8be40e-8479-47a3-8b48-0a1fd9955d8c';
  k_coordinator1 constant uuid := 'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33';
  k_school       constant uuid := '42c11721-c16b-4221-a945-473c028278b7';  -- Shatila 1
  v_school_name  text;
  v_subject      uuid;
  v_subject_n    int;
begin
  -- Guard 1: the pinned school id must still resolve to a Shatila centre.
  select name into v_school_name from public.schools where id = k_school;
  if v_school_name is null then
    raise exception '[trim] Shatila 1 school % not found — STOP.', k_school;
  end if;
  if v_school_name not ilike 'shatila%' then
    raise exception '[trim] school % is named %, not a Shatila centre — STOP.',
      k_school, v_school_name;
  end if;

  -- Guard 2: English must resolve by stable key to EXACTLY one subject.
  select count(*) into v_subject_n from public.subjects where lower(code) = 'english';
  if v_subject_n <> 1 then
    raise exception '[trim] English subject resolved to % rows (expected 1) — STOP.',
      v_subject_n;
  end if;
  select id into v_subject from public.subjects where lower(code) = 'english';

  raise notice '[trim] target space = (% / %) English subject %',
    k_school, v_school_name, v_subject;

  -- ── teacher1 ────────────────────────────────────────────────────────────────
  -- subject_membership: keep ONLY (Shatila 1, English, teacher).
  delete from public.subject_membership
  where profile_id = k_teacher1
    and not (school_id = k_school and subject_id = v_subject);

  insert into public.subject_membership (profile_id, school_id, subject_id, role, is_primary)
  values (k_teacher1, k_school, v_subject, 'teacher'::public.membership_role, true)
  on conflict (profile_id, school_id, subject_id)
    do update set role = 'teacher'::public.membership_role, is_primary = true;

  -- coordinator_subject: a teacher persona coordinates NOTHING — ensure zero rows.
  delete from public.coordinator_subject where profile_id = k_teacher1;

  -- ── coordinator1 ────────────────────────────────────────────────────────────
  -- subject_membership: keep ONLY (Shatila 1, English, coordinator) — CHROME.
  delete from public.subject_membership
  where profile_id = k_coordinator1
    and not (school_id = k_school and subject_id = v_subject);

  insert into public.subject_membership (profile_id, school_id, subject_id, role, is_primary)
  values (k_coordinator1, k_school, v_subject, 'coordinator'::public.membership_role, true)
  on conflict (profile_id, school_id, subject_id)
    do update set role = 'coordinator'::public.membership_role, is_primary = true;

  -- coordinator_subject: keep ONLY (coordinator1, English) — POWER. Deletes any
  -- wrong-subject row 0039 A3's non-deterministic limit-1 may have seeded.
  delete from public.coordinator_subject
  where profile_id = k_coordinator1
    and subject_id <> v_subject;

  insert into public.coordinator_subject (profile_id, subject_id)
  values (k_coordinator1, v_subject)
  on conflict (profile_id, subject_id) do nothing;
end $$;

-- Post-write verification across BOTH tables. MUST return:
--   coordinator1 → subject_membership(Shatila 1, English, coordinator)
--                + coordinator_subject(English)
--   teacher1     → subject_membership(Shatila 1, English, teacher)
--                + (no coordinator_subject row)
select
  'subject_membership' as source,
  case sm.profile_id
    when '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'::uuid then 'teacher1'
    when 'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'::uuid then 'coordinator1'
  end                       as persona,
  s.name                    as school_name,
  subj.name                 as subject_name,
  sm.role::text             as role,
  sm.is_primary
from public.subject_membership sm
join public.schools  s    on s.id    = sm.school_id
join public.subjects subj on subj.id = sm.subject_id
where sm.profile_id in (
  '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'::uuid,
  'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'::uuid
)
union all
select
  'coordinator_subject' as source,
  case cs.profile_id
    when '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'::uuid then 'teacher1'
    when 'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'::uuid then 'coordinator1'
  end                       as persona,
  null                      as school_name,
  subj.name                 as subject_name,
  'coordinator'             as role,
  null                      as is_primary
from public.coordinator_subject cs
join public.subjects subj on subj.id = cs.subject_id
where cs.profile_id in (
  '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'::uuid,
  'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'::uuid
)
order by persona, source;

-- Inspect the output. If correct:  COMMIT;   otherwise:  ROLLBACK;
commit;
