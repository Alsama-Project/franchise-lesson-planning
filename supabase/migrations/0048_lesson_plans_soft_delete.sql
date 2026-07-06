-- 0048_lesson_plans_soft_delete.sql
--
-- PROPOSAL — AUTHORED ONLY, NOT APPLIED. George reviews and applies this to the
-- live database (Supabase SQL editor), exactly like 0018/0019/0028. It is committed
-- here, idempotently, so the schema stays the locked source of truth in-repo and a
-- local `supabase db reset` reproduces it.
--
-- WHAT — soft delete ("recycle bin") for lesson plans:
--   * `deleted_at` / `deleted_by` columns mark a trashed row (the row survives).
--   * Trashing FREES the curriculum slot: every per-teacher uniqueness index is
--     rebuilt to exclude trashed rows (`... AND deleted_at IS NULL`), so a teacher
--     can re-plan a slot they trashed.
--   * Three SECURITY DEFINER RPCs carry the whole gate (the app calls only these):
--       - trash_lesson_plan(id)   — teacher: OWN `in_progress` only; coordinator/
--                                    admin of the plan's space: ANY status.
--       - restore_lesson_plan(id) — clears the flag; the partial indexes raise
--                                    23505 if the slot was re-planned (caught app-side).
--       - purge_lesson_plan(id)   — permanent hard DELETE from the bin (cascades).
--   * A guard trigger blocks any DIRECT write to deleted_at/deleted_by (PostgREST),
--     so the trash flag can only ever move through the gated RPCs.
--   * A RESTRICTIVE FOR DELETE policy denies all direct client DELETEs; permanent
--     purge happens only through purge_lesson_plan (SECURITY DEFINER bypasses RLS).
--     This TIGHTENS the current `lp_member_all` FOR ALL over-grant, under which any
--     subject-space member could DELETE a colleague's plan.
--   * resource_usage.lesson_plan_id gains ON DELETE SET NULL so a purge can't
--     FK-error (usage/popularity aggregates survive; only the plan link is dropped).
--   * purge_trashed_lesson_plans(interval) — an UNWIRED auto-purge helper George can
--     later attach to a Supabase schedule / pg_cron (there is no cron infra in-repo).
--
-- Idempotent: safe to re-run. `if exists` / `create or replace` / `if not exists`
-- throughout, so re-applying and the non-matching form of a hand-applied object are
-- both no-ops.

-- ── 1. columns ───────────────────────────────────────────────────────────────
alter table public.lesson_plans
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles (id);

-- Partial index so the bin view (created_by = me AND deleted_at is not null) and the
-- read filters (deleted_at is null) stay cheap.
create index if not exists lesson_plans_deleted_at_idx
  on public.lesson_plans (deleted_at)
  where deleted_at is not null;

-- ── 2. free the slot: rebuild every uniqueness rule to exclude trashed rows ───
-- The one-row-per-slot rules today are the per-teacher partial unique indexes from
-- 0028 (and, on databases where it was hand-applied, the legacy coordinate forms).
-- Each must add `AND deleted_at IS NULL`, else a trashed row keeps occupying the
-- index and re-planning the slot throws 23505.

-- Legacy 0003 constraint and the hand-applied whole-centre index, if still present:
-- convert (class_id, lesson_date) to a partial unique INDEX that ignores trashed rows.
alter table public.lesson_plans
  drop constraint if exists lesson_plans_class_id_lesson_date_key;
alter table public.lesson_plans
  drop constraint if exists uq_plan_centre;
drop index if exists public.uq_plan_centre;

-- Per-teacher partial unique indexes (0028), now trash-aware. Drop the old forms
-- (which lacked the deleted_at predicate) and recreate.
drop index if exists public.lesson_plans_owner_class_slot_key;
create unique index if not exists lesson_plans_owner_class_slot_key
  on public.lesson_plans (created_by, class_id, curriculum_lesson_id)
  where scope = 'class' and deleted_at is null;

drop index if exists public.lesson_plans_owner_centre_slot_key;
create unique index if not exists lesson_plans_owner_centre_slot_key
  on public.lesson_plans (created_by, school_id, curriculum_lesson_id)
  where scope = 'centre' and deleted_at is null;

drop index if exists public.lesson_plans_owner_org_slot_key;
create unique index if not exists lesson_plans_owner_org_slot_key
  on public.lesson_plans (created_by, curriculum_lesson_id)
  where scope = 'org' and deleted_at is null;

-- ── 3. resource_usage FK: don't block a purge, keep the usage aggregate ───────
alter table public.resource_usage
  drop constraint if exists resource_usage_lesson_plan_id_fkey;
alter table public.resource_usage
  add constraint resource_usage_lesson_plan_id_fkey
  foreign key (lesson_plan_id) references public.lesson_plans (id) on delete set null;

-- ── 4. guard: deleted_at/deleted_by only ever change via the RPCs ─────────────
-- The RPCs set a transaction-local flag before touching the columns. A direct
-- PostgREST UPDATE (which any space member is allowed by lp_member_all's UPDATE
-- branch) carries no flag, so it cannot flip the trash state on any plan.
create or replace function public.guard_lesson_plan_soft_delete()
returns trigger
language plpgsql
as $$
begin
  if (new.deleted_at is distinct from old.deleted_at
      or new.deleted_by is distinct from old.deleted_by)
     and coalesce(current_setting('app.soft_delete', true), '') <> 'on' then
    raise exception 'deleted_at/deleted_by may only be changed via the soft-delete RPCs';
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_plans_guard_soft_delete on public.lesson_plans;
create trigger lesson_plans_guard_soft_delete
  before update on public.lesson_plans
  for each row
  execute function public.guard_lesson_plan_soft_delete();

