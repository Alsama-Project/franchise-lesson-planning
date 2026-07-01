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
-- The same RPC also self-assigns the caller's picked CLASSES (`class_teachers`),
-- which likewise has no client INSERT policy (0006 is select-only). Teachers pick
-- their classes during onboarding; a coordinator/admin can adjust later. Class
-- assignment is scoped to classes inside a space the caller is joining in this
-- same call (this centre + a chosen subject), so a client can never self-assign
-- into a class outside its onboarded spaces.
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
-- Self-join one `subject_membership` per subject at the given centre (always as
-- 'teacher'), then self-assign the caller to the picked classes. Returns void.
-- The caller is taken from auth.uid() — never a client argument — so this cannot
-- provision access for anyone but the caller.
--
-- An earlier draft of this migration defined a 2-arg (uuid, uuid[]) version; drop
-- it so only the classes-aware 3-arg function remains (no stale overload).
drop function if exists public.complete_onboarding(uuid, uuid[]);

create or replace function public.complete_onboarding(
  p_centre_id   uuid,
  p_subject_ids uuid[],
  p_class_ids   uuid[] default '{}'
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

  -- Self-assign the caller to each picked class, but ONLY classes that live in a
  -- space we just joined (this centre + a chosen subject). Out-of-space or bogus
  -- ids are silently dropped by the filter, so a client can never self-assign
  -- into a class outside its onboarded spaces. Idempotent on (class_id, teacher_id).
  if p_class_ids is not null and array_length(p_class_ids, 1) is not null then
    insert into public.class_teachers (class_id, teacher_id)
    select c.id, v_uid
    from public.classes c
    where c.id = any(p_class_ids)
      and c.school_id = p_centre_id
      and c.subject_id = any(p_subject_ids)
    on conflict (class_id, teacher_id) do nothing;
  end if;
end;
$$;

revoke execute on function public.complete_onboarding(uuid, uuid[], uuid[]) from public;
grant  execute on function public.complete_onboarding(uuid, uuid[], uuid[]) to authenticated;

-- ── lock subject_membership: drop the permissive self-insert policy ──────────
-- The RPC above is now the sole self-service INSERT path. Remaining write
-- policies (admin / coordinator) are unchanged; sm_self_leave (own-row delete)
-- stays so users can still leave a space.
drop policy if exists sm_self_join on public.subject_membership;
