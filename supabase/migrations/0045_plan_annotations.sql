-- 0045_plan_annotations.sql
--
-- Inline coordinator review: a Google-Docs-style annotation layer that replaces the
-- flat plan_comments sidebar. Two tables:
--
--   • plan_annotations       — anchored COMMENTS and structured SUGGESTIONS. A
--     comment attaches to any line/block (objective, a phase row, the worksheet, or
--     the whole plan) and is resolvable + threaded. A suggestion proposes a change
--     to a phase's duration (`dur`) or its I/WE/YOU grouping (`enum`), shown inline
--     as `from → to`, that the teacher accepts or rejects; accept applies the change
--     to the plan's `blocks` JSONB in the same server action.
--   • plan_annotation_replies — threaded replies under an annotation.
--
-- PART A (this migration) ships comment + dur/enum-suggestion + reply. The text/prose
-- suggestion columns (suggestion_shape='text', anchor_quote/prefix/suffix,
-- from_value/to_value as spans) are INCLUDED NOW but left null — Part B (a later
-- branch) is then purely additive: tracked prose edits, the strike/insert diff view,
-- and applying a text change into a plain-text field or the tiptap worksheet.
--
-- ANCHORING. There is NO phase table: a plan's phases are the ordered `blocks` JSONB
-- array on lesson_plans, and each block is identified by its `type` (one of the fixed
-- lesson_block sequence, unique within a plan). So a phase anchor is `phase_ref` = the
-- block's `type` (text, e.g. 'new_content') — NOT a uuid FK. A worksheet anchor is
-- `block_ref` = the worksheet block id (the worksheet is a v2 `{version, blocks[]}`
-- JSONB column whose blocks each carry a stable string id); Part A anchors at the
-- worksheet level (block_ref = 'worksheet').
--
-- ACCESS. Every policy resolves the plan's (centre, subject) space the SAME
-- class-optional way as lesson_plans (migration 0019) and plan_comments (0022/0025),
-- via the existing security-definer plan wrappers `is_member_of_plan(plan_id)` /
-- `is_coordinator_of_plan(plan_id)`. Both wrappers already fold in `is_admin()` and
-- the user-deactivation check (0032/0033), so admin + deactivation propagate for free
-- and the policies stay one-liners that cannot recurse through these tables' own RLS.
--   • read   (comments + suggestions + replies) → any plan member  (teacher sees the
--     coordinator's feedback).
--   • author (annotations)                       → coordinator of the space (or admin).
--   • reply                                      → any member (teacher replies).
--   • update (status / resolved / decided_*)     → any member; the teacher
--     accepts/rejects/resolves, the coordinator resolves/undoes. Postgres RLS can't
--     cleanly column-gate an UPDATE, so WHICH columns a member may touch is enforced
--     in the server actions (setAnnotationResolved / decideSuggestion only write
--     status/resolved/decided_*), exactly as block edits on lesson_plans are gated by
--     the app-side `locked` rather than by RLS. No DELETE policy — the UI offers Undo.
--
-- CUTOVER. plan_comments is folded into this model as `general` comments (backfill
-- below) and retired IN CODE — after this migration, getPlanComments/addPlanComment
-- and both ActivityPane mount sites are gone and nothing reads/writes plan_comments.
-- The table itself is LEFT IN PLACE (not dropped): dropping is irreversible, applied
-- by hand, and would break the supabase/admin/* cleanup scripts that name it. A later
-- migration drops it and fixes those scripts together, once the cutover is verified in
-- production. plan_events is likewise untouched — its table + AFTER-UPDATE trigger
-- (0027) keep recording decidePlan transitions; the new pane simply stops rendering
-- the event timeline (status history is not line-level feedback).
--
-- NOTE ON PROVENANCE: like the other numbered migrations, this DDL is applied by hand
-- in the Supabase SQL editor (George applies it to the live database) AND committed
-- here so the schema stays the locked source of truth and a local `supabase db reset`
-- reproduces it. EVERY statement is idempotent — re-applying this file must neither
-- error nor double-insert backfilled comments.

-- ── tables ───────────────────────────────────────────────────────────────────
create table if not exists public.plan_annotations (
  id                uuid primary key default gen_random_uuid(),
  plan_id           uuid not null references public.lesson_plans (id) on delete cascade,
  author_id         uuid not null default auth.uid() references public.profiles (id),
  kind              text not null check (kind in ('comment', 'suggestion')),

  -- anchor: where on the plan this attaches
  anchor_type       text not null check (anchor_type in (
                      'objective', 'phase', 'phase_description', 'phase_duration',
                      'phase_enum', 'worksheet_block', 'general')),
  phase_ref         text,          -- block.type (e.g. 'new_content') for phase* anchors; null otherwise
  block_ref         text,          -- worksheet block id for worksheet_block; null otherwise
  anchor_quote      text,          -- Part B: selected text at creation (null in Part A)
  anchor_prefix     text,          -- Part B: surrounding context for re-anchoring (null in Part A)
  anchor_suffix     text,          -- Part B: surrounding context for re-anchoring (null in Part A)

  -- suggestion payload (null for comments)
  suggestion_shape  text check (suggestion_shape in ('text', 'dur', 'enum')),
  from_value        text,          -- dur/enum: current value; text: original span (Part B)
  to_value          text,          -- dur/enum: proposed value; text: replacement (Part B)

  note              text not null, -- the comment / the suggestion's rationale
  status            text not null default 'pending'
                      check (status in ('pending', 'accepted', 'rejected')),  -- suggestions
  resolved          boolean not null default false,                           -- comments
  decided_by        uuid references public.profiles (id),
  decided_at        timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists plan_annotations_plan_created_idx
  on public.plan_annotations (plan_id, created_at);

create table if not exists public.plan_annotation_replies (
  id             uuid primary key default gen_random_uuid(),
  annotation_id  uuid not null references public.plan_annotations (id) on delete cascade,
  -- Denormalized from the parent annotation by the BEFORE-INSERT trigger below (an
  -- app-supplied value is overwritten, so it can never be spoofed to mismatch the
  -- parent). Lets the reply policies key on a direct is_member_of_plan(plan_id) with
  -- an index instead of a subquery back through plan_annotations — no per-row parent
  -- lookup, and the parent's RLS is not dragged into the child's policy evaluation.
  plan_id        uuid not null references public.lesson_plans (id) on delete cascade,
  author_id      uuid not null default auth.uid() references public.profiles (id),
  body           text not null,
  created_at     timestamptz not null default now()
);

create index if not exists plan_annotation_replies_annotation_created_idx
  on public.plan_annotation_replies (annotation_id, created_at);
create index if not exists plan_annotation_replies_plan_idx
  on public.plan_annotation_replies (plan_id);

-- ── reply plan_id trigger: stamp from the parent, never trust the client ───────
create or replace function public.set_reply_plan_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Overwrite whatever the client sent with the parent annotation's plan_id.
  -- Postgres fires BEFORE-INSERT triggers before evaluating the RLS WITH CHECK, so
  -- the policy below validates against this stamped value, not the app-supplied one.
  select a.plan_id into new.plan_id
  from public.plan_annotations a
  where a.id = new.annotation_id;
  return new;
end;
$$;

drop trigger if exists plan_annotation_replies_set_plan on public.plan_annotation_replies;
create trigger plan_annotation_replies_set_plan
  before insert on public.plan_annotation_replies
  for each row
  execute function public.set_reply_plan_id();

-- ── RLS ────────────────────────────────────────────────────────────────────────
alter table public.plan_annotations        enable row level security;
alter table public.plan_annotation_replies enable row level security;

-- plan_annotations: read = any member; author = coordinator; update = any member.
drop policy if exists pa_member_select on public.plan_annotations;
create policy pa_member_select
  on public.plan_annotations for select to authenticated
  using (public.is_member_of_plan(plan_id));

-- INSERT: the row's author is the caller, and the caller coordinates the plan's
-- space (is_coordinator_of_plan already grants admins). Authoring is a coordinator
-- action; the teacher responds via update/reply, never insert.
drop policy if exists pa_coord_insert on public.plan_annotations;
create policy pa_coord_insert
  on public.plan_annotations for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_coordinator_of_plan(plan_id)
  );

-- UPDATE: any member (teacher accept/reject/resolve; coordinator resolve/undo).
-- Column scope (only status/resolved/decided_*) is enforced in the server actions.
drop policy if exists pa_member_update on public.plan_annotations;
create policy pa_member_update
  on public.plan_annotations for update to authenticated
  using (public.is_member_of_plan(plan_id))
  with check (public.is_member_of_plan(plan_id));

-- replies: read + write = any member (teacher replies to the coordinator). Both key
-- on the denormalized, trigger-stamped plan_id (is_member_of_plan grants admins).
drop policy if exists par_member_select on public.plan_annotation_replies;
create policy par_member_select
  on public.plan_annotation_replies for select to authenticated
  using (public.is_member_of_plan(plan_id));

drop policy if exists par_member_insert on public.plan_annotation_replies;
create policy par_member_insert
  on public.plan_annotation_replies for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_member_of_plan(plan_id)
  );

-- No UPDATE / DELETE policy on either table in Part A (the UI offers Undo, not delete).

-- ── backfill: fold existing plan_comments into the unified model as general ────
-- One general comment per existing plan_comments row. Guarded so a re-apply neither
-- duplicates nor errors: skip a row we have already backfilled (matched on the tuple
-- that uniquely identifies it — same plan, author, body, and creation time).
insert into public.plan_annotations
  (plan_id, author_id, kind, anchor_type, note, resolved, created_at)
select pc.plan_id, pc.author_id, 'comment', 'general', pc.body, false, pc.created_at
from public.plan_comments pc
where not exists (
  select 1 from public.plan_annotations pa
  where pa.plan_id = pc.plan_id
    and pa.author_id = pc.author_id
    and pa.kind = 'comment'
    and pa.anchor_type = 'general'
    and pa.note = pc.body
    and pa.created_at = pc.created_at
);
