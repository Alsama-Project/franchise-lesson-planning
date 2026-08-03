-- 20260803093431_writeback_curriculum_lesson_key_and_trigger_dedupe.sql
--
-- Write-back follow-up. Three parts + two housekeeping items:
--   Part 1 — add resources.curriculum_lesson_key (stable TEXT key) + partial index
--            + one-time backfill from curriculum_lesson.
--   Part 2 — drop the untracked duplicate approval trigger, and split the
--            plan-approved write-back trigger so it fires only on the transition
--            INTO approved.
--   Part 3 — CREATE OR REPLACE writeback_worksheet_exercise to also persist
--            curriculum_lesson_key. Built on the LIVE definition
--            (0071_writeback_uploaded_by_fallback.sql); the uploaded_by null
--            fallback is preserved.
--
-- NUMBERING: timestamp-named (YYYYMMDDHHMMSS) rather than a sequential integer —
-- parallel sessions assign the same next integer and collide (nine prefixes in this
-- repo already have duplicates).
--
-- PROVENANCE / HOW TO APPLY: authored only — applied by hand in the Supabase SQL
-- editor. The agent never executes SQL. Committed idempotently so the schema stays
-- the locked source of truth in-repo. Re-running is safe.
--
-- DEPENDS ON 0067 (worksheet_exercise + resources extensions) and 0070/0071
-- (writeback_worksheet_exercise + its triggers).

-- ── Part 1. resources.curriculum_lesson_key ───────────────────────────────────
-- lesson_plans.curriculum_lesson_id holds a TEXT lesson_key; resources.curriculum_
-- lesson_id holds the curriculum_lesson UUID with ON DELETE SET NULL. A curriculum
-- re-ingest that REPLACES rows (rather than upserting) nulls that FK and kills rung
-- 1 of the reuse match ladder. Denormalising the stable text key onto resources
-- survives such a re-ingest — the same reasoning that already put daily_outcome on
-- the table. Nullable; not part of any one-source/scoped constraint.

alter table public.resources
  add column if not exists curriculum_lesson_key text;

create index if not exists resources_curriculum_lesson_key_idx
  on public.resources (curriculum_lesson_key)
  where curriculum_lesson_key is not null;

-- Backfill existing rows from the joined curriculum_lesson, only where the new
-- column is still null and the UUID FK is present. Idempotent (touches null rows
-- only).
update public.resources r
   set curriculum_lesson_key = cl.lesson_key
  from public.curriculum_lesson cl
 where r.curriculum_lesson_id = cl.id
   and r.curriculum_lesson_key is null
   and r.curriculum_lesson_id is not null;

-- ── Part 2. approval-trigger housekeeping ─────────────────────────────────────

-- 2a. Drop the untracked DUPLICATE of the approval-role guard. The live
-- lesson_plans table carries BOTH enforce_approval_role AND
-- trg_enforce_approval_role — same function (public.enforce_approval_role()), same
-- BEFORE UPDATE event — so the guard runs twice. `enforce_approval_role` is the
-- name every committed migration owns and re-asserts (created in 0012, recreated
-- idempotently in 0019), so it is kept; `trg_enforce_approval_role` appears in NO
-- migration (hand-applied only) and is the one dropped. enforce_insert_approval_role
-- (0058, the born-approved INSERT guard) is a different trigger and is untouched.
drop trigger if exists trg_enforce_approval_role on public.lesson_plans;

-- 2b. Split the plan-approved write-back trigger. The single combined trigger fires
-- on EVERY update to an approved plan (its WHEN is only new.status = 'approved');
-- only the function's internal guard stops the re-fire. TG_OP is not legal in a
-- WHEN clause, so the transition test cannot live there in a combined trigger —
-- split into an INSERT trigger and an UPDATE trigger whose WHEN carries the
-- status-change test. Both call the EXISTING writeback_on_plan_approved() unchanged
-- (its internal guard is now redundant but harmless). Enum comparison uses the same
-- plain-literal style as the live trigger (no ::plan_status cast).
drop trigger if exists writeback_on_plan_approved_trg on public.lesson_plans;

