-- 0043_coordinator_requests.sql
--
-- Coordinator self-request + admin approval. ⚠️ Touches the access model, so
-- review carefully — but note what it does NOT do: it never grants access on its
-- own. A self-selected "coordinator" lands in `coordinator_request`, a SEPARATE
-- table that NONE of the access readers (is_admin / is_member_of_subject /
-- is_coordinator_of_subject / shares_subject_space / list_users_admin / the
-- resource-bank policies) ever read. So a pending row is invisible to every RLS
-- path and grants exactly nothing. The ONLY way a `coordinator_subject` row is
-- ever minted from a request is `approve_coordinator_request`, which is
-- admin-gated. This is the security boundary the split is built on.
--
-- WHY a request table and not a pending `subject_membership`/`coordinator_subject`
-- row: an unfiltered read of either access table must never be able to leak
-- coordinator powers to someone awaiting approval. Holding the pending state in
-- its own table makes that impossible by construction.
--
-- Coordinator-ness is school-agnostic (see 0040/0041 — it lives in
-- `coordinator_subject(profile_id, subject_id)`, no school column). A request is
-- therefore subject-only: no centre. Approval inserts exactly the columns
-- `setUserAccess`'s coordinator path writes — `(profile_id, subject_id)` — so the
-- two mint-coordinator paths stay identical.
--
-- Does NOT touch `complete_onboarding` (the teacher self-provision RPC, also
-- called by Settings/join-spaces): the coordinator path is a wholly separate RPC.
--
-- CC never applies migrations — George runs this in the Supabase SQL editor.
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS): safe to re-run.

-- ── coordinator_request ───────────────────────────────────────────────────────
-- One row per coordinator-access request. `status` walks pending → approved |
-- rejected; `decided_at`/`decided_by` record the admin decision. ON DELETE CASCADE
-- from profiles/subjects keeps the table clean if either is removed.
create table if not exists public.coordinator_request (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles on delete cascade,
  subject_id  uuid not null references public.subjects on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.profiles
);

-- At most one PENDING request per (profile, subject). A user may re-request a
-- subject after a prior request was decided (partial predicate excludes
-- approved/rejected rows), but cannot stack duplicate pending rows.
create unique index if not exists coordinator_request_one_pending
  on public.coordinator_request (profile_id, subject_id)
  where status = 'pending';

-- Admin triage reads status='pending' rows; index that hot path.
create index if not exists coordinator_request_pending_idx
  on public.coordinator_request (status)
  where status = 'pending';

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.coordinator_request enable row level security;

-- Users read ONLY their own requests — this drives the "pending approval" screen
-- via the auth'd client. There is NO user-facing write policy at all: every write
-- (create / approve / reject) flows through the SECURITY DEFINER RPCs below, so a
-- client can never insert, self-approve, or tamper with a request row directly.
drop policy if exists coordinator_request_select_own on public.coordinator_request;
create policy coordinator_request_select_own
  on public.coordinator_request for select to authenticated
  using (profile_id = (select auth.uid()));

-- ── request_coordinator_access(p_subject_id) ──────────────────────────────────
-- The caller self-requests coordinator access to one subject. Takes the caller
-- from auth.uid() (never a client argument), so it cannot file a request for
-- anyone else. Grants NOTHING — only inserts a pending row.
create or replace function public.request_coordinator_access(p_subject_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- A deactivated user cannot self-request access (mirrors complete_onboarding).
  if public.is_deactivated() then
    raise exception 'Your access has been deactivated' using errcode = '42501';
  end if;

  if p_subject_id is null then
    raise exception 'A subject is required';
  end if;

  -- Already a coordinator of this subject → nothing to request.
  if exists (
    select 1 from public.coordinator_subject
    where profile_id = v_uid and subject_id = p_subject_id
  ) then
    raise exception 'You are already a coordinator of this subject';
  end if;

  -- Insert the pending request. The partial unique index rejects a second pending
  -- row for the same (profile, subject); translate that into a friendly message.
  begin
    insert into public.coordinator_request (profile_id, subject_id)
    values (v_uid, p_subject_id);
  exception
    when unique_violation then
      raise exception 'A request for this subject is already pending';
  end;
end;
$$;

revoke execute on function public.request_coordinator_access(uuid) from public;
grant  execute on function public.request_coordinator_access(uuid) to authenticated;

-- ── list_pending_coordinator_requests() ───────────────────────────────────────
-- Admin triage source for the Users tab. Reads other users' emails (auth.users),
-- so it is hard-gated on is_admin() and follows the cross-user-PII convention of
-- list_users_admin: security definer, STABLE, pinned search_path, revoke public /
-- grant authenticated. Newest first.
create or replace function public.list_pending_coordinator_requests()
returns table (
  request_id uuid,
  profile_id uuid,
  full_name  text,
  email      text,
  subject_id uuid,
  subject_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    cr.id                as request_id,
    cr.profile_id        as profile_id,
    p.full_name          as full_name,
    u.email::text        as email,
    cr.subject_id        as subject_id,
    subj.name            as subject_name,
    cr.created_at        as created_at
  from public.coordinator_request cr
  join public.subjects subj on subj.id = cr.subject_id
  left join public.profiles p on p.id = cr.profile_id
  left join auth.users     u on u.id = cr.profile_id
  where cr.status = 'pending'
  order by cr.created_at desc;
end;
$$;

revoke execute on function public.list_pending_coordinator_requests() from public;
grant  execute on function public.list_pending_coordinator_requests() to authenticated;

-- ── approve_coordinator_request(p_request_id) ─────────────────────────────────
-- Admin-only. Mints the coordinator_subject row (the ONLY request→access path)
-- and marks the request approved. Inserts exactly the columns setUserAccess's
-- coordinator path writes — (profile_id, subject_id) — so both mint-paths agree;
-- ON CONFLICT DO NOTHING makes a re-approval of an already-coordinator user safe.
create or replace function public.approve_coordinator_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.coordinator_request
    where id = p_request_id and status = 'pending'
  ) then
    raise exception 'Request not found or already decided';
  end if;

  insert into public.coordinator_subject (profile_id, subject_id)
  select profile_id, subject_id
  from public.coordinator_request
  where id = p_request_id
  on conflict (profile_id, subject_id) do nothing;

  update public.coordinator_request
     set status = 'approved',
         decided_at = now(),
         decided_by = auth.uid()
   where id = p_request_id;
end;
$$;

revoke execute on function public.approve_coordinator_request(uuid) from public;
grant  execute on function public.approve_coordinator_request(uuid) to authenticated;

-- ── reject_coordinator_request(p_request_id) ──────────────────────────────────
-- Admin-only. Marks the request rejected; grants nothing. Idempotent by the
-- status='pending' guard (rejecting a decided request is a no-op).
create or replace function public.reject_coordinator_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update public.coordinator_request
     set status = 'rejected',
         decided_at = now(),
         decided_by = auth.uid()
   where id = p_request_id and status = 'pending';
end;
$$;

revoke execute on function public.reject_coordinator_request(uuid) from public;
grant  execute on function public.reject_coordinator_request(uuid) to authenticated;
