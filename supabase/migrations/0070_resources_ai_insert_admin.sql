-- 0070_resources_ai_insert_admin.sql
--
-- AUTHORED ONLY, NOT APPLIED. George reviews and applies this to the live
-- database (Supabase SQL editor), exactly like 0019/0028/0048/0057/0058.
-- Committed idempotently so the schema stays the locked source of truth in-repo.
--
-- WHAT — widen the ai_generated INSERT gate on `resources` to admins.
--
-- 0067 replaced `resources_insert_own` so an `origin = 'ai_generated'` row can only
-- be inserted by a user whose GLOBAL `profiles.role = 'coordinator'` (the same
-- profiles.role style the resource table's other policies use). The approval-time
-- write-back (writeBackApprovedExercises) runs as the approving user, and approval
-- authority is `is_coordinator_of_subject(...) OR is_admin()` — i.e. a global admin
-- (profiles.role = 'admin') can also be the actor. Under the 0067 predicate that
-- admin's write-back INSERT is rejected. This widens the role check to accept
-- 'admin' alongside 'coordinator' so an admin approver's write-back lands, while
-- every non-ai_generated insert stays exactly as before (uploaded_by = self only).
--
-- Scope is unchanged for teachers: a teacher (role 'teacher') still cannot insert
-- an ai_generated row. Only the two roles that can already reach the approve
-- transition gain the ai_generated insert right.
--
-- Idempotent: drop-if-exists + create. Safe to re-run.

drop policy if exists resources_insert_own on public.resources;

create policy resources_insert_own on public.resources
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      origin <> 'ai_generated'
      or exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.role in ('coordinator', 'admin')
      )
    )
  );
