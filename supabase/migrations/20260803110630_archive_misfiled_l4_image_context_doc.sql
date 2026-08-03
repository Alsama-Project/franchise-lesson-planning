-- 20260803110630_archive_misfiled_l4_image_context_doc.sql
--
-- FINDING (image-render diagnosis audit): the ai_context_doc row
--   id   = 7d37c162-21d0-49c5-8e4b-dc3466c9b360
--   name = 'L4-image-generation-PLACEHOLDER'
-- is filed under tool = 'worksheet_builder' but governs IMAGE generation. Two
-- harms follow: (1) image guidance is injected into every worksheet_builder call
-- (the resource/exercise text generator), and (2) the worksheet_image tool's live
-- stack was, before 0071, a single placeholder.
--
-- WHY ARCHIVE, NOT REASSIGN. This row was NEVER created by any committed
-- migration — the id appears nowhere in the repo; it was hand-inserted directly
-- into the live database. Reassigning it to 'worksheet_image' would (a) bake an
-- unreproducible, hand-inserted row into migration history, and (b) put a SECOND
-- placeholder on worksheet_image, which already carries a committed one from
-- 0071_seed_worksheet_image_context_doc.sql. Archiving removes the real harm — the
-- misdirected injection into worksheet_builder — and is correct in BOTH
-- environments: prod has the row and archives it; a migration-only environment
-- (local `supabase db reset`, fresh DB) never had it, and that absence is the
-- right state there, so zero rows affected is a legitimate no-op, not a failure.
--
-- sort_order is untouched (this is not a reordering). The 0071 seed is untouched.
-- Nothing is inserted into ai_context_doc or ai_context_doc_version.
--
-- Idempotent: guarded on id + tool + is_archived = false, so a re-run (or a run
-- after a manual fix) updates nothing. Zero rows → NOTICE (legitimate on a
-- migration-only DB). Two-or-more rows → EXCEPTION (the id assumption is wrong and
-- a human must look).
--
-- PROVENANCE: authored here, applied BY HAND in the Supabase SQL editor by the
-- operator (George), like the other migrations.

do $$
declare
  v_count int;
begin
  update public.ai_context_doc
     set is_archived = true
   where id = '7d37c162-21d0-49c5-8e4b-dc3466c9b360'
     and tool = 'worksheet_builder'
     and is_archived = false;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise notice
      'archive_misfiled_l4_image_context_doc: 0 rows affected. Expected on any '
      'environment built from committed migrations — the row '
      '7d37c162-21d0-49c5-8e4b-dc3466c9b360 is live-DB-only (never created by a '
      'migration) and its absence here is the correct state. No-op.';
  elsif v_count > 1 then
    raise exception
      'archive_misfiled_l4_image_context_doc: % rows matched id + '
      'tool=worksheet_builder + is_archived=false; expected at most 1. The id '
      'assumption is wrong — a human must investigate before this is applied.',
      v_count;
  end if;
end $$;

-- Ledger ─────────────────────────────────────────────────────────────────────
insert into applied_migration (filename, note)
values ('20260803110630_archive_misfiled_l4_image_context_doc.sql', null)
on conflict (filename) do nothing;
