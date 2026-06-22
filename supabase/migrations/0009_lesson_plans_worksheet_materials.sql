-- 0008_lesson_plans_worksheet_materials.sql
-- Additive columns for the upcoming editor rebuild. Both are nullable JSONB so
-- existing rows and existing code are unaffected; the editor defines the exact
-- shapes when it wires persistence.

-- Student worksheet as a rich-text (tiptap) document.
alter table public.lesson_plans
  add column if not exists worksheet jsonb;

-- Required-materials list (an array of entries; entry shape defined by the editor).
alter table public.lesson_plans
  add column if not exists required_materials jsonb;
