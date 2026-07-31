-- 0066_drop_curriculum_subject_shape.sql
-- Drop the now-unreferenced curriculum shape view.
--
-- WHY: 0063_curriculum_subject_shape added `curriculum_subject_shape` (COUNT(DISTINCT
-- period) per subject) to back `isSinglePeriodSubject`, which drove the collapsed
-- single-period curriculum view. That view — and its only consumer — were removed when
-- the collapse was reverted (PR #191): every subject now renders the normal weekly shape,
-- and nothing in the app reads `curriculum_subject_shape` any more. Drop it so the live
-- schema carries no orphaned object.
--
-- This SUPERSEDES 0063_curriculum_subject_shape (append-only history — that file stays);
-- running the numbered migrations in order now creates the view then drops it, so a local
-- `supabase db reset` reproduces the current live schema (no view) instead of drifting.
--
-- PROVENANCE / HOW TO APPLY: like 0010/0015/0024/0044/0047/0056/0063 this is applied BY
-- HAND in the Supabase SQL editor; committed idempotently so the schema stays the locked
-- source of truth in-repo. The agent never executes SQL. Re-running is safe (IF EXISTS).

drop view if exists public.curriculum_subject_shape;
