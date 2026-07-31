-- 0070_worksheet_writeback.sql
--
-- Resource-bank write-back: when a lesson plan is APPROVED, each of its
-- ready/edited worksheet exercises is upserted into `resources` as an
-- origin='ai_generated' row (idempotent on source_exercise_id), and tagged
-- format='Exercise' + exercise_type=<its type>. Phase 0 established that nothing
-- ran after a plan reached `approved`; this adds it.
--
-- PROVENANCE / HOW TO APPLY: authored only — applied by hand in the Supabase SQL
-- editor like 0010/0018/0019/0028/0048/0057/0058/0059/0067. The agent never
-- executes SQL. Committed idempotently (create or replace / drop … if exists /
-- create … if not exists) so the schema stays the locked source of truth in-repo
-- and a local `supabase db reset` reproduces it. Re-running is safe.
--
-- DEPENDS ON 0067 (worksheet_exercise + the resources body_md/origin/
-- source_exercise_id extensions and the resources_source_exercise_key unique
-- constraint that the upsert conflict-targets).
--
-- NOTES ON RESOLUTION (why we do NOT copy lesson_plans columns directly):
--   • lesson_plans.curriculum_lesson_id is a loose TEXT lesson_key (0003, no FK);
--     resources.curriculum_lesson_id is a curriculum_lesson UUID (0067). We resolve
--     the text lesson_key to the curriculum_lesson row and store its id (uuid).
--   • subject_id and year on lesson_plans are hand-applied and not represented
--     in-repo (see 0028 pre-flight), and may be null on class-scoped plans anyway.
--     We resolve subject + year the in-repo way — curriculum_lesson.subject_code
--     -> subjects.code, and curriculum_lesson.year — so the function depends only on
--     committed schema.
--   • lesson_key is VERSION-scoped unique (0059), so the curriculum_lesson lookup is
--     made deterministic: prefer the plan's pinned curriculum_version_id (0056),
--     newest as the tiebreak.

-- ── 1. write-back worker ──────────────────────────────────────────────────────
-- All logic lives here; both triggers below are thin callers. SECURITY DEFINER so
-- the bank write runs regardless of the approver's own RLS grants (auth.uid() is
-- still captured as uploaded_by). Belt-and-braces: the body re-checks the plan and
-- exercise status, so a caller that fires early is a silent no-op.

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
      auth.uid()
    )
    on conflict on constraint resources_source_exercise_key do update
      set title                = excluded.title,
          subject_id           = excluded.subject_id,
          year                 = excluded.year,
          body_md              = excluded.body_md,
          body_doc             = excluded.body_doc,
          origin               = excluded.origin,
          curriculum_lesson_id = excluded.curriculum_lesson_id,
          daily_outcome        = excluded.daily_outcome,
          image_slots          = excluded.image_slots,
          image_count          = excluded.image_count,
          generated_from       = excluded.generated_from
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

-- ── 2. Trigger A — a plan enters `approved` ───────────────────────────────────
-- Fires the worker for every ready/edited exercise on the plan. Covers the review
-- approval path and any UPDATE into `approved`.
--
-- The intended firing set is: INSERT of an approved row, OR an UPDATE whose status
-- newly becomes `approved`. That cannot be expressed in the WHEN clause of a single
-- INSERT-OR-UPDATE trigger — TG_OP is not available in WHEN, and OLD is not
-- referenceable for the INSERT case — so the WHEN gates only `new.status =
-- 'approved'` and the op/no-op-status discrimination lives in the function body
-- (where TG_OP and OLD are available). Semantics are identical.

create or replace function public.writeback_on_plan_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only act when the row is newly approved: on UPDATE, skip if status is unchanged
  -- (a plan already approved being edited must not re-fire on every save).
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return null;
  end if;

  perform public.writeback_worksheet_exercise(we.id)
     from public.worksheet_exercise we
    where we.lesson_plan_id = new.id
      and we.status in ('ready', 'edited');

  return null;
end;
$$;

drop trigger if exists writeback_on_plan_approved_trg on public.lesson_plans;
create trigger writeback_on_plan_approved_trg
  after insert or update on public.lesson_plans
  for each row
  when (new.status = 'approved')
  execute function public.writeback_on_plan_approved();

-- ── 3. Trigger B — an exercise becomes ready on an already-approved plan ───────
-- Born-approved coordinator plans (0058) are INSERTed already `approved` and never
-- transition, so Trigger A never re-fires for them; their exercises reach
-- ready/edited later. Trigger B covers that: it calls the worker for the changed
-- exercise, which itself no-ops unless the plan is approved.
--
-- WHEN references only NEW, valid for INSERT OR UPDATE. `of status` restricts the
-- UPDATE case to status changes; INSERT fires on all inserts, gated by WHEN.

create or replace function public.writeback_on_exercise_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.writeback_worksheet_exercise(new.id);
  return null;
end;
$$;

drop trigger if exists writeback_on_exercise_ready_trg on public.worksheet_exercise;
create trigger writeback_on_exercise_ready_trg
  after insert or update of status on public.worksheet_exercise
  for each row
  when (new.status in ('ready', 'edited'))
  execute function public.writeback_on_exercise_ready();
