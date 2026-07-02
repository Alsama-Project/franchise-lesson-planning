-- 0031_set_my_classes_rpc.sql
--
-- Self-service class assignment for the settings "My classes" picker.
--
-- Problem: settings wrote `class_teachers` directly from the auth'd client, but
-- class_teachers has ONLY a SELECT policy (0006, class_teachers_select_own) — no
-- client INSERT/DELETE — so every tick was RLS-denied and silently swallowed
-- into a soft "class changes could not be applied yet" warning; nothing
-- persisted. Onboarding already self-assigns classes through the
-- complete_onboarding SECURITY DEFINER RPC (0029); settings just never had an
-- equivalent controlled write path.
--
-- Fix: set_my_classes — a bulk, DECLARATIVE reconcile. The client passes the
-- FULL set of ticked class ids; the function makes the CALLER'S OWN assignments
-- match that set, but ONLY within (centre, subject) spaces the caller is
-- currently a member of. Hardening mirrors complete_onboarding:
--   • the caller is always auth.uid() — never a client argument — so it can
--     never assign access for anyone but itself;
--   • it assigns/keeps only classes in a space the caller belongs to
--     (is_member_of_subject) — out-of-space or bogus ids are dropped by the
--     filter, so a client can never self-assign outside its spaces;
--   • it removes only the caller's OWN class_teachers rows, and only within
--     spaces the caller currently belongs to — assignments in classes outside
--     the caller's current spaces are left untouched;
--   • there is no role/permission argument — this is pure class association and
--     cannot escalate to coordinator/admin (that stays sm_admin_write /
--     sm_coord_write, 0012);
--   • security definer, pinned search_path, revoke execute from public + grant
--     to authenticated (same convention as complete_onboarding / admin_list_users).
-- Idempotent: `on conflict do nothing` on the (class_id, teacher_id) key, so
-- re-running with the same set is a no-op.
--
-- class_teachers keeps its select-only policy — this definer RPC is the sole
-- self-service write path, exactly as complete_onboarding is for onboarding.
--
-- CC never applies migrations — George runs this in the Supabase SQL editor.
-- Idempotent (CREATE OR REPLACE): safe to re-run.

create or replace function public.set_my_classes(p_class_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid  := auth.uid();
  v_ids uuid[] := coalesce(p_class_ids, '{}');
begin
  -- Must be signed in. Raise rather than silently no-op so the caller can tell
  -- "not signed in" from "nothing to do".
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- 1. Assign: add the caller to each requested class that lives in a space the
  --    caller is a member of. Out-of-space / bogus ids are dropped by the filter.
  insert into public.class_teachers (class_id, teacher_id)
  select c.id, v_uid
  from public.classes c
  where c.id = any(v_ids)
    and public.is_member_of_subject(c.school_id, c.subject_id)
  on conflict (class_id, teacher_id) do nothing;

  -- 2. Remove: drop the caller's own assignments that are NOT in the requested
  --    set, but only within spaces the caller currently belongs to. Assignments
  --    in classes outside the caller's current spaces are left untouched.
  delete from public.class_teachers ct
  using public.classes c
  where ct.teacher_id = v_uid
    and ct.class_id = c.id
    and public.is_member_of_subject(c.school_id, c.subject_id)
    and not (ct.class_id = any(v_ids));
end;
$$;

revoke execute on function public.set_my_classes(uuid[]) from public;
grant  execute on function public.set_my_classes(uuid[]) to authenticated;
