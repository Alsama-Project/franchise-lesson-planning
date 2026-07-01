-- 0029_complete_onboarding_rpc.sql
--
-- Onboarding self-provisioning through a controlled write path.
--
-- Problem: onboarding "Finish" inserted `subject_membership` rows directly from
-- the auth'd client. That is an uncontrolled client-side membership write, and
-- RLS correctly rejects it (`new row violates row-level security policy for
-- table "subject_membership"`). The old `sm_self_join` INSERT policy (0012)
-- existed to permit exactly that self-insert, but a permissive client INSERT
-- policy is precisely what we want to avoid: it is a standing hole in an
-- otherwise locked table.
--
-- Fix: a SECURITY DEFINER RPC is the ONLY self-service write path. It inserts
-- the CALLER'S OWN membership rows, with `role` HARDCODED to 'teacher'. It never
-- accepts a `profile_id` or `role` argument from the client, so a client cannot
-- write someone else's membership nor self-escalate to 'coordinator'.
-- Coordinator promotion stays an admin/coordinator action via `sm_admin_write` /
-- `sm_coord_write` (0012). Idempotent: `on conflict do nothing` on the natural
-- key so re-running onboarding (or joining a space twice from settings) is safe.
--
-- With the RPC in place we DROP `sm_self_join`, so `subject_membership` has no
-- permissive client INSERT policy at all — writes flow only through this definer
-- RPC, admins (`sm_admin_write`), or coordinators (`sm_coord_write`). Self-delete
-- (`sm_self_leave`) stays: leaving a space is a safe own-row delete.
--
-- Follows the established definer convention: security definer, pinned
-- `set search_path = public`, `revoke execute from public` + `grant execute to
-- authenticated` (mirrors admin_list_users / get_active_smartt_guide).
--
-- CC never applies migrations — George runs this in the Supabase SQL editor.
-- Idempotent (CREATE OR REPLACE / DROP … IF EXISTS): safe to re-run.

-- ── complete_onboarding ──────────────────────────────────────────────────────
-- Self-join one `subject_membership` per subject at the given centre, always as
-- 'teacher'. Returns void. The caller is taken from auth.uid() — never a client
-- argument — so this cannot provision membership for anyone but the caller.
create or replace function public.complete_onboarding(
  p_centre_id  uuid,
  p_subject_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_subject uuid;
begin
  -- Must be signed in. Raise (not-authorized) rather than silently no-op so the
  -- caller can distinguish "not signed in" from "nothing to do".
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_centre_id is null then
    raise exception 'A centre is required';
  end if;
  if p_subject_ids is null or array_length(p_subject_ids, 1) is null then
    raise exception 'At least one subject is required';
  end if;

  -- One membership per subject, role HARDCODED to 'teacher'. Idempotent on the
  -- (profile_id, school_id, subject_id) natural key.
  foreach v_subject in array p_subject_ids loop
    insert into public.subject_membership (profile_id, school_id, subject_id, role)
    values (v_uid, p_centre_id, v_subject, 'teacher')
    on conflict (profile_id, school_id, subject_id) do nothing;
  end loop;
end;
$$;

revoke execute on function public.complete_onboarding(uuid, uuid[]) from public;
grant  execute on function public.complete_onboarding(uuid, uuid[]) to authenticated;

-- ── lock subject_membership: drop the permissive self-insert policy ──────────
-- The RPC above is now the sole self-service INSERT path. Remaining write
-- policies (admin / coordinator) are unchanged; sm_self_leave (own-row delete)
-- stays so users can still leave a space.
drop policy if exists sm_self_join on public.subject_membership;
