-- 20261001110000_curriculum_sync_run_run_by.sql
--
-- Record who ran each curriculum import. Null for the n8n folder-watch (secret header,
-- no signed-in user) and for runs recorded before this column existed.
-- Written by src/lib/curriculum/sync.ts (SyncArgs.runBy).
--
-- Apply BEFORE deploying the app change that writes run_by.
-- Rollback: alter table public.curriculum_sync_run drop column if exists run_by;

alter table public.curriculum_sync_run
  add column if not exists run_by uuid references public.profiles (id) on delete set null;

insert into applied_migration (filename, note)
values ('20261001110000_curriculum_sync_run_run_by.sql', null)
on conflict (filename) do nothing;