create trigger writeback_on_plan_approved_ins_trg
  after insert on public.lesson_plans
  for each row
  when (new.status = 'approved')
  execute function public.writeback_on_plan_approved();

create trigger writeback_on_plan_approved_upd_trg
  after update on public.lesson_plans
  for each row
  when (new.status = 'approved' and old.status is distinct from new.status)
  execute function public.writeback_on_plan_approved();

-- ── Part 3. CREATE OR REPLACE writeback_worksheet_exercise ─────────────────────
-- Verbatim reproduction of the LIVE definition (0071_writeback_uploaded_by_fallback
-- .sql) with exactly three changes, all for curriculum_lesson_key:
--   a) added to the INSERT column list
--   b) v_plan.curriculum_lesson_id inserted as its value (the stable text key)
--   c) curriculum_lesson_key = excluded.curriculum_lesson_key added to DO UPDATE
-- Everything else — signature, security definer, search_path, subject/year
-- resolution, the warning-and-return guard, the uploaded_by fallback, the exception
-- handler, the tag lookups and their ordering — is unchanged.

create or replace function public.writeback_worksheet_exercise(p_exercise_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ex             public.worksheet_exercise%rowtype;
  v_plan           public.lesson_plans%rowtype;
  v_cl_id          uuid;
  v_subject_code   text;
  v_subject_id     uuid;
  v_year           int;
  v_daily_outcome  text;
  v_resource_id    uuid;
  v_format_tag     uuid;
  v_type_tag       uuid;
begin
  -- 2.1 Load the exercise and its plan; gate on status. Return silently unless the
  -- plan is approved AND the exercise is ready/edited.
  select * into v_ex from public.worksheet_exercise where id = p_exercise_id;
  if not found then
    return;
  end if;

  select * into v_plan from public.lesson_plans where id = v_ex.lesson_plan_id;
  if not found then
    return;
  end if;

  if v_plan.status <> 'approved' or v_ex.status not in ('ready', 'edited') then
    return;
  end if;

  -- 2.2 Resolve subject_id + year (and the curriculum_lesson UUID + daily_outcome)
  -- from (lesson_plans -> curriculum_lesson -> subjects). Deterministic pick over
  -- the version-scoped lesson_key: prefer the plan's pinned version, newest first.
  select cl.id, cl.subject_code, cl.year, cl.daily_outcome
    into v_cl_id, v_subject_code, v_year, v_daily_outcome
    from public.curriculum_lesson cl
   where cl.lesson_key = v_plan.curriculum_lesson_id
   order by (cl.curriculum_version_id is not distinct from v_plan.curriculum_version_id) desc,
            cl.created_at desc,
            cl.id desc
   limit 1;

  if v_subject_code is not null then
    select s.id into v_subject_id
      from public.subjects s
     where s.code = v_subject_code;
  end if;

  -- resources_ai_scoped (0067) requires subject_id AND year non-null for an
  -- ai_generated row. If either is unresolved, warn and RETURN — never let the bank
  -- write become the error path that hits resources_ai_scoped.
  if v_subject_id is null or v_year is null then
    raise warning 'writeback: unresolved subject/year for exercise %', p_exercise_id;
    return;
  end if;

  -- 2.5 The bank write must never fail approval: any error below is downgraded to a
  -- warning. Wraps the upsert (2.3) and the tag links (2.4).
  begin
    -- 2.3 Upsert into resources on the source_exercise_id idempotency key
    -- (resources_source_exercise_key, 0067 — the ONLY valid arbiter here; the
    -- worksheet_exercise (lesson_plan_id, position) unique is DEFERRABLE and must
    -- never be used as one). file_path/external_url stay null — body_md is the
    -- source under the relaxed resources_one_source. On the DO UPDATE branch,
    -- uploaded_by and created_at are deliberately left untouched.
    insert into public.resources as r (
      title,
      subject_id,
      year,
      body_md,
      body_doc,
      origin,
      curriculum_lesson_id,
      curriculum_lesson_key,
      daily_outcome,
      image_slots,
      image_count,
      source_exercise_id,
      generated_from,
      uploaded_by
    )
    values (
      coalesce(nullif(btrim(v_ex.title), ''), v_ex.exercise_type, 'Untitled exercise'),
      v_subject_id,
      v_year,
      v_ex.body_md,
      v_ex.body_doc,
      'ai_generated',                                      -- set explicitly, not via the derive trigger
      v_cl_id,
      v_plan.curriculum_lesson_id,                         -- stable TEXT lesson_key, survives a curriculum re-ingest
      v_daily_outcome,                                     -- denormalised from curriculum_lesson
      v_ex.image_slots,
      coalesce(jsonb_array_length(v_ex.image_slots), 0),
      v_ex.id,
      jsonb_build_object(
        'model',          v_ex.generation -> 'model',
        'docs_used',      v_ex.generation -> 'docs_used',
        'prompt_hash',    v_ex.generation -> 'prompt_hash',
        'spec',           v_ex.generation -> 'spec',
        'lesson_plan_id', v_plan.id
      ),
      coalesce(auth.uid(), v_plan.created_by)              -- fall back to the plan author when auth.uid() is null
    )
    on conflict on constraint resources_source_exercise_key do update
      set title                 = excluded.title,
          subject_id            = excluded.subject_id,
          year                  = excluded.year,
          body_md               = excluded.body_md,
          body_doc              = excluded.body_doc,
          origin                = excluded.origin,
          curriculum_lesson_id  = excluded.curriculum_lesson_id,
          curriculum_lesson_key = excluded.curriculum_lesson_key,
          daily_outcome         = excluded.daily_outcome,
          image_slots           = excluded.image_slots,
          image_count           = excluded.image_count,
          generated_from        = excluded.generated_from
          -- uploaded_by and created_at intentionally NOT overwritten (2.3).
    returning r.id into v_resource_id;

    -- 2.4 Tag links (after the upsert). Never delete existing links — coordinators
    -- curate this vocabulary by hand and a re-approval must not strip their work.
    -- The (dimension, label, subject_id) unique is NULLS DISTINCT, so duplicate
    -- global rows are possible; the lookup is made deterministic (order by
    -- created_at, id) and takes the first. A label that does not resolve is warned
    -- and skipped — a miss means a type outside the seeded vocabulary, and it should
    -- be visible.

    -- format = 'Exercise' (global; seeded in 0067)
    select rt.id into v_format_tag
      from public.resource_tags rt
     where rt.dimension = 'format'
       and rt.label = 'Exercise'
       and rt.subject_id is null
     order by rt.created_at, rt.id
     limit 1;
    if v_format_tag is null then
      raise warning 'writeback: tag not found dimension=% label=%', 'format', 'Exercise';
    else
      insert into public.resource_tag_links (resource_id, tag_id)
      values (v_resource_id, v_format_tag)
      on conflict do nothing;
    end if;

    -- exercise_type = the exercise's own exercise_type (global; ten labels seeded in 0008)
    select rt.id into v_type_tag
      from public.resource_tags rt
     where rt.dimension = 'exercise_type'
       and rt.label = v_ex.exercise_type
       and rt.subject_id is null
     order by rt.created_at, rt.id
     limit 1;
    if v_type_tag is null then
      raise warning 'writeback: tag not found dimension=% label=%', 'exercise_type', v_ex.exercise_type;
    else
      insert into public.resource_tag_links (resource_id, tag_id)
      values (v_resource_id, v_type_tag)
      on conflict do nothing;
    end if;

  exception
    when others then
      raise warning 'writeback: bank write failed for exercise %: %', p_exercise_id, sqlerrm;
  end;
end;
$$;

-- ── Ledger ─────────────────────────────────────────────────────────────────────
-- applied_migration is a hand-maintained record of what has been applied through
-- the SQL editor (lives in the live DB; a separate branch lands it in-repo).
insert into applied_migration (filename, note)
values ('20260803093431_writeback_curriculum_lesson_key_and_trigger_dedupe.sql', null)
on conflict (filename) do nothing;
