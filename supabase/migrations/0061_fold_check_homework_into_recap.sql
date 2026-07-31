-- 0061_fold_check_homework_into_recap.sql
--
-- Folds the retired `check_homework` block into `recap`. The Homework-check step
-- was removed from the editor (its content — "homework corrected next class" — IS
-- a recap), and DEFAULT_BLOCKS no longer seeds a `check_homework` block (recap's
-- default minutes went 5 → 7 to keep the in-session total at 50).
--
-- This rewrites existing plans to match: for every plan whose `blocks` still holds
-- a `check_homework` element, its `minutes` are added onto the `recap` block and
-- the `check_homework` element is dropped. Block order is otherwise preserved.
--
-- The `blocks` column is JSONB (supabase/migrations/0003_lesson_plans.sql); the
-- per-block editable time is the `minutes` field, a JSON number
-- (src/types/lesson.ts). A missing `minutes` coalesces to 0 here — the editor
-- writes an explicit `minutes` on every save (normalizeBlocks), and new plans
-- always carry it, so this only affects never-resaved legacy rows.
--
-- NOTE: `check_homework` is intentionally KEPT in the LessonBlockType union
-- (src/types/lesson.ts) so any row not yet migrated still parses. Run this AFTER
-- the code deploy.

begin;

update public.lesson_plans p
set blocks = (
  select coalesce(jsonb_agg(
    case when b->>'type' = 'recap'
      then jsonb_set(b, '{minutes}', to_jsonb(
             coalesce((b->>'minutes')::int, 0)
           + coalesce((
               select (hb->>'minutes')::int
               from jsonb_array_elements(p.blocks) hb
               where hb->>'type' = 'check_homework' limit 1
             ), 0)))
      else b end
    order by ord), '[]'::jsonb)
  from jsonb_array_elements(p.blocks) with ordinality as t(b, ord)
  where b->>'type' <> 'check_homework'
)
where p.blocks @> '[{"type":"check_homework"}]'::jsonb;

commit;

-- ── Verification (run manually AFTER the migration; read-only) ────────────────
-- 1) No plan should still hold a check_homework block. Expect 0:
--
--    select count(*) as remaining_check_homework
--    from public.lesson_plans
--    where blocks @> '[{"type":"check_homework"}]'::jsonb;
--
-- 2) The in-session total (every block except 'homework') must be unchanged by
--    the fold. Expect zero rows out — i.e. no plan's non-homework minutes moved:
--
--    select p.id,
--           sum(coalesce((b->>'minutes')::int, 0))
--             filter (where b->>'type' <> 'homework') as in_session_minutes
--    from public.lesson_plans p,
--         lateral jsonb_array_elements(p.blocks) b
--    group by p.id
--    having sum(coalesce((b->>'minutes')::int, 0))
--             filter (where b->>'type' <> 'homework') <> 50;
--    -- (Rows here would be plans whose stored minutes never summed to 50 to begin
--    --  with — pre-existing drift, not caused by this migration. Compare against a
--    --  snapshot taken before running if any appear.)
