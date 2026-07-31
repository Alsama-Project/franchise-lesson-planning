-- 0071_writeback_uploaded_by_fallback.sql
--
-- Amends public.writeback_worksheet_exercise (from 0070_worksheet_writeback.sql):
-- uploaded_by now falls back to the plan's author when auth.uid() is null.
--
-- WHY: auth.uid() is null outside a request context (e.g. a service-role or
-- background write). resources.uploaded_by is NOT NULL (0008), so a null there
-- fails the insert, which the function's own exception handler (2.5) turns into a
-- silent no-op — the exercise would never reach the bank. lesson_plans.created_by
-- (uuid NOT NULL references profiles, 0003) is always present, so it is the safe
-- fallback. Only the INSERT branch is affected; the DO UPDATE branch still leaves
-- uploaded_by untouched.
--
-- CREATE OR REPLACE only — the function body is otherwise identical to 0070. No
-- trigger changes, no schema changes, no application code.
--
-- PROVENANCE / HOW TO APPLY: authored only — applied by hand in the Supabase SQL
-- editor like 0067/0070. The agent never executes SQL. Committed idempotently so
-- the schema stays the locked source of truth in-repo. Re-running is safe.

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
      coalesce(auth.uid(), v_plan.created_by)              -- fall back to the plan author when auth.uid() is null
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
