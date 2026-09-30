-- 20261001100000_plan_write_helper.sql
--
-- One shared rule for writing to a lesson plan and everything hanging off it, and
-- where a plan may be filed.
--
-- 1. can_write_plan(plan): the plan's author, a coordinator of the plan's subject, or
--    an admin (and not deactivated). The same rule lp_update (0057) applies to the plan
--    row itself, now reused for:
--      • worksheet_exercise  insert / update / delete   (was: anyone who can SEE the plan)
--      • worksheet_image_use insert                      (was: anyone who can SEE the plan)
--      • plan_annotations    update                      (was: any member of the plan's space)
--        → the annotation's own author, or can_write_plan (the plan's author resolves /
--          accepts; the coordinator reviews)
-- 2. may_file_plan(centre, subject): a plan may only be created in a (centre, subject)
--    space the author belongs to, or in a subject they coordinate (organisation-wide
--    plans have no centre). Admins may file anywhere.
-- 3. A plan's class, centre, subject and scope are fixed once it exists (the app never
--    changes them). Scripts and migrations (no signed-in user) are exempt.
--
-- Reading is unchanged: whoever could see a plan, its worksheet and its comments still can.
--
-- Rollback: see the bottom of this file.

-- ── 1. helpers ──────────────────────────────────────────────────────────────
create or replace function public.can_write_plan(p_plan uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (not public.is_deactivated()) and exists (
    select 1
    from public.lesson_plans lp
    left join public.classes c on c.id = lp.class_id
    where lp.id = p_plan
      and (
        lp.created_by = auth.uid()
        or public.is_admin()
        or public.is_coordinator_of_subject(
             coalesce(c.school_id, lp.school_id),
             coalesce(c.subject_id, lp.subject_id))
      )
  );
$$;

create or replace function public.may_file_plan(p_school uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or public.is_coordinator_of_subject(p_school, p_subject)
      or (p_school is not null and public.is_member_of_subject(p_school, p_subject));
$$;

revoke execute on function public.can_write_plan(uuid) from public, anon;
grant  execute on function public.can_write_plan(uuid) to authenticated;
revoke execute on function public.may_file_plan(uuid, uuid) from public, anon;
grant  execute on function public.may_file_plan(uuid, uuid) to authenticated;

-- ── 2. worksheet exercises ──────────────────────────────────────────────────
drop policy if exists worksheet_exercise_insert on public.worksheet_exercise;
create policy worksheet_exercise_insert on public.worksheet_exercise
  for insert to authenticated
  with check (public.can_write_plan(lesson_plan_id));

drop policy if exists worksheet_exercise_update on public.worksheet_exercise;
create policy worksheet_exercise_update on public.worksheet_exercise
  for update to authenticated
  using (public.can_write_plan(lesson_plan_id))
  with check (public.can_write_plan(lesson_plan_id));

drop policy if exists worksheet_exercise_delete on public.worksheet_exercise;
create policy worksheet_exercise_delete on public.worksheet_exercise
  for delete to authenticated
  using (public.can_write_plan(lesson_plan_id));

-- ── 3. image bindings ───────────────────────────────────────────────────────
drop policy if exists worksheet_image_use_insert_visible_plan on public.worksheet_image_use;
create policy worksheet_image_use_insert_writer on public.worksheet_image_use
  for insert to authenticated
  with check (public.can_write_plan(lesson_plan_id));

-- ── 4. review comments ──────────────────────────────────────────────────────
drop policy if exists pa_member_update on public.plan_annotations;
create policy pa_author_or_writer_update on public.plan_annotations
  for update to authenticated
  using (
    (author_id = (select auth.uid()) and public.is_member_of_plan(plan_id))
    or public.can_write_plan(plan_id)
  )
  with check (
    (author_id = (select auth.uid()) and public.is_member_of_plan(plan_id))
    or public.can_write_plan(plan_id)
  );

-- ── 5. where a plan may be filed ────────────────────────────────────────────
drop policy if exists lp_insert on public.lesson_plans;
create policy lp_insert
  on public.lesson_plans for insert to authenticated
  with check (
    public.is_admin()
    or (
      created_by = auth.uid()
      and public.may_file_plan(
            coalesce((select c.school_id  from public.classes c where c.id = lesson_plans.class_id), lesson_plans.school_id),
            coalesce((select c.subject_id from public.classes c where c.id = lesson_plans.class_id), lesson_plans.subject_id))
    )
  );

create or replace function public.lesson_plans_fixed_space()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and (
       new.class_id   is distinct from old.class_id
    or new.school_id  is distinct from old.school_id
    or new.subject_id is distinct from old.subject_id
    or new.scope      is distinct from old.scope) then
    raise exception 'A plan''s class, centre and subject can''t change after it is created'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_plans_fixed_space on public.lesson_plans;
create trigger lesson_plans_fixed_space
  before update on public.lesson_plans
  for each row execute function public.lesson_plans_fixed_space();

insert into applied_migration (filename, note)
values ('20261001100000_plan_write_helper.sql', null)
on conflict (filename) do nothing;

-- ── Rollback (run by hand if needed) ────────────────────────────────────────
-- drop trigger if exists lesson_plans_fixed_space on public.lesson_plans;
-- drop function if exists public.lesson_plans_fixed_space();
-- then re-run the original policy blocks from 0057 (lp_insert), 0067 (worksheet_exercise_*),
-- 0072 (worksheet_image_use_insert_visible_plan) and 0045 (pa_member_update), after:
-- drop policy if exists worksheet_image_use_insert_writer on public.worksheet_image_use;
-- drop policy if exists pa_author_or_writer_update on public.plan_annotations;
-- drop function if exists public.can_write_plan(uuid);
-- drop function if exists public.may_file_plan(uuid, uuid);
-- delete from applied_migration where filename = '20261001100000_plan_write_helper.sql';
