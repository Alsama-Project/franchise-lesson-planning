-- seed_sample_plans.sql
-- ───────────────────────────────────────────────────────────────────────────
-- Demo data for the Weekly Overview. Inserts ~5 lesson_plans across the CURRENT
-- week (Mon–Fri) for a given teacher's assigned classes, with varied statuses
-- (in_progress, submitted, needs_review, approved) so both the Calendar and
-- Status views show real content before the editor exists.
--
-- Each plan starts from DEFAULT_BLOCKS (src/lib/blocks.ts) and points at a real
-- curriculum key chosen to match its class's year (leading id segment = year),
-- so the overview resolves a daily learning outcome + theme for every slot.
--
-- This is an ADMIN script: run it with the service-role connection (Supabase
-- SQL editor, or psql against the DB). It bypasses RLS. NEVER run it from a user
-- request or with the anon key.
--
-- Prerequisites:
--   1. The user has signed in once (handle_new_user created their profile).
--   2. They've been provisioned with classes — run assign_teacher.sql first.
--
-- ── Usage (psql) ───────────────────────────────────────────────────────────
--   By email:
--     psql "$DATABASE_URL" -v teacher_email="'teacher@example.org'" \
--       -f supabase/admin/seed_sample_plans.sql
--   By auth uid: comment the email resolver below, uncomment the uid one, then:
--     psql "$DATABASE_URL" -v teacher_uid="'00000000-0000-0000-0000-000000000000'" \
--       -f supabase/admin/seed_sample_plans.sql
--
-- ── Usage (Supabase SQL editor; no -v support) ─────────────────────────────
--   Replace :'teacher_email' below with a literal 'teacher@example.org' and run.
--
-- Idempotent: a plan already exists per (class_id, lesson_date), so re-running
-- inserts nothing new and never clobbers real plans (ON CONFLICT DO NOTHING).
-- ───────────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP on

begin;

-- Resolve the target teacher. Default: by auth email.
create temporary table _target on commit drop as
select p.id as teacher_id
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower(:'teacher_email');
--  where p.id = :'teacher_uid';

-- Fail loudly if the user hasn't signed in yet (no profile row).
do $$
begin
  if (select count(*) from _target) = 0 then
    raise exception 'No profile matched — has the user signed in at least once?';
  end if;
end $$;

-- Fail loudly if the teacher has no classes yet (run assign_teacher.sql first).
do $$
declare n int;
begin
  select count(*) into n
  from public.class_teachers ct
  join _target t on t.teacher_id = ct.teacher_id;
  if n = 0 then
    raise exception
      'Teacher has no assigned classes — run supabase/admin/assign_teacher.sql first.';
  end if;
end $$;

-- Build the plans:
--   * ranked    — the teacher's assigned classes, numbered by (year, group).
--   * curriculum_keys — two year-appropriate curriculum ids per seeded year.
--   * templates — which (weekday, status, key) plans to create per class rank,
--                 chosen so all four stored statuses appear even with one class.
with monday as (
  -- Postgres weeks start on Monday; truncating gives this week's Monday.
  select date_trunc('week', current_date)::date as d
),
ranked as (
  select c.id as class_id,
         c.year,
         row_number() over (order by c.year, c.group_label) as rn
  from public.classes c
  join public.class_teachers ct on ct.class_id = c.id
  join _target t on t.teacher_id = ct.teacher_id
),
curriculum_keys (year, idx, curriculum_lesson_id) as (
  values
    (1, 0, '1.S0.K1.H4'),  -- Food and Drink
    (1, 1, '1.S0.K7.H1'),  -- Adjectives and Adverbs
    (2, 0, '2.S1.K0.H5'),  -- Places (town and city)
    (2, 1, '2.S1.K0.H7'),  -- Education
    (3, 0, '3.S0.K0.H1'),  -- Countryside
    (3, 1, '3.S0.K1.H0')   -- Review
),
templates (rn, day_offset, period, status, key_idx, review_note) as (
  values
    -- First class: all four statuses, Mon–Thu.
    (1, 0, 1, 'approved',     0, null),
    (1, 1, 2, 'in_progress',  1, null),
    (1, 2, 3, 'submitted',    0, null),
    (1, 3, 4, 'needs_review', 1, 'Add a measurable verb to the objective.'),
    -- Second class (if assigned): two more, to fill out the week.
    (2, 0, 1, 'approved',     0, null),
    (2, 2, 3, 'in_progress',  1, null)
)
insert into public.lesson_plans
  (class_id, curriculum_lesson_id, lesson_date, period, status,
   smartt_objective, blocks, created_by,
   submitted_at, reviewed_at, review_note)
select
  r.class_id,
  coalesce(k.curriculum_lesson_id, '1.S0.K1.H4'),
  m.d + tpl.day_offset,
  tpl.period,
  tpl.status::public.plan_status,
  null,
  '[{"type":"anthem","title":"Alsama Anthem","activity_title":"","activity_ref":null,"teacher_does":"","students_do":"","resources":"","phase":"we_do","duration_minutes":1},{"type":"warm_up","title":"Warm-up","activity_title":"","activity_ref":null,"teacher_does":"","students_do":"","resources":"","phase":"we_do","duration_minutes":1},{"type":"cool_down","title":"Cool down","activity_title":"","activity_ref":null,"teacher_does":"","students_do":"","resources":"","phase":"we_do","duration_minutes":1},{"type":"check_homework","title":"Check homework","activity_title":"","activity_ref":null,"teacher_does":"","students_do":"","resources":"","phase":null,"duration_minutes":2},{"type":"recap","title":"Recap","activity_title":"","activity_ref":null,"teacher_does":"","students_do":"","resources":"","phase":null,"duration_minutes":5},{"type":"new_content","title":"New Content / Skill","activity_title":"","activity_ref":null,"teacher_does":"","students_do":"","resources":"","phase":"i_do","duration_minutes":10},{"type":"cfu","title":"Check for Understanding","activity_title":"","activity_ref":null,"teacher_does":"","students_do":"","resources":"","phase":null,"duration_minutes":5},{"type":"independent_practice","title":"Independent or Group Practice","activity_title":"","activity_ref":null,"teacher_does":"","students_do":"","resources":"","phase":"you_do","duration_minutes":20},{"type":"exit_ticket","title":"Exit Ticket","activity_title":"","activity_ref":null,"teacher_does":"","students_do":"","resources":"","phase":null,"duration_minutes":5},{"type":"homework","title":"Homework","activity_title":"","activity_ref":null,"teacher_does":"","students_do":"","resources":"","phase":null,"duration_minutes":0}]'::jsonb,
  t.teacher_id,
  case when tpl.status in ('submitted', 'needs_review', 'approved') then now() end,
  case when tpl.status in ('needs_review', 'approved') then now() end,
  tpl.review_note
from ranked r
join templates tpl on tpl.rn = r.rn
cross join monday m
cross join _target t
left join curriculum_keys k on k.year = r.year and k.idx = tpl.key_idx
on conflict (class_id, lesson_date) do nothing;

commit;