-- ── 5. RPC gate: trash / restore / purge ──────────────────────────────────────
-- SECURITY DEFINER (bypasses RLS), so each function MUST authorise the caller by
-- hand via auth.uid(). The status/role rule lives here, in one place:
--   teacher → OWN in_progress only;  coordinator/admin of the space → any status.
-- `is_coordinator_of_plan` (0022) already resolves the plan's (centre, subject)
-- space and folds in is_admin().

-- Trash: move a plan into the recycle bin.
create or replace function public.trash_lesson_plan(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
  v_status public.plan_status;
  v_deleted_at timestamptz;
begin
  select created_by, status, deleted_at
    into v_created_by, v_status, v_deleted_at
    from public.lesson_plans
    where id = p_id;

  if not found then
    raise exception 'Plan not found';
  end if;

  -- Already trashed → idempotent no-op.
  if v_deleted_at is not null then
    return;
  end if;

  -- Authorisation + status rule.
  if not (
    public.is_coordinator_of_plan(p_id)
    or (v_created_by = auth.uid() and v_status = 'in_progress')
  ) then
    raise exception 'Not permitted to delete this lesson';
  end if;

  perform set_config('app.soft_delete', 'on', true);
  update public.lesson_plans
    set deleted_at = now(), deleted_by = auth.uid()
    where id = p_id;
end;
$$;

-- Restore: pull a plan back out of the bin. Status is untouched (a submitted plan
-- restores as submitted). If the slot was re-planned while trashed, the trash-aware
-- unique index raises 23505 — the app surfaces a "slot already re-planned" warning.
create or replace function public.restore_lesson_plan(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
  v_deleted_at timestamptz;
begin
  select created_by, deleted_at
    into v_created_by, v_deleted_at
    from public.lesson_plans
    where id = p_id;

  if not found then
    raise exception 'Plan not found';
  end if;

  if v_deleted_at is null then
    return; -- not trashed → nothing to restore.
  end if;

  -- Author, or a coordinator/admin of the space, may restore.
  if not (public.is_coordinator_of_plan(p_id) or v_created_by = auth.uid()) then
    raise exception 'Not permitted to restore this lesson';
  end if;

  perform set_config('app.soft_delete', 'on', true);
  update public.lesson_plans
    set deleted_at = null, deleted_by = null
    where id = p_id;
end;
$$;

-- Purge: permanent hard DELETE from the bin. Only a TRASHED row may be purged
-- (the bin is the only entry point). Children cascade (plan_comments / plan_events /
-- plan_annotations / _replies); resource_usage.lesson_plan_id is nulled (step 3).
create or replace function public.purge_lesson_plan(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
  v_deleted_at timestamptz;
begin
  select created_by, deleted_at
    into v_created_by, v_deleted_at
    from public.lesson_plans
    where id = p_id;

  if not found then
    raise exception 'Plan not found';
  end if;

  if v_deleted_at is null then
    raise exception 'Only a trashed lesson can be permanently deleted';
  end if;

  if not (public.is_coordinator_of_plan(p_id) or v_created_by = auth.uid()) then
    raise exception 'Not permitted to delete this lesson';
  end if;

  delete from public.lesson_plans where id = p_id;
end;
$$;

-- ── 6. tighten the FOR ALL over-grant: no direct client DELETEs ───────────────
-- `lp_member_all` (0019) is FOR ALL, so its permissive DELETE branch lets any
-- subject-space member delete a colleague's plan directly. Add a RESTRICTIVE policy
-- that denies EVERY direct DELETE; the only delete path becomes purge_lesson_plan,
-- whose SECURITY DEFINER context bypasses RLS after its own authorisation check.
drop policy if exists lp_no_direct_delete on public.lesson_plans;
create policy lp_no_direct_delete
  on public.lesson_plans as restrictive for delete to authenticated
  using (false);

-- ── 7. UNWIRED auto-purge helper (schedule later; NOT relied on for v1) ───────
-- Hard-deletes rows trashed longer than `p_older_than` (default 30 days). Left
-- unscheduled: attach to a Supabase scheduled function / pg_cron job when desired,
-- e.g.  select cron.schedule('purge-trash','0 3 * * *',$$select public.purge_trashed_lesson_plans()$$);
create or replace function public.purge_trashed_lesson_plans(
  p_older_than interval default interval '30 days'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with deleted as (
    delete from public.lesson_plans
    where deleted_at is not null
      and deleted_at < now() - p_older_than
    returning 1
  )
  select count(*) into v_count from deleted;
  return v_count;
end;
$$;

-- ── 8. grants: expose the gated RPCs to the app's authenticated role ──────────
grant execute on function public.trash_lesson_plan(uuid) to authenticated;
grant execute on function public.restore_lesson_plan(uuid) to authenticated;
grant execute on function public.purge_lesson_plan(uuid) to authenticated;
-- Auto-purge is an operator/cron tool, not a user action — intentionally NOT
-- granted to `authenticated`.
