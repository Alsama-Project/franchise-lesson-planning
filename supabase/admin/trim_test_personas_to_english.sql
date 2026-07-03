-- trim_test_personas_to_english.sql
--
-- Scope the two CANONICAL impersonation personas to a SINGLE subject-space:
-- **Shatila 1 · English**. The account chip's space switcher renders one row per
-- `subject_membership` row (see getSpaceSwitcher / getMyMembershipsFull in
-- src/lib/active-space.ts), so a persona that belongs to eight spaces shows eight
-- switcher entries. Trimming each persona to exactly one membership collapses the
-- switcher to a single entry.
--
-- This is a DATA fix only. It touches NOTHING else: not the impersonation engine,
-- the Teacher/Coordinator toggle, the banner, resolve_impersonation_persona, or the
-- impersonation_canonical designation table. No schema change. is_test_persona,
-- can_impersonate, and profiles.role are left exactly as they are.
--
-- Runs with the SERVICE-ROLE connection (Supabase SQL editor or psql) and bypasses
-- RLS — NEVER from a user request. Idempotent: re-running leaves each persona at
-- exactly one membership row. Guarded: every write is bound to the two literal test
-- uids below and can never touch any other user's memberships.
--
-- ── The two (and ONLY two) canonical personas ────────────────────────────────
--   teacher1     = 4d8be40e-8479-47a3-8b48-0a1fd9955d8c  (profiles.role 'teacher')
--   coordinator1 = a4e79fa9-2231-4fd2-81a8-d7754d4cdb33  (profiles.role 'coordinator')
--
-- ── Target space (RESOLVED, not guessed) ─────────────────────────────────────
--   Shatila 1 school = 42c11721-c16b-4221-a945-473c028278b7  (id preserved by the
--                      Shatila Centre → 'Shatila 1' rename; PART A verifies the name).
--   English subject  = resolved at run time by the stable unique key subjects.code
--                      = 'english' (the key seed.sql / seed_test_personas.sql use).
--                      PART A + the PART C guard STOP if it does not resolve to
--                      exactly one row. (Live id, for cross-check only, is
--                      a1812346-77ca-45c1-8a94-33260fbb8729 — the script never
--                      hardcodes it; it resolves by code.)
--
-- SCHEMA BINDINGS (verified against supabase/migrations, not assumed):
--   • subject_membership(profile_id, school_id, subject_id, role membership_role,
--       is_primary boolean) — UNIQUE (profile_id, school_id, subject_id) (0012);
--       is_primary added 0042, partial-unique (profile_id) where is_primary.
--   • membership_role enum = ('teacher','coordinator') (0012).
--   • subjects(id, name, code text NOT NULL UNIQUE) (0002); schools(id, name) (0002).
--
-- HOW TO APPLY (three parts, in order):
--   PART A — run the SELECT; confirm Shatila 1 resolves and English resolves to
--            exactly one subject. STOP if either is wrong.
--   PART B — run the SELECT; eyeball exactly which membership rows will be removed
--            for each persona, and confirm the counts.
--   PART C — run the transaction; it re-asserts A's guards, trims, and prints the
--            final state (one row per persona).


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
-- PART B — PREVIEW: current memberships for the two personas  (read-only)
-- ═══════════════════════════════════════════════════════════════════════════════
-- One row per existing subject_membership for teacher1 / coordinator1, with centre
-- + subject names + role. This is exactly what PART C will reduce to one row each.
-- Everything here that is NOT (Shatila 1 · English) will be deleted.
select
  case sm.profile_id
    when '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'::uuid then 'teacher1'
    when 'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'::uuid then 'coordinator1'
  end                       as persona,
  sm.profile_id,
  s.name                    as school_name,
  subj.name                 as subject_name,
  subj.code                 as subject_code,
  sm.role,
  sm.is_primary
from public.subject_membership sm
join public.schools  s    on s.id    = sm.school_id
join public.subjects subj on subj.id = sm.subject_id
where sm.profile_id in (
  '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'::uuid,
  'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'::uuid
)
order by persona, s.name, subj.name;


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART C — THE WRITES  (ONE transaction; run only after A + B look right)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Re-resolves + asserts the target space (so PART C is self-guarding even if run
-- alone), then for EACH of the two literal uids: deletes every membership that is
-- not the target space, and upserts the target row at the correct role and as the
-- persona's primary space. Any assert failure or unexpected FK rolls the whole
-- thing back — nothing partial.

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

  -- ── teacher1: keep ONLY (Shatila 1, English, teacher) ──────────────────────
  -- Delete every OTHER membership for this exact uid.
  delete from public.subject_membership
  where profile_id = k_teacher1
    and not (school_id = k_school and subject_id = v_subject);

  -- Upsert the target row at role 'teacher', marked primary. on-conflict-update
  -- self-heals a pre-existing target row that had the wrong role/primary flag, so
  -- the end state is exactly (Shatila 1, English, teacher, primary) — fully idempotent.
  insert into public.subject_membership (profile_id, school_id, subject_id, role, is_primary)
  values (k_teacher1, k_school, v_subject, 'teacher'::public.membership_role, true)
  on conflict (profile_id, school_id, subject_id)
    do update set role = 'teacher'::public.membership_role, is_primary = true;

  -- ── coordinator1: keep ONLY (Shatila 1, English, coordinator) ──────────────
  -- Deletes any wrong-space coordinator membership that 0039's non-deterministic
  -- limit-1 may have created, leaving the coordinator deterministically in English.
  delete from public.subject_membership
  where profile_id = k_coordinator1
    and not (school_id = k_school and subject_id = v_subject);

  insert into public.subject_membership (profile_id, school_id, subject_id, role, is_primary)
  values (k_coordinator1, k_school, v_subject, 'coordinator'::public.membership_role, true)
  on conflict (profile_id, school_id, subject_id)
    do update set role = 'coordinator'::public.membership_role, is_primary = true;
end $$;

-- Post-write verification: MUST return exactly one row per persona,
-- teacher1 → (Shatila 1, English, teacher) and coordinator1 → (…, coordinator).
select
  case sm.profile_id
    when '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'::uuid then 'teacher1'
    when 'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'::uuid then 'coordinator1'
  end                       as persona,
  s.name                    as school_name,
  subj.name                 as subject_name,
  subj.code                 as subject_code,
  sm.role,
  sm.is_primary
from public.subject_membership sm
join public.schools  s    on s.id    = sm.school_id
join public.subjects subj on subj.id = sm.subject_id
where sm.profile_id in (
  '4d8be40e-8479-47a3-8b48-0a1fd9955d8c'::uuid,
  'a4e79fa9-2231-4fd2-81a8-d7754d4cdb33'::uuid
)
order by persona;

-- Inspect the two SELECT outputs. If correct:  COMMIT;   otherwise:  ROLLBACK;
commit;
