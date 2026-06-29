-- 0027_plan_events.sql
--
-- Lifecycle audit for a lesson plan's review workflow — the event source the
-- activity timeline merges with plan_comments. Until now the only record of a
-- transition was the pair of OVERWRITTEN snapshot columns on lesson_plans
-- (`submitted_at` / `reviewed_at`): they are cleared/replaced on every move (a
-- resubmit wipes the prior submit time, an undo clears the review time, a reopen
-- clears both), and they carry NO actor. So there was no chronological, attributed
-- history to render. This table is that history: append-only, one row per status
-- transition, stamped with the acting user and the moment it happened.
--
-- WRITE PATH: a single AFTER UPDATE trigger on lesson_plans, keyed on the status
-- change, records every transition — including the Status board's drag-to-move
-- (`setPlanStatus`), the editor submit, and the coordinator decisions
-- (`decidePlan`) — from ONE place, so no call site can forget to log. The actor is
-- captured server-side via auth.uid() inside the trigger (SECURITY DEFINER does
-- NOT change auth.uid(); it still resolves to the calling user — same guarantee
-- migration 0025 relies on). Service-role / seed updates have a null auth.uid();
-- the trigger simply skips logging those (a system move has no user actor), so
-- `actor_id` stays NOT NULL and `supabase db reset` + seed never trips it.
--
-- TRANSITION → EVENT MAP (every (old → new) status pair maps to exactly one type):
--   • → approved                          ⇒ approved
--   • → needs_review                      ⇒ returned
--   • → submitted        FROM approved    ⇒ undone     (coordinator undid approval)
--   • → submitted        FROM in_progress / needs_review ⇒ submitted (submit / resubmit)
--   • → in_progress                       ⇒ reopened   (reopen-as-draft / teacher unsubmit)
-- The two "to in_progress" sources (coordinator reopen of a returned plan; teacher
-- withdrawing a submission) and the two "to submitted" sources are disambiguated by
-- the FROM status, so there is no ambiguous transition left unmapped.
--
-- NOTE ON PROVENANCE: like the other numbered migrations, this DDL is also applied
-- by hand in the Supabase SQL editor (George applies it to the live database). It
-- is committed here, idempotently, so the schema stays the locked source of truth
-- in-repo and a local `supabase db reset` reproduces it. Every statement is guarded.

-- ── enum ─────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_event_type') then
    create type public.plan_event_type as enum (
      'submitted', 'approved', 'returned', 'reopened', 'undone'
    );
  end if;
end
$$;

-- ── table (append-only) ───────────────────────────────────────────────────────
create table if not exists public.plan_events (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.lesson_plans (id) on delete cascade,
  type       public.plan_event_type not null,
  actor_id   uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists plan_events_plan_created_idx
  on public.plan_events (plan_id, created_at);

-- ── write trigger: log every status transition, attributing the acting user ────
create or replace function public.log_plan_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.plan_event_type;
  uid uuid := auth.uid();
begin
  -- Only status MOVES are events, and only when a user made them (a service-role
  -- / seed write has a null auth.uid() — that is a system move, not logged).
  if new.status is distinct from old.status and uid is not null then
    ev := case
      when new.status = 'approved'                            then 'approved'
      when new.status = 'needs_review'                        then 'returned'
      when new.status = 'submitted' and old.status = 'approved' then 'undone'
      when new.status = 'submitted'                           then 'submitted'
      when new.status = 'in_progress'                         then 'reopened'
    end;
    if ev is not null then
      insert into public.plan_events (plan_id, type, actor_id)
      values (new.id, ev, uid);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_plans_log_event on public.lesson_plans;
create trigger lesson_plans_log_event
  after update on public.lesson_plans
  for each row
  execute function public.log_plan_event();

-- ── RLS ────────────────────────────────────────────────────────────────────────
alter table public.plan_events enable row level security;

-- READ: mirror PLAN visibility exactly — whoever can open the plan can read its
-- timeline. Reuses the security-definer helper from migration 0025 (creator, admin,
-- or member of the plan's (centre, subject) space), so events are no wider than the
-- plan or its comments.
drop policy if exists plan_events_member_select on public.plan_events;
create policy plan_events_member_select
  on public.plan_events for select to authenticated
  using (public.is_member_of_plan(plan_id));

-- INSERT: belt-and-braces. All real writes go through the SECURITY DEFINER trigger
-- (which bypasses RLS), so this policy only governs a hypothetical direct client
-- insert: the row's actor must be the caller, and the caller must be able to see the
-- plan. No UPDATE / DELETE policy → rows are immutable (an audit log never edits).
drop policy if exists plan_events_member_insert on public.plan_events;
create policy plan_events_member_insert
  on public.plan_events for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and public.is_member_of_plan(plan_id)
  );

-- ── OPTIONAL BACKFILL (George: run this section only if you want pre-migration
--    history seeded) ────────────────────────────────────────────────────────────
-- Plans created before this migration have no events. The surviving snapshot
-- columns let us seed at most a coarse skeleton: one `submitted` event per plan that
-- was ever submitted (`submitted_at`), and one `approved` event per currently
-- approved plan (`reviewed_at`). Pre-migration ACTORS ARE UNKNOWN — these columns
-- never recorded who acted — so we attribute both to the plan's creator
-- (`created_by`); this is a deliberate approximation, NOT ground truth. Returns,
-- undos and reopens cannot be reconstructed (their timestamps were overwritten), so
-- the backfilled timeline is necessarily partial. The guard makes it idempotent.
--
-- insert into public.plan_events (plan_id, type, actor_id, created_at)
-- select lp.id, 'submitted'::public.plan_event_type, lp.created_by, lp.submitted_at
-- from public.lesson_plans lp
-- where lp.submitted_at is not null
--   and not exists (
--     select 1 from public.plan_events e
--     where e.plan_id = lp.id and e.type = 'submitted'
--   );
--
-- insert into public.plan_events (plan_id, type, actor_id, created_at)
-- select lp.id, 'approved'::public.plan_event_type, lp.created_by, lp.reviewed_at
-- from public.lesson_plans lp
-- where lp.status = 'approved' and lp.reviewed_at is not null
--   and not exists (
--     select 1 from public.plan_events e
--     where e.plan_id = lp.id and e.type = 'approved'
--   );
