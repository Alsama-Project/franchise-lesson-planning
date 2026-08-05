-- READ-ONLY DIAGNOSTIC — not a schema change.
--
-- Purpose: for lesson plan 940e1256-8c5a-4cca-92d0-60449246ed68, compare the
-- image state PERSISTED in lesson_plans.worksheet (the tiptap v3 doc) against the
-- source of truth in worksheet_exercise.image_slots. This pins whether the write
-- landed with storagePath (persistence-side loss) or whether the doc never carried
-- it, using the row's updated_at as the "when was this last written" signal.
--
-- Runs three plain SELECTs. Makes NO writes and inserts NO ledger row — it exists to
-- be run once by hand in the SQL editor and then deleted. It is committed only so the
-- exact query is reviewable and reproducible.

-- (1) The plan row itself: when was the worksheet last persisted, and does it exist?
select
  lp.id,
  lp.updated_at,
  (lp.worksheet is not null)                     as worksheet_present,
  jsonb_typeof(lp.worksheet -> 'doc')            as doc_kind,
  (
    select count(*)
    from jsonb_path_query(lp.worksheet, '$.doc.**?(@.type == "image")') as n
  )                                              as image_node_count
from public.lesson_plans lp
where lp.id = '940e1256-8c5a-4cca-92d0-60449246ed68';

-- (2) Every image node in the persisted worksheet doc (recursive over the tiptap
--     tree): is attrs.storagePath present as a key, and what is its value?
select
  'worksheet_doc_image'                                  as source,
  coalesce((img -> 'attrs') ? 'storagePath', false)      as has_storage_path_key,
  img -> 'attrs' ->> 'storagePath'                       as storage_path_value,
  img -> 'attrs' ->> 'slotId'                            as slot_id,
  img -> 'attrs' ->> 'exerciseId'                        as exercise_id,
  img -> 'attrs' ->> 'src'                               as src_value
from public.lesson_plans lp
cross join lateral
  jsonb_path_query(lp.worksheet, '$.doc.**?(@.type == "image")') as img
where lp.id = '940e1256-8c5a-4cca-92d0-60449246ed68';

-- (3) Every image slot on the plan's exercise rows (the source of truth): its
--     storage_path, for row-by-row comparison against (2) by slot_id.
select
  'exercise_image_slot'                       as source,
  we.position,
  we.status                                   as exercise_status,
  we.updated_at                               as exercise_updated_at,
  slot ->> 'slot_id'                          as slot_id,
  (slot ? 'storage_path')                     as has_storage_path_key,
  slot ->> 'storage_path'                     as storage_path_value,
  slot ->> 'status'                           as slot_status
from public.worksheet_exercise we
cross join lateral
  jsonb_array_elements(coalesce(we.image_slots, '[]'::jsonb)) as slot
where we.lesson_plan_id = '940e1256-8c5a-4cca-92d0-60449246ed68'
order by we.position, slot_id;
