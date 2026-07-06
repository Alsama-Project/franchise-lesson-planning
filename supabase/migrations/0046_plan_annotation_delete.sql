-- 0046_plan_annotation_delete.sql
--
-- Part B (inline suggesting mode) needs to REMOVE a suggestion when the coordinator
-- edits an inline change back to the original value — a revert is a withdrawal, and
-- no empty (zero-net) diff should persist. Part A (0045) deliberately shipped NO
-- DELETE policy on plan_annotations ("the UI offers Undo, not delete"). Inline
-- editing is the case that genuinely needs one, so this adds a NARROW delete:
--
--   • the AUTHOR (a coordinator of the plan's space) may delete their OWN suggestion,
--     and ONLY while it is still `pending`.
--
-- Decided (accepted/rejected) rows, comments, and general feedback stay immutable;
-- replies are unaffected (no policy here). Same class-optional space resolution as
-- every other plan_annotations policy, via the existing security-definer wrapper.
--
-- NOTE ON PROVENANCE: like the other numbered migrations, this DDL is applied by hand
-- in the Supabase SQL editor AND committed here so the schema stays the locked source
-- of truth and a local `supabase db reset` reproduces it. The statement is idempotent.

drop policy if exists pa_author_delete on public.plan_annotations;
create policy pa_author_delete
  on public.plan_annotations for delete to authenticated
  using (
    author_id = (select auth.uid())
    and status = 'pending'
    and public.is_coordinator_of_plan(plan_id)
  );
