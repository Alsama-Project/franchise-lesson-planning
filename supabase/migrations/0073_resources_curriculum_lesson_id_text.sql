-- 0073_resources_curriculum_lesson_id_text.sql
--
-- Fix resources.curriculum_lesson_id: UUID FK → TEXT slug.
--
-- 0067 added resources.curriculum_lesson_id as `uuid references curriculum_lesson(id)
-- on delete set null`. That is WRONG for a reuse pointer: curriculum_lesson rows are
-- re-ingested per version (V3 already went active once), and `on delete set null`
-- silently empties the pointer at the next sync — no error, the reuse link just
-- vanishes. The correct value is the lesson_key SLUG (e.g. 'english|Y0|May|W15|P5'),
-- the same TEXT value lesson_plans.curriculum_lesson_id already holds (0003, no FK),
-- which survives re-ingest because it is version-agnostic text, not a per-version id.
--
-- Column is empty in live (confirmed) — the DO block below hard-aborts if that is
-- ever not true, so no data is silently dropped.
--
-- Dropping the column also drops its dependent objects: the FK constraint
-- (resources_curriculum_lesson_id_fkey) AND the partial index
-- resources_curriculum_lesson_idx (0067). The index is therefore RECREATED below —
-- verified from 0067, not assumed. The FK is intentionally NOT recreated: the new
-- text column has no FK (matching lesson_plans.curriculum_lesson_id).
--
-- PROVENANCE / HOW TO APPLY: authored only — applied by hand in the Supabase SQL
-- editor like 0010/0018/0019/0028/0048/0057/0058/0059/0067/0070/0071. The agent
-- never executes SQL. Committed idempotently so the schema stays the locked source
-- of truth in-repo and a local `supabase db reset` reproduces it. Re-running is safe.

-- Abort if the column ever holds data — never silently drop a live reuse pointer.
do $$
begin
  if exists (select 1 from public.resources where curriculum_lesson_id is not null)
  then raise exception 'resources.curriculum_lesson_id holds data - abort';
  end if;
end $$;

-- Drop the uuid column (takes its FK + the 0067 partial index with it), re-add as text.
alter table public.resources drop column if exists curriculum_lesson_id;
alter table public.resources add  column if not exists curriculum_lesson_id text;

-- Recreate the partial index the column drop removed (definition mirrors 0067).
create index if not exists resources_curriculum_lesson_idx
  on public.resources (curriculum_lesson_id) where curriculum_lesson_id is not null;
