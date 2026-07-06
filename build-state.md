# Build state

Living record of what each phase delivered and what comes next. Update as you go.

## Lesson board fixes: coordinator review-only · "This week" jump ✅ (this phase)

Ships two more board fixes on top of the class-binding fix below (that one already
landed via #100, so it's inherited from `main` here). Same surface — the lesson board,
the calendar header, and the teacher-vs-coordinator authoring split.

### Fix 2 — coordinator board is review-only (capability-based)

- **The gate is per-band `canAuthor`** on `BoardYear` (`src/lib/weekly-overview.ts`):
  the viewer may author in a band iff they teach an **active** class for its
  `(centre, subject, year)` — the same eligible-class rule `createTeacherPlan` binds
  on, evaluated over the already-loaded `taught` classes (no extra query). The create
  action stays the authoritative guard; this only hides affordances that would
  otherwise mislead.
- **Add-lesson** (`CalendarView.addChoicesFor`) is filtered to `canAuthor` bands, and
  the whole "+ Add lesson" control is suppressed when a column has no authorable band.
  **Not-started cards** (`cards.ts` `emptySlotCards`) skip non-authorable bands too, so
  the scope-chooser create path is gated identically.
- This supersedes the old single-space-only `boardReadOnly` for authoring: a user who
  **coordinates subject A but teaches subject B** now correctly sees Add-lesson only on
  B's bands. `boardReadOnly` (drag/status controls, review routing) is unchanged.

### Fix 3 — "This week" button

- New `resolveNearestTermWeekNo` (`src/lib/term-week.ts`): today's exact term week when
  seeded, else the **nearest seeded** week by `|starts_on − today's Monday|`, else null
  (empty `term_week`). The board resolves it to a `currentWeek: BoardCoordinate | null`
  on `BoardData`.
- `WeekNav` renders a **"This week"** button (next to the week picker) linking to
  `currentWeek`; hidden when null or already showing that week. **On-load week
  defaulting is unchanged** — button only. (Accurate "current" still needs `term_week`
  seeded beyond Dec 2025 — data, applied separately.)

### i18n

- `board.weekNav.thisWeek` in **`messages/en`** + **`messages/ar`** (Arabic needs
  **Kadria**'s review). `dir="auto"` retained on free-text.

### Preserve / verify

- Coordinator review board, `decidePlan` + submit/resubmit, the editor, RLS, and the
  annotation layer are unchanged. **No schema change.**
- `npx tsc --noEmit` clean · `next build` (Next 16.2.9) passes · `eslint` clean.

## Lesson creation binds to the teacher's class (kill silent read-only centre plans) ✅ (previous phase, #100)

Fixes the broken teacher → coordinator → teacher loop: a teacher could create a plan
with `class_id=null` / `scope='centre'`, which is read-only to them, so they'd see a
read-only plan **and** a "Resubmit" button (a contradiction) and could never edit or
resubmit it.

### A — creation always binds to one of the teacher's own classes

- **The centre fallback was in the two teacher creation entry points**, both hardcoding
  `createScopedPlan({ scope: 'centre', … })`: `ScopeChooser`'s `ConfirmLessonDialog`
  ("Not started" card) and `AddLessonMenu`'s per-column "+ Add lesson". Neither bound to
  a class — every teacher-created plan was a centre plan.
- **New server action `createTeacherPlan`** (`src/lib/actions/create-lesson.ts`) resolves
  the caller's **eligible classes** = their `class_teachers` **active** classes matching
  the slot's `(subject_id, year, school_id)` (subject/year derived server-side from the
  locked `lesson_key`; centre from the band). Then:
  - **exactly one** → auto-bind, delegating to `createScopedPlan({ scope: 'class', classId })`;
  - **several** → returns `{ reason: 'pick', classes }`; the teacher picks one (labelled
    by year + literacy) **before** the plan is created, then re-calls with `classId`;
  - **none** → returns `{ reason: 'none', subjectName, year }`; creation is **blocked**
    with *"You don't teach a {subject} · Year {year} class yet — ask your coordinator…"*
    and **no plan is inserted**.
  The class is resolved **before** insert — no orphan centre plan is ever produced.
  NB: since migration 0018 makes `(school_id, subject_id, year)` unique on active
  classes, `literacy` is the only distinguisher, so ">1 eligible" is effectively defensive.
- Both entry points now call `createTeacherPlan` and render the pick / blocked states
  inline (modal for `ConfirmLessonDialog`, inline panel for `AddLessonMenu`).
- `createScopedPlan`'s `centre` / `org` branches are **untouched** — kept for any future
  coordinator/admin centre-wide creation. No current caller creates centre plans.

### B — read-only plans show no teacher actions

- The plan's `scope` is threaded into the annotation context (`AnnotationProvider` ←
  `/plan/[id]/view`). In `AnnotationPane`'s `Footer`, the **teacher** branch now returns
  null unless `scope === 'class'`, so a centre/org (read-only) plan shows **no Resubmit
  and no "address the feedback" hint**. Coordinator controls and the class-plan teacher
  footer are unchanged.

### i18n

- New `board.add.chooseClass`, `board.add.noClass`, and `board.literacy.{literate,
  illiterate,mixed}` in **`messages/en`** and **`messages/ar`**. **Arabic needs Kadria's
  review.** All free-text uses `dir="auto"`.

### Preserve / verify

- Coordinator/admin centre creation, the annotation/review layer, `decidePlan` +
  submit/resubmit, the editor/board, and RLS are unchanged. **No schema change.**
- `npx tsc --noEmit` clean · `next build` (Next 16.2.9) passes · `eslint` clean.

## Inline coordinator review — Part B interaction correction (edit-in-place, no mode) ✅ (previous phase)

Supersedes the "Unlock for editing" entry UX from Part B. Scope, the `text`-suggestion
plumbing, and every guardrail are unchanged — only the entry gesture changed.

- **No mode / no toggle.** The `SuggestingToggle` and the `suggesting` context flag are
  removed. For a coordinator on the review view the prose fields (objective,
  `teacher_does`, `students_do`) and the duration/grouping are **directly editable at
  all times**. Edits are still captured as `plan_annotations` suggestions — no plan
  writes; the plan changes only on a teacher accept.
- **Edit in the words, not a box below.** `ProseField` now edits via
  **`contentEditable`** on the rendered text node itself (styled identically — same
  font/size/weight/line-height/colour, `dir="auto"` for RTL — so zero layout shift and
  no separate box). Not-editing = the tracked-change diff; a coordinator click swaps to
  the plain proposed text (`to_value`) in place; commit on blur/Enter, Escape reverts.
  Plain text only (paste coerced to text via `insertText`, Enter never inserts a
  newline). Empty fields show a placeholder via a `:empty::before` pseudo (globals.css)
  so `textContent` stays empty. Uncontrolled (seeded once via `key`) so React never
  clobbers the edit.
- **dur/enum edit inline in their cells** — the stepper / grouping picker now render in
  the duration / grouping cell itself (no box below), not an authoring shell.
- **Comment composer no longer floats above.** Plain-clicking text now edits, so the
  per-line **Comment** button stays the distinct comment trigger; its composer renders
  **beneath** the line — the objective's `ObjectiveAnnotations` (badge + Comment button +
  composer) moved below the objective box; phase composers were already below the row.
- All guardrails stand: `from_value` pinned, re-edits move only `to_value`, revert
  withdraws, no-op on zero net change, clamped `textDiffSegments`, never write the plan
  on a coordinator edit. `tsc` + `next build` + `eslint` green. No SQL (0046 from Part B
  still applies for the withdraw-delete).

## Inline coordinator review — suggesting mode / tracked changes (Part B) ✅ (previous phase)

Builds the half Part A deferred: the coordinator's **direct inline editing captured as
tracked changes**. The button-based suggestion authoring ("Suggest a time", grouping
buttons) is replaced by **direct inline editing** — the coordinator enters suggesting
mode, edits content in place, and every edit becomes a suggestion the teacher
accepts/rejects. Comments are unchanged.

### Done

- **"Unlock for editing" = client-side suggesting toggle** (`SuggestingToggle`,
  coordinator + review view only). It is NOT a real unlock: it never changes plan
  status and NEVER writes the plan. While on, inline edits are captured as
  `plan_annotations` suggestions; the plan is written ONLY when the teacher accepts
  (`decideSuggestion`). Teacher-owned content is never mutated by a coordinator edit.
- **Inline text suggestions** on `smartt_objective` + each block's `teacher_does` /
  `students_do` (`ProseField`): click → edit → commit on blur → a `text` suggestion
  (`from_value` = stored text, pinned; `to_value` = edit). One open suggestion per
  field — re-editing moves only `to_value`; editing back to the original **withdraws**
  it (delete). No-op on zero net change. Field-level granularity.
- **Inline dur / enum** — the `{n} min` value and the I/WE/YOU tag are now click-to-edit
  (stepper / picker) in suggesting mode, writing the SAME `dur` / `enum` suggestion +
  `from→to` pill as Part A. The "Suggest a time" / "Suggest a grouping" buttons and
  their forms are removed; the per-row **Comment** button + `CommentForm` stay.
- **Tracked-change diff** (`textDiffSegments`, pure: clamped common-prefix/suffix) →
  `{pre, del, ins, post}`. Rendered in the body (`ProseField`) and on the pane card:
  pending = `pre` + struck `del` + teal `ins` + `post`; accepted = the settled field
  text (the stored value already reflects it); rejected = the original.
- **`decideSuggestion` extended for `text`** — accept writes `to_value` to
  `smartt_objective` (objective) or a block's `teacher_does`/`students_do` (via the
  blocks JSONB read-modify-write, field named by `block_ref`); reject = status only.
  Same author-only + `needs_review`/`in_progress` guard as dur/enum. New
  `updateSuggestion` (revise a pending proposal, author-only) + `deleteSuggestion`
  (withdraw a pending proposal).
- **PartContent stays byte-identical off the review view** — the two description
  fields render inline (diff/edit) only when the annotation provider is present (the
  `/view` surface); with no provider (the editor's Review step) they render the exact
  same `Detail` DOM as before.
- **i18n** — new `review.annotations.suggesting.*` + `author.text*` in en + ar;
  editable prose islands `dir="auto"`. **Arabic flagged for Kadria.**

### Migration (apply in the Supabase SQL editor — authored, NOT run)

`supabase/migrations/0046_plan_annotation_delete.sql` — one narrow RLS policy so a
reverted inline edit can WITHDRAW its still-pending suggestion (author + pending +
coordinator-of-plan). Part A (0045) intentionally shipped no DELETE. Until it's
applied, revert-to-original leaves the suggestion in place (non-fatal); everything
else works. No column changes — 0045 already carries the `text` columns.

### Verified

- `npx tsc --noEmit` clean · `next build` (Next 16.2.9) passes · `eslint` clean.

### Deferred

- **Worksheet prose** — the worksheet is tiptap JSON rendered through a static,
  CSS-scaled print view; a block's "text" is a nested node tree (+ floating elements),
  so applying a `to_value` is a structure-dependent splice. Deferred to its own slice
  per the scope gate. The `text` / `block_ref` columns already support it (additive).

## Inline coordinator review — annotation layer (Part A) ✅ (previous phase)

Replaces the flat plan-level comment sidebar on `/plan/[id]/view` with a
Google-Docs-style annotation layer: anchored comments (objective / phase row /
whole-plan, threaded + resolvable) and structured suggestions (a phase's duration
or its I/WE/YOU grouping, shown inline as `from → to`, that the teacher accepts or
rejects). Part B (tracked prose edits: free-text selection → text suggestion, the
strike/insert diff, applying into a plain-text field or the tiptap worksheet) is a
LATER branch — the schema already carries its columns (`suggestion_shape='text'`,
`anchor_quote/prefix/suffix`, `from/to_value` as spans), left null in Part A.

### Done

- **Schema** — `supabase/migrations/0045_plan_annotations.sql` (authored, NOT run;
  printed in the handoff to apply by hand). `plan_annotations` (comments +
  suggestions, anchored) + `plan_annotation_replies` (threaded). Phases are the
  `blocks` JSONB array (no phase table), so a phase anchor is `phase_ref` = the
  block `type`; a worksheet anchor is `block_ref`. RLS reuses the existing plan-level
  wrappers `is_member_of_plan` / `is_coordinator_of_plan` (which already fold in
  `is_admin()` + the deactivation check): read = any member, author = coordinator,
  reply = any member, update = any member (column scope gated in the actions). Reply
  `plan_id` is denormalized and stamped by a BEFORE-INSERT trigger (can't be spoofed;
  keeps the reply policy a direct `is_member_of_plan(plan_id)`, no subquery). Fully
  idempotent; backfills `plan_comments` → `general` comments with a `not exists`
  guard.
- **Server actions** (`@/lib/actions/annotations`) — `createAnnotation` (coord),
  `addAnnotationReply` (member), `setAnnotationResolved` (member),
  `decideSuggestion` (author/admin, only while `needs_review`/`in_progress`; on
  accept applies `dur`→block `minutes` / `enum`→block `phase` to the `blocks` JSONB
  in the same action, then stamps `status`/`decided_*`). `decidePlan` +
  `submitLessonPlanById` are reused unchanged for the footers.
- **Pane** (`@/components/review/annotation/*`) — strict port of the Coordinator
  Review · Annotation Layer design: header + count pill, Open/Resolved filter tabs,
  empty state, cards (badge · kind tag · anchor label · decided chip · expand →
  `from→to` strip, author block, threaded replies, reply composer, role-aware action
  row), a General feedback section + composer, and a role-aware footer (coordinator:
  Return/Approve/Undo/Reopen via `decidePlan`; teacher: hint + Resubmit via
  `submitLessonPlanById`). One `AnnotationProvider` wraps the whole review view so
  the read-side affordances and the pane cross-highlight; mutations `router.refresh()`.
- **Read-side, woven into `ReadOnlyPlan`** (not rebuilt) — objective gets a count
  badge + coordinator "comment"; each content phase row gets a count badge, a teal
  `from→to` pill in the duration/grouping cell for a live suggestion (green once
  accepted, and the in-session total recomputes), and coordinator inline authoring
  (suggest a time via a stepper, suggest a grouping, comment). Affordances no-op
  (plain read-only markup) when no provider — a non-member's view is unchanged.
- **Wizard editor** — the embedded response thread is removed; when a plan carries
  feedback the wizard shows a lightweight pointer linking to `/plan/[id]/view` (one
  respond-surface). `planHasAnnotations` gates it.
- **plan_comments cutover** — backfilled into the new model; `addPlanComment`,
  `getPlanComments`/`getPlanEvents`, `ActivityPane`, `mergeTimeline`/`activity-events`
  are deleted; nothing reads/writes `plan_comments` anymore. The TABLE is left in
  place (dropping is irreversible + would break `supabase/admin/*`); a later
  migration drops it and fixes those scripts once the cutover is verified in prod.
  `plan_events` (table + trigger) is untouched — the pane just stops rendering the
  event timeline.
- **i18n** — new `review.annotations.*` in `messages/{en,ar}/review.json`; counts via
  `formatNumber`, content islands `dir="auto"`. **Arabic machine-translated — flagged
  for Kadria.**

### Verified

- `npx tsc --noEmit` clean · `next build` (Next 16.2.9) passes.

### Deferred / follow-ups (reported in the handoff)

- **Lesson/Worksheet tabs + worksheet-block anchoring** deferred: the worksheet
  renders inside `PartContent` (shared with the editor Review step), so a tab split
  is a layout restructure beyond "weave, don't rebuild". Schema supports it
  (`worksheet_block` / `block_ref`) so it's additive later.
- Coordinator authoring is explicit per-row buttons (not hover affordances) for
  usability; a hover/selection treatment is a fidelity follow-up.
- Suggestion "Undo" after decision is not offered (comments toggle Resolve/Undo);
  un-applying an accepted dur/enum is a later concern (`from_value` is retained).
- Migration is authored-only (0045) — apply in the Supabase SQL editor.

## Curriculum browser — period labels, rail overflow, monthly view ✅ (this phase)

Goal: relabel the weekly viewer by curriculum **period**, contain the detail
rail's overflow, and add a **Monthly** calendar view behind a Weekly/Monthly
toggle. Read-only reference only — no plan-editing / permissions touched.

### Done

- **Period labels (Task 2)** — the weekly table's day rows now read "Period 1"…
  "Period 5" and the header column is "Period", both bound to
  `curriculum_lesson.period` (never derived from weekday). The rail header is
  "In focus · Period N". New i18n key `curriculum.period` ("Period {n}", numbered
  via `formatNumber`); `table.day`→`table.period`; `focus.inFocus` param
  `{day}`→`{value}`. The now-unused `daysShort`/`daysLong` keys were removed.
- **Rail overflow (Task 3)** — `FocusCard` resource rows are `flex items-start
  min-w-0`; resource labels (often raw URLs, e.g. langeek.co/…) use `break-all`,
  the daily-outcome block uses `break-words [overflow-wrap:anywhere]`, and the LO
  bullet lists carry `min-w-0 [overflow-wrap:anywhere]`. Long URLs no longer bleed
  past the card edge.
- **Monthly view + toggle (Task 6)** — segmented `[Weekly | Monthly]` control
  (teal active) at the selector row's right, before the read-only badge; the view
  rides in the URL (`?view=`) so month navigation stays monthly and links are
  shareable. Weekly = existing table + `WeekPicker`; Monthly = a weeks×periods
  calendar grid + a `MonthNav` month stepper. Grid cells are colour-coded skills
  (shared `SKILL_TEXT` tokens), a clamped daily LO, and the topic; the selected
  week lifts into a teal-bordered focus box and the selected cell drives the SAME
  `FocusCard`. "Plan this lesson →" reuses `createScopedPlan` unchanged.
  - Data: `getCurriculumBrowseData` now also returns `monthGrid`
    (`BrowseMonthWeek[]`) + `prevMonth`/`nextMonth` coordinates, built from the new
    `getCurriculumMonthRows(subject, year, month)` helper. `MonthlyBody` is keyed on
    the resolved coordinate so its grid selection re-initialises on month change.

### Verified

- `npx tsc --noEmit` clean · `next build` (Next 16.2.9) passes · `eslint` clean.

### Notes / follow-ups

- **Arabic flagged for Kadria's review** — the new `curriculum` strings in
  `messages/ar/curriculum.json` (`period` = "الحصة {n}", `view.*`, `prevMonth`/
  `nextMonth`, `monthGrid.*`) are machine-translated and need the native-speaker
  pass, per the standing convention.
- **Skill colours** — the design mock draws Speaking `#b62a5c` / Writing `#7a6e62`,
  but those are the editable-pink and a grey the codebase keeps for other roles.
  To honour the locked "never repurpose" rule and stay consistent with the weekly
  Skill column, the grid reuses the canonical `--color-skill-*` tokens
  (Reading/Listening match the design exactly; Speaking `#b8366b`, Writing
  `#8a6a3a`). Flag for design if an exact hex match is required.

## Lesson Plan editor rebuild — Part 1 ✅ (this phase)

Goal: rebuild `/plan/[id]` to the approved 5-step wizard design. This phase
delivers the **wizard frame + steps 1 (Objective), 4 (Link it), 5 (Review)**.
Steps 2/3 bodies, the embedded resource panel, and the worksheet are **Part 2**.

### Done

- **Wizard frame** (`LessonPlanEditor.tsx`, full-bleed inside `AppShell`):
  - `EditorSubHeader` — "‹ This week" link, class context (year · group · subject
    · date · centre · literacy pill), live `X / 50 min` total (green at 50, amber
    otherwise), plus a **Download** action (`/api/pdf/plan/[id]`) and save state.
  - `Stepper` — five clickable steps (done = teal ✓, current = pink halo, upcoming
    muted; teal connectors) with the Back + Next/Submit group pinned right
    ("Review lesson →" on step 4, "Submit for approval" on step 5). `step` is local
    state; circles/groups navigate, clamped 1–5.
  - `CurriculumBand` — Focus tag top-right + three tinted cells (daily outcome /
    grammar & vocabulary / theme) sourced from the curriculum lesson (no theme tag).
  - Objective is persistent: full editor on step 1, collapsed `ObjectiveBanner`
    (text only) on every later step.
- **Step 1 (Objective)** — `ObjectiveStep`: fixed stem + textarea, six SMARTT
  pills, "Check my objective" → `POST /api/check-objective` with the curriculum
  context. The result drives the pills' strong/needs-work state and a quiet
  feedback note (suggestions + rewrite); it is persisted to `smartt_check`.
- **Step 4 (Link it)** — `LinkItStep`: two bordered halves (CFU · Exit ticket),
  each a single-select list from `activity_bank` (`cfu` / `exit_ticket`); the
  selected technique expands a 1–2 line note and surfaces class-literacy
  instructions. Selection + note + minutes persist on the cfu / exit_ticket block.
- **Step 5 (Review)** — `ReviewStep`: collapsed objective banner; editable
  Required materials chips (pre-filled from blocks); lesson-parts table (part ·
  phase · time) with click-to-expand rows, read-only phase, time steppers for
  editable blocks; routines fixed (3 min), homework (30 min) shown separately and
  excluded from the 50.
- **Steps 2/3 placeholders** — `PlaceholderStep` with a working header phase
  dropdown + time stepper and a "coming next" body (no writing area / panel /
  worksheet).
- **Persistence** — `saveLessonPlan` / `submitLessonPlan` extended to write
  `smartt_check` + `required_materials` (`buildPatch`); `load-plan` reads them and
  the grammar/vocab curriculum context. Per-block phase + `minutes` + note +
  selected-activity ref persist via the existing autosave. Submit/unsubmit + status
  unchanged. `inSessionMinutes` / new `blockMinutes` now reflect editable `minutes`.
- **Removed** the old single-screen editor (`EditorHeader`, `SmarttObjectiveBox`,
  `BlockList`, `BlockPanel`, `ActivityCard`) — replaced by the wizard.

### Verified

- `npm run build` passes (Next 16.2.9, TypeScript strict); `npm run lint` clean.

### Part 2 (next)

Steps 2/3 two-pane writing area, the embedded Resource Bank panel, and the
student-worksheet builder (`worksheet` + `resourceIds`).

## Phase 1 — Foundation ✅ (this phase)

Goal: a correct, deployable foundation. Scaffold + locked schema/migrations +
types + Supabase/auth plumbing + ported curriculum data layer. **No UI, design
system, login screen, lesson editor, or AI features.**

### Done

- **Scaffold** — fresh Next.js **16.2.9** App Router project (`alsama-lesson-planner`),
  TypeScript strict, Tailwind v4, ESLint, `@/*` → `./src/*`. create-next-app
  boilerplate removed (demo page, SVGs, default README/metadata, Geist fonts).
- **Supabase + auth plumbing**
  - `src/lib/supabase/server.ts` — cookie-bound server client (honors RLS).
  - `src/lib/supabase/client.ts` — browser client (anon key, honors RLS).
  - `src/lib/supabase/proxy.ts` + `src/proxy.ts` — session refresh + route
    protection. Next 16 renamed the `middleware` convention to **`proxy`**.
  - `src/lib/supabase/env.ts` — reads the client-safe env vars only.
  - `handle_new_user` trigger inserts a `profiles` row (role `teacher`) on
    `auth.users` insert (migration `0005`).
  - Temporary placeholder landing (`src/app/page.tsx`, force-dynamic) prints the
    signed-in user; public `/login` stub is the unauthenticated redirect target.
- **Database** — numbered migrations in `supabase/migrations/` + `supabase/config.toml`:
  - `0001` extensions + enums · `0002` core tables · `0003` lesson_plans (+
    `set_updated_at` trigger + indexes) · `0004` activity_bank · `0005`
    handle_new_user · `0006` RLS (every table, policies per spec).
- **Seed** — `supabase/seed.sql`: 2 schools, English subject, 3 classes, and the
  6-row activity_bank sample (3 `cfu` + 3 `exit_ticket`). profiles/class_teachers
  deferred (need real auth users).
- **Curriculum data layer (ported)** — `src/data/curriculum.json` (947 keys),
  `src/lib/curriculumUtils.ts`, `src/lib/curriculum-actions.ts`,
  `src/types/curriculum.ts`. Added centralized boundary cleaning
  (`cleanCurriculumData`): drops 22 `L.*` placeholder rows, scrubs 18 `"#N/A"`
  values. Added optional `subject?` field (unpopulated). Public API otherwise
  unchanged.
- **Domain types + defaults (hand-authored)** — `Block`, `SmarttCheck`,
  `LessonPlan`, `PlanStatus`, etc. in `src/types/lesson.ts`; `DEFAULT_BLOCKS`,
  `IN_SESSION_TARGET_MINUTES`, `inSessionMinutes()` in `src/lib/blocks.ts`.
- **Type generation** — `npm run gen:types` script + committed placeholder
  `src/types/database.types.ts` (overwritten on first real run).
- **Docs** — `AGENTS.md` (stack + conventions + 50-minute rule + Next-version
  discipline), `CLAUDE.md` (includes AGENTS.md), this file.

### Verified

- `npm run build` passes (Next 16.2.9). `npm run lint` clean.
- Route map: `/` dynamic (auth'd), `/login` static (public), Proxy active.
- Curriculum smoke check (throwaway, since removed): `getLessonsByWeek(0, 1)` →
  5 lessons; LO prefixes stripped; `L.*` lookup → `null`; a known `#N/A`
  `vocabFocus` → `""`.

### Not yet applied to a database

No Docker / Supabase CLI was available in this workspace, so the migrations and
seed were written and lint-reviewed but **not applied to a live DB**. To apply:

```bash
supabase start          # boot local stack (needs Docker)
supabase db reset       # apply migrations 0001–0006, then seed.sql
npm run gen:types       # regenerate src/types/database.types.ts
```

Or link a project (`supabase link --project-ref <ref>`) and `supabase db push`.

## Phase 2 — Design foundation + Microsoft SSO ✅ (this phase)

Goal: a design-token layer from the approved design, a minimal primitive set, a
minimal authed app shell, and a working Microsoft SSO login. **Stops before the
Weekly Overview content, curriculum browser, lesson editor, AI, and Word export.**

### Done

- **Design source of truth** — vendored the approved Claude Design HTML into
  `design-reference/` (`Login`, `Weekly Overview`, `Curriculum Browser`, `Lesson
  Plan Editor`, `support.js` + README). Login drives `/login`; Weekly Overview
  drives the shared chrome.
- **Design tokens** (`src/app/globals.css`, Tailwind v4 CSS-first `@theme`) —
  brand (pink/teal/cream), a warm neutral ramp, semantic surface/text/border
  tokens, the 5 Weekly-Overview status colours (fg/bg/border each), radii,
  `shadow-card`, and a `.stripe` utility. Base styles set the sand background and
  Sora body type. Tokens are sampled from the design, not invented.
- **Fonts** (`src/app/fonts.ts`) — Sora (UI) and Sacramento (wordmark only) via
  `next/font/google`, wired to `--font-sans` / `--font-display` and applied on
  `<html>` in `layout.tsx`.
- **UI primitives** (`src/components/ui/`) — `Button` (primary/secondary ×
  sm/md), `Wordmark` (Sacramento), `Card`. Plus `src/lib/cn.ts`. Deliberately no
  form-field primitive: the SSO login has no inputs.
- **Auth flow** (`@supabase/ssr`, PKCE):
  - `/login` (`src/app/login/page.tsx`) — two-pane design; teal welcome panel +
    `MicrosoftSignInButton` (client) calling `signInWithOAuth({ provider: 'azure',
    redirectTo: <origin>/auth/callback, scopes: 'openid profile email' })`.
  - `/auth/callback` (`src/app/auth/callback/route.ts`) — exchanges the code for
    a session, backfills `profiles.full_name` from the identity if missing
    (safety net), redirects to `/`. Open-redirect-safe `next` handling.
  - `signOut` server action (`src/lib/actions/auth.ts`) → `/login`.
  - `src/proxy.ts` already treats `/login` and `/auth` (incl. `/auth/callback`)
    as public; everything else protected.
- **App shell** (`src/components/app-shell/`) — `AppShell` (top-bar chrome:
  wordmark + signed-in user + sign-out) wrapping the landing. `SignOutForm` posts
  to the server action. `src/app/page.tsx` now renders the shell + a placeholder
  body ("Signed in as {name} — your weekly overview is coming next") and
  temporarily prints the auth uid for provisioning.
- **Admin provisioning** — `supabase/admin/assign_teacher.sql` (+ README): sets a
  profile's school/subject to the seeded English values and assigns the seeded
  classes; idempotent; service-role only.
- **Docs** — `SETUP.md` (DB apply, Entra app registration, Supabase Azure
  provider, site/redirect URLs, env vars, run, test-teacher provisioning).

### Verified

- `npm run build` passes (Next 16.2.9). `npm run lint` clean.
- Route map: `/` dynamic, `/auth/callback` dynamic (route handler), `/login`
  static, Proxy active.
- Full end-to-end Microsoft login still needs the Entra + Supabase config in
  `SETUP.md`; the code wiring and non-auth rendering are correct without it.

## Phase 3 — Weekly Overview (read view) ✅ (this phase, overview branch)

Goal: the authenticated home screen — the read view of a teacher's Mon–Fri week
as the approved design's two views (Calendar matrix + Status board) with a
toggle, week navigation, real RLS-scoped data, and a sample-plan seed to demo
it. **Stops before creating/editing plans, the curriculum browser, AI, and Word
export** (next slices).

### Done

- **Data layer** (`src/lib/weekly-overview.ts`, `getWeeklyOverview(weekStart)`) —
  server-side, via the auth'd cookie client (RLS only, no service-role). Loads
  the teacher's assigned classes (`class_teachers → classes` + `schools`,
  `subjects`), then the `lesson_plans` for those classes within the Mon–Fri
  range. Resolves each plan's curriculum target (daily LO + theme) from
  `curriculum_lesson_id` via `getLessonById`. Returns a render-ready
  `WeeklyOverview`: per class, five Mon→Fri `WeekSlot`s, each with the plan (or
  null), its `SlotStatus`, the curriculum target, and an `isToday` flag.
- **View-model types** (`src/types/weekly-overview.ts`) — `WeeklyOverview`,
  `ClassWeek`, `WeekSlot`, `SlotPlan`, `CurriculumTarget`, and
  `SlotStatus = PlanStatus | 'not_started'` (the empty state is derived, never
  stored).
- **Week helpers** (`src/lib/week.ts`) — UTC, string-based Mon–Fri math:
  `resolveWeekStart` (snaps `?week=` to a Monday, defaults to this week),
  `currentMonday`, `weekdayDates`, `addDays`, `formatWeekRange`
  ("15 – 19 June 2026", month-aware), `weekdayOf`, `todayISO`.
- **Status model + tokens** (`src/components/weekly-overview/status.ts`) — one
  `STATUS_META` map carries copy ("In progress / Submitted / **Needs Review** /
  Approved / Not started"), the ●/○ glyph, and the `status-*` colour-token
  classes from globals.css. `StatusChip` renders the Calendar chips.
- **Two views + toggle, URL-driven**:
  - `CalendarView` — sessions (classes) down × weekdays across; the per-class
    grouping corner is labelled **"Sessions"**; today's column is tinted; each
    cell shows the daily-LO headline + status chip, or "Not started".
  - `StatusView` — the same slots grouped into the five status columns with
    counts; submitted cards read "Awaiting approval", needs-review cards show the
    coordinator note; "Not started" capped with a "+N more" tail.
  - `ViewToggle` + `WeekNav` are plain `<Link>`s that set `?view=` /
    `?week=` (keeping the other), so both the selected week and view live in the
    URL and are server-rendered/linkable. Prev / next / "This week" controls.
- **Home route** (`src/app/page.tsx`) — replaces the placeholder; reads
  `searchParams` (a Promise in Next 16), renders the overview inside `AppShell`.
  Slots with a plan link to `/plan/{id}` (the editor); empty slots are inert.
  Calm empty state when the teacher has no classes.
- **Dev/setup aid** — the auth-uid printout moved to a dedicated **`/whoami`**
  page (linked quietly from the overview), still needed to run the admin
  provisioning + seed. Removable once provisioning is in-app.
- **Sample-plan seed** (`supabase/admin/seed_sample_plans.sql` + README) —
  parameterized by teacher email/uid; inserts ~5 plans across the current week
  for the teacher's assigned classes covering all four statuses, `blocks =
  DEFAULT_BLOCKS`, year-appropriate real curriculum keys. Idempotent
  (`ON CONFLICT (class_id, lesson_date) DO NOTHING`); guards for un-provisioned
  teachers.

### Verified

- `npm run build` passes (Next 16.2.9). `npm run lint` clean. Route map: `/`
  dynamic, `/whoami` dynamic, `/login` static, `/auth/callback` dynamic, Proxy
  active.
- Not exercised against a live DB (no Docker/Supabase in this workspace, as in
  earlier phases): the data function + seed are type-checked and lint-reviewed
  but the rendered grid needs a seeded DB to view. Apply via the
  `supabase start` / `db reset` flow, run `assign_teacher.sql` then
  `seed_sample_plans.sql`, and (re)run `gen:types` so the nested-select casts in
  `weekly-overview.ts` can later be tightened.

## Phase 4 — Lesson Plan Editor ✅ (this phase, editor branch)

Goal: the editor for an **existing** plan — the core screen where a teacher
writes a 50-minute lesson. Built in parallel with the Weekly Overview on a
separate branch, kept to disjoint files (all new code under editor-specific
paths; shared files are imported, never modified). **Stops before** the
plan-creation flow / curriculum picker, AI features, and Word export.

### Done

- **Route `app/plan/[id]`** (`src/app/plan/[id]/page.tsx`, force-dynamic) — a
  server component that loads the plan with the auth'd client (RLS), 404s via
  `notFound()` when missing/not permitted, and hands off to the client editor
  inside the existing `AppShell`. (The overview's `/plan/{id}` links now resolve
  here.)
- **Data layer** (`src/lib/editor/load-plan.ts`) — `loadPlanForEditor(id)` joins
  the plan → class (school/subject/year/group/literacy), resolves the locked
  curriculum context (daily LO, focus area = linguistic skill, theme) from
  `curriculum_lesson_id` via the curriculum utils, and loads `activity_bank`
  rows for the blocks that have them (`cfu`, `exit_ticket`). Returns one
  serializable `EditorPlanData`. (The Supabase client is still untyped — the
  generated `Database` is a placeholder — so the joined rows are shaped by hand.)
- **Server actions** (`src/lib/actions/lesson-plan.ts`) — `saveLessonPlan`
  (autosave objective + blocks) and `submitLessonPlan` (persist, then set
  `status='submitted'` + `submitted_at`, guarded by a non-empty objective). Both
  go through the auth'd client; RLS scopes the write.
- **Editor components** (`src/components/editor/`):
  - `LessonPlanEditor` (client orchestrator) — holds objective/blocks/selection
    state, **debounced autosave (~1.5 s)** with a Saving/Saved indicator, and the
    submit flow.
  - `EditorHeader` — slim header carrying **curriculum context only** (class ·
    date · centre · focus area · theme + daily LO), the save indicator, a
    disabled **Export to Word**, and **Submit for approval**.
  - `SmarttObjectiveBox` — the pink box; the single home of the objective. The
    opening stem is enforced (shown muted, teacher edits only the remainder); the
    six SMARTT criteria are guidance chips; **"Check my objective" is rendered but
    un-wired** (no faked results).
  - `BlockList` — left summary in `DEFAULT_BLOCKS` order (name · phase tag ·
    duration · live content preview), routines grouped, homework separated, and a
    **timing meter** (in-session total excluding homework vs 50 min, with an
    over-target warning).
  - `BlockPanel` — the selected block: title + "?" guidance, a phase dropdown,
    **activities-first** (cfu/exit_ticket cards first; "?" reveals literate/
    illiterate variants per class literacy; Add prefills the fields), then the
    editing fields (Teacher does · Students do · **Resources** · Duration).
  - `ActivityCard`, `fields` (Textarea/Select/FieldLabel primitives).
- **Editor helpers** — `src/lib/block-guidance.ts` (Purpose/Technique/Success per
  block type), `src/lib/editor/objective.ts` (stem enforce/strip/compose + SMARTT
  criteria), `src/lib/editor/phase.ts` (phase tag/label/options).
- **Test seed** — `supabase/admin/seed_one_plan.sql`: one `in_progress` plan for
  the seeded Shatila · Year 2 · Group A class, `blocks = DEFAULT_BLOCKS`,
  `curriculum_lesson_id = 1.S5.K0.H2` (a real Year 2 Reading / "Food and drinks"
  lesson). Parameterized by `teacher_uid`; prints the new plan id. Run note in
  the file header (run `assign_teacher.sql` first).

### Verified

- `npm run build` passes (Next 16.2.9); `npm run lint` clean. Route map adds
  `/plan/[id]` (dynamic). No globals.css/AppShell/shared-type changes — merged
  cleanly with the overview branch (only build-state.md conflicted).
- Not applied to a live DB in this workspace (no Docker/Supabase CLI). To test:
  apply migrations + seed, provision a teacher (`assign_teacher.sql`), run
  `seed_one_plan.sql`, open `/plan/<printed id>`.

## Phase 4 — Editor refinements + full activity bank ✅ (this phase)

Goal: polish the existing Lesson Plan Editor and seed the complete pre-approved
activity bank. No new screens, no editor restructure — refinements + data.

### Done

- **Single submit control** — consolidated the three duplicate "submitted"
  signals into one status-driven control in the submit button's slot
  (`EditorHeader`'s new `SubmitControl`):
  - `in_progress` / `needs_review` → "Submit for approval" (submits).
  - `submitted` → filled "Submitted · click to keep editing" button that reverts
    to `in_progress` and clears `submitted_at`.
  - `approved` → display-only "Approved" badge (not clickable).
  Removed the separate "Submitted" pill and the green "This plan has been
  submitted…" banner (`LessonPlanEditor`). "✓ Saved" autosave indicator and the
  (still-stubbed) "Export to Word" button are unchanged. Backed by a new
  `unsubmitLessonPlan` server action (auth'd client, RLS) that touches only
  `status` + `submitted_at`.
- **Interactive block cards** — left-sidebar `BlockRow`s (un-selected) now get a
  pointer cursor and a teal hover border (`hover:border-teal`, with
  `transition-colors`); the selected card keeps its highlighted teal border. No
  layout change.
- **Header navigation** — the Alsama wordmark in `AppShell` is now a `Link` to
  `/` (Weekly Overview). New `Breadcrumb` component (`app-shell/Breadcrumb.tsx`)
  renders "Weekly Overview › <context>"; the editor page shows it with the
  current context (e.g. "Year 1 · Group A · Mon 15 Jun"). NB: the `/plan/new`
  picker referenced in the brief does not exist yet (plan-creation is a future
  slice), so the breadcrumb currently lands only on the editor; the same
  component is ready to drop into that picker when it's built.
- **Full activity bank (data)** — migration `0007_activity_bank_unique.sql` adds
  a `UNIQUE (block_type, name)` constraint; `supabase/seed.sql` now upserts the
  full **11 CFU + 9 Exit Ticket** activities (insert … on conflict … do update)
  so ids stay stable across re-seeds, then prunes any stale cfu/exit_ticket rows
  from the earlier 6-row sample. Columns: block_type, name, summary,
  illiterate_instructions, literate_instructions, sort_order (listed order).

### Verified

- `npm run build` passes (Next 16.2.9); `npm run lint` clean. Route map
  unchanged.
- Not applied to a live DB here (no Docker/Supabase CLI). To apply the new
  migration + seed: `supabase db reset` (re-runs all migrations then seed.sql),
  or in the Supabase SQL editor run `0007_activity_bank_unique.sql` once then
  paste the activity_bank section of `seed.sql` (it is idempotent). The editor
  already lists activities for the cfu + exit_ticket blocks with their
  literate/illiterate variants.

## Phase 5 — Plan-creation bridge ✅ (this phase)

Goal: complete the core loop — Weekly Overview → create a plan → editor. The
Overview's empty slots now start a curriculum picker that creates the plan and
hands off to the existing editor. **No standalone curriculum browser, no
date/class picker (slot-click is the only entry), no AI/export.**

### Done

- **Route `app/plan/new`** (`src/app/plan/new/page.tsx`, force-dynamic) — reads
  `classId` + `date` search params (Next 16 Promise form). Redirects to `/` when
  either is missing/malformed (uuid + ISO-date checks) or the class isn't
  readable. If a plan already exists for `(class_id, lesson_date)`, redirects
  straight to `/plan/{id}`. Otherwise loads the class (year + school/subject
  context) via the auth'd client (RLS) and renders the picker scoped to the
  class's year.
- **Curriculum picker** (`src/components/plan-new/CurriculumPicker.tsx`, client)
  — progressive disclosure month → week → period rows. Months/weeks come from
  `getMonthsWithWeeks` (resolved server-side in the page); a week's lessons load
  on demand via the existing `fetchLessonsForWeek` server action. Each period row
  shows the daily LO, focus area / linguistic skill, and theme. Selecting one +
  "Create plan" calls the action below.
- **`createPlan` action** (`src/lib/actions/create-plan.ts`, `'use server'`) —
  inserts a `lesson_plans` row through the auth'd client (RLS enforces ownership
  and `created_by = auth.uid()`): `status 'in_progress'`, `blocks =
  DEFAULT_BLOCKS`, empty objective, plus `class_id`, `curriculum_lesson_id`,
  `lesson_date`, `period` (the selected lesson's `periodNum`). Handles the
  `(class_id, lesson_date)` unique violation gracefully (fetch existing →
  redirect). Redirects to `/plan/{newId}` on success.
- **Overview wiring** — `CalendarView` empty "Not started" slots now link to
  `/plan/new?classId=…&date=…` (the slot's ISO date); planned slots still open
  `/plan/{id}`. Status view unchanged (it has no empty slots).
- **Shared helpers** — added `isValidISODate` + `formatLongDate` to `src/lib/week.ts`.

### Verified

- `npm run build` passes (Next 16.2.9); `npm run lint` clean. Route map adds
  `/plan/new` (dynamic). No globals.css/AppShell/shared-type changes.
- Not applied to a live DB in this workspace (no Docker/Supabase CLI). To test:
  apply migrations + seed, provision a teacher, open the overview, click an empty
  slot, pick a lesson, and confirm it lands in the editor.

## Phase 6 — Layout refinements ✅ (this phase)

Goal: two UI/layout-only refinements. No data, schema, or behaviour changes; no
editor panel restructure beyond what's described.

### Done

- **Bundled standard routines** (`src/components/editor/BlockList.tsx`) — the
  three fixed routines (Anthem, Warm-up, Cool down) are no longer three separate
  top-level cards under a static "Standard routines · 3 min · auto" header. They
  are now one **collapsible group**, collapsed by default, that expands (chevron
  toggle, `aria-expanded`) to reveal the three routine `BlockRow`s for
  viewing/editing. The planned blocks (Check homework → Homework) remain the
  prominent, individually selectable cards. The routines' default durations/phases
  and the 50-minute timing meter are untouched.
- **Full-width in-app pages** — done in two steps:
  1. Removed the `mx-auto max-w-[1240px]` centered framing from `AppShell`'s
     header and `<main>` so the chrome fills the window with `px-6 lg:px-10`
     gutters.
  2. Removed the **page-level card-on-sand wrapper** that still floated each
     page's content as a rounded white card on the sandy backdrop. `AppShell`'s
     `<main>` now carries `bg-surface` (continuous with the white header, filling
     the window), and the three page components dropped their outer
     `overflow-hidden rounded-lg border bg-surface shadow-card` wrapper:
     `WeeklyOverview` (`src/components/weekly-overview/WeeklyOverview.tsx`), the
     editor (`src/components/editor/LessonPlanEditor.tsx`), and the `/plan/new`
     picker (`src/components/plan-new/CurriculumPicker.tsx`). The content area now
     spans the full window with no sandy side-margins at any width.
  Inner component styling is untouched — the pink SMARTT box, the block/activity
  cards, the timing meter, and the overview grid cells keep their own surfaces
  and tints (the off-white `bg-surface-subtle` sidebar, the cream "today" column,
  etc.). The brand palette and the login's own full-screen two-pane layout are
  unchanged.

### Verified

- `npm run build` passes (Next 16.2.9); `npm run lint` clean. Route map unchanged.

## Phase 6 — Navigation performance + click feedback ✅ (this phase)

Goal: kill the perceived latency on navigation and the Calendar⇄Status toggle
(it was all round-trips, not data volume) and give every button/link in-flight
feedback. No data, schema, or behaviour changes beyond performance + this UX.

### Investigation (root causes)

- **The view toggle was a server navigation.** `ViewToggle` and `WeekNav` were
  plain `<Link>`s that swapped `?view=`/`?week=` search params. With `/`'s
  `dynamic = 'force-dynamic'`, every click re-ran the `Home` server component and
  re-queried Supabase via `getWeeklyOverview`. But the two views are just two
  presentations of the **same already-loaded week**, so the toggle should never
  hit the server.
- **The data loaders waterfalled.** `getWeeklyOverview` awaited `profiles` then
  `class_teachers` sequentially (both only need the user id); `loadPlanForEditor`
  awaited the plan then the activity bank sequentially (independent); the editor
  and `/plan/new` pages fetched plan/class, then user, then profile in series.
  Each cross-region DB hop compounded.
- **No loading UI existed.** No `loading.tsx`/Suspense anywhere, so every
  navigation (overview, editor, `/plan/new`) blocked on a frozen page.
- **The 950 KB curriculum was required + cleaned at import time.**
  `curriculumUtils` ran `cleanCurriculumData(require('curriculum.json'))` at
  module load, so the parse+scrub happened on every cold start of any route that
  imports it — even an empty overview week that resolves no targets.
- **Supabase region could not be determined from the repo** — every reference is
  a placeholder (`https://<your-project-ref>.supabase.co` in `SETUP.md`/
  `.env.example`; `config.toml` is local-only). The Vercel↔Supabase region gap is
  the likeliest remaining latency source but is a dashboard concern (see below);
  no `vercel.json regions` hint was added because a wrong region would *worsen* it.

### Done

- **Instant client-side toggle.** `WeeklyOverview`
  (`src/components/weekly-overview/WeeklyOverview.tsx`) is now a client component
  holding `view` in `useState`; `ViewToggle` swaps it via `onChange` (buttons, not
  links). The URL stays truthful via a shallow `window.history.replaceState` — no
  server re-run, no re-query. Changing the *week* still navigates (needs new
  data). `CalendarView`/`StatusView` are unchanged read views.
- **Loading skeletons.** Added `src/app/loading.tsx`,
  `src/app/plan/[id]/loading.tsx` and `src/app/plan/new/loading.tsx`, each
  mirroring its page frame via a shared `AppShellSkeleton` + `Skeleton`
  (`src/components/ui/Skeleton.tsx`). Navigation now shows an instant, prefetched
  skeleton instead of a frozen page.
- **Pending feedback** — a consistent, subtle treatment (fill lightens + inline
  spinner) built on the design tokens:
  - `Spinner` (`src/components/ui/Spinner.tsx`) — `currentColor`, `animate-spin`.
  - `LinkPending` (`src/components/ui/LinkPending.tsx`) — Next 16 `useLinkStatus`
    (verified exported from `next/link`, returns `{ pending }`); fixed-size,
    opacity-toggled so it never shifts layout.
  - `Button` (`src/components/ui/Button.tsx`) gained a `pending` prop.
  - Applied to: the submit/unsubmit control (`EditorHeader`), the activity
    "+ Add" buttons (`ActivityCard`, via `useTransition`), the week-nav arrows +
    "This week" (`WeekNav`), the "open plan" links on both overview views
    (`CalendarView`/`StatusView`), and "Create plan" (`CurriculumPicker`). The
    "Check my objective" affordance stays disabled — an un-wired later slice with
    no in-flight action — and will use the same treatment when the AI slice lands.
- **Parallelized loaders** with `Promise.all`:
  - `getWeeklyOverview` (`src/lib/weekly-overview.ts`) — `profiles` ‖
    `class_teachers` (lesson_plans still follows; it needs the class ids).
  - `loadPlanForEditor` (`src/lib/editor/load-plan.ts`) — plan ‖ activity bank.
  - editor page (`src/app/plan/[id]/page.tsx`) — plan load ‖ `auth.getUser`.
  - `/plan/new` page (`src/app/plan/new/page.tsx`) — class ‖ existing-plan check ‖
    `auth.getUser`.
- **Deferred the curriculum cost.** `curriculumUtils` now lazy-loads + cleans the
  JSON on first query (lazy singleton `getRawData`), keeping the 950 KB parse off
  the cold-start critical path; an empty overview week never touches it.

### Region (maintainer action, not code)

The Supabase region isn't in the repo. Find it from your project URL
(`NEXT_PUBLIC_SUPABASE_URL` → `https://<ref>.supabase.co`; the region is under
Supabase → Project Settings → General/Infrastructure, e.g. `eu-west-2`). Then
**align the Vercel function region to it** (Vercel → Project → Settings →
Functions → Region) so server components/actions sit next to the DB. Once known,
a `vercel.json` `{ "regions": ["<id>"] }` hint can pin it.

### Verified

- `npm run build` passes (Next 16.2.9); `npm run lint` clean. Route map unchanged.
- Toggle switches with no server round-trip (pure state + shallow URL sync);
  overview/editor/`/plan/new` show instant skeletons; buttons/links show the
  lighter-fill + spinner pending state; loaders issue independent queries together.

## Phase 7 — `/plan/new` removed pending design ✅ (this phase)

Goal: pull the plan-creation bridge out of the app until it has a proper design
reference. The screen (Phase 5) was built without one and must not ship in the
meantime.

### Done

- **Deleted the route** — removed `src/app/plan/new/` entirely (`page.tsx` +
  `loading.tsx`). `/plan/new` now falls through to the `/plan/[id]` dynamic route
  with `id="new"`; the uuid column rejects `"new"`, `loadPlanForEditor` returns
  `null`, and the page 404s.
- **Deleted the picker** — removed `src/components/plan-new/CurriculumPicker.tsx`
  (and the now-empty `plan-new/` dir); it existed only for `/plan/new`.
- **Removed the `createPlan` action** — deleted `src/lib/actions/create-plan.ts`
  (the action lived in its own file, so the whole file went). `lesson-plan.ts`
  (`saveLessonPlan`, `unsubmitLessonPlan`, `submitLessonPlan`) is untouched.
- **Overview slots non-interactive again** — `CalendarView` empty "Not started"
  slots no longer link to `/plan/new`; they render as plain, non-interactive
  cells. Planned slots still open `/plan/{id}`. The `classId` prop, only used to
  build the creation href, was dropped from `SlotCell`.
- **No other changes** — editor, Weekly Overview reads, app shell, activity bank,
  auth all untouched. `isValidISODate`/`formatLongDate` in `src/lib/week.ts` stay
  (used elsewhere); curriculum query API unchanged.

### Verified

- `npm run build` passes (Next 16.2.9); `npm run lint` clean, no orphaned imports.
- Route map drops `/plan/new`; `/plan/[id]` remains. `/plan/new` → 404.

### When this comes back

Re-introduce the plan-creation flow only against a design reference. The Phase 5
notes above describe the removed implementation for reference.

## Next slice (not started)

1. **Curriculum browser.**
2. **AI assistance** — objective check (wire the existing affordance) + activity
   suggestions.
3. **Word (.docx) export**, **coordinator review UI**.
4. **Guidance content** (block-guidance beyond the current set).
5. **Multi-subject curriculum** — populate `subject`, ingestion script (the old
   spreadsheet→JSON generator was never in the repo and must be rebuilt).

## Phase 7 — Coordinator review (weekly overview + decisions) ✅ (this phase)

Goal: the coordinator half of the planner — a space-wide, read-only weekly
overview, plus Approve / Return / Undo decisions on submitted plans. Coordinators
do NOT author plans. **No comments UI/table/API** (designed in a later slice; this
slice only reserves layout space for the sidebar).

### Done

- **Role-aware board (`/`)** — `getBoardData` now resolves the board's (centre,
  subject) ids and sets `BoardData.boardReadOnly` when the viewer is a
  **coordinator of that space**. No new route: `/` serves both roles. Coordinator
  visibility was already space-wide via RLS (`lp_member_all`, migration 0019) +
  the membership-driven year/lesson resolution.
- **Read-only coordinator board** — `boardReadOnly` threads through
  `WeeklyOverview` → Calendar/Status → cards:
  - Calendar: no drag, no "+ Add lesson"; cards open `/plan/[id]/view`.
  - Status: four real-status columns only (In progress · Submitted · Needs Review ·
    Approved) — the "Not started" pseudo-column is omitted; no drag.
  - Cards show **author + Year (class) + Period (time) + status** so plans across
    teachers are distinguishable (`LessonCard` author/period line in `readOnly`).
  - Teacher board behaviour is unchanged (`boardReadOnly` is false for teachers).
- **Decision bar on `/plan/[id]/view`** — `CoordinatorDecisionBar` (client),
  rendered only when `canCoordinatePlan(id)` is true (coordinator of the plan's
  space, or admin). Actions by status: `submitted` → Approve / Return for changes;
  `approved` → Undo approval (reopen as draft); `needs_review` → Reopen as draft;
  `in_progress` → neutral note. Non-coordinators see the plan read-only, no bar.
- **Decision server action** — `decidePlan(planId, decision)` in
  `src/lib/actions/lesson-plan.ts` (auth'd RLS client): approve/return stamp
  `reviewed_at`; reopen clears `submitted_at` + `reviewed_at`. Authorisation rides
  on RLS + the `enforce_approval_role` trigger; a pre-check mirrors them for
  friendly errors. Kept separate from the teacher `setPlanStatus` board-drag path.
  `canCoordinatePlan` + a shared `resolvePlanSpace` helper back the gating.
- **Comments sidebar reserved (not built)** — `ReadOnlyPlan` is now a width-capped
  content column (`lg:max-w-[940px]`) beside an optional `rightRail` slot, so a
  ~360px comments rail can slot in later without reflowing the plan body. No
  comments UI/table/route/API added.
- **Settings** — verified only: coordinators already reach role-aware Settings and
  the nav link is already gated in (`AppShell` → `TopNav`). No change.

### Migrations

- **None.** The UPDATE RLS already lets a coordinator update in-space plans they
  don't own (coordinator is a `subject_membership` member → `is_member_of_subject`),
  and the approval trigger only gates transitions *into* `approved`/`needs_review`,
  so reopening to `in_progress` is unblocked. No schema change required.

### Verified

- `npx tsc --noEmit` clean; `next build` (Next 16.2.9) passes; `eslint` clean.

### Known follow-ups

- "Return for changes" sets `needs_review` without a reason note in this slice
  (`review_note` untouched); a note input arrives with the comments sidebar.

## Phase 8 — Submit → notify the coordinator in the bell ✅ (this phase)

Goal: the teacher→coordinator direction of the review loop — submitting a plan
must reliably move it to `submitted` AND surface it in the coordinator's bell as
"awaiting review". Mirrors the existing coordinator→teacher path (`decidePlan`
stamps `reviewed_at`; the teacher's bell shows the outcome) and slots into the
SAME notifications machinery — the bell stays a single derived-from-plan-state
feed, no parallel system.

### Done

- **Submit wiring (already mostly in place)** — the editor's Step-5 control
  (`SubmitControl` → `LessonPlanEditor.handleSubmit` → `submitLessonPlan`) already
  set `status='submitted'` + `submitted_at`. This phase adds **`reviewed_at = null`**
  to that update (`src/lib/actions/lesson-plan.ts`) so a RESUBMISSION from
  `needs_review` re-enters the queue without a stale "decided" mark. Harmless to
  the teacher-facing outcome notification: that query filters `status in
  ('approved','needs_review')`, so a `submitted` row is excluded regardless of
  `reviewed_at`. `setPlanStatus` (board drag) and `decidePlan` untouched. The
  post-submit UI (submitted badge / keep-editing / unsubmit) is unchanged.
- **Coordinator bell notification** — `src/lib/notifications.ts` now exposes one
  `getBellNotifications()` returning a discriminated union `NotificationItem =
  OutcomeNotification | ReviewNotification`, merged most-recent-first:
  - `outcome` (teacher-facing, unchanged behaviour) — the viewer's own
    `approved`/`needs_review` plans; links to `/plan/{id}`.
  - `review` (coordinator-facing, NEW) — each `submitted` plan in a (centre,
    subject) space the viewer **coordinates**; links to `/plan/{id}/view` (the
    review screen). Text: "**{author} submitted {Year · Subject} for review**" with
    the `submitted_at` time. Derived: it appears on submit and clears itself when
    the plan leaves `submitted` (approve/return) — no read-state, doubles as a live
    review-queue badge. Coordinated spaces come from `getMyMemberships()` (role
    `coordinator`); RLS (`lp_member_all` + role-agnostic `is_member_of_subject`)
    returns in-space submitted plans, filtered app-side to coordinated spaces;
    the viewer's own submissions are excluded; authors resolved via the co-member
    profiles policy (0013).
  - `NotificationBell` renders both kinds (`StatusChip` carries `submitted` for
    review items) and navigates via each item's own `href`. `AppShell` swapped
    `getMyNotifications` → `getBellNotifications`.

### Migrations

- **None.** `status` / `submitted_at` / `reviewed_at` all already exist; the bell
  is derived from plan columns (no notifications table). RLS already grants
  coordinators in-space read of submitted plans.

### Verified

- `npx tsc --noEmit` clean; `next build` (Next 16.2.9) passes; `eslint` clean.
- Not exercised against a live DB in this workspace (no Docker daemon / Supabase
  CLI / env, as in every prior phase). The four verify cases (teacher submit →
  `submitted`; coordinator bell shows the awaiting-review item linking to
  `/plan/[id]/view`; approve/return clears it while the teacher keeps their
  outcome notification; resubmit re-adds it) need a seeded DB + the test accounts
  to run.

## Phase 8 — Coordinator review comments sidebar ✅ (this phase)

Goal: the right-hand comments sidebar on the coordinator review page, plus its
coordinator-only backend. Purely additive — `ReadOnlyPlan` (the lesson body) is
untouched. i18n-aware: every new string is keyed in `messages/en` + `messages/ar`.

### Done

- **Backend (`plan_comments`)** — migration `0022_plan_comments.sql` (printed in the
  report; **not applied** — George runs it). Table + `(plan_id, created_at)` index,
  RLS **coordinator-only** for SELECT + INSERT via a new security-definer helper
  `is_coordinator_of_plan(plan_id)` that resolves the plan's (centre, subject) space
  class-optionally, exactly like the `lesson_plans` policy (0019). No UPDATE/DELETE
  policy → comments are immutable. Teacher-facing reveal is a later slice.
- **Server action / loading** — `addPlanComment(planId, body)` (`@/lib/actions/plan-comments`,
  auth'd RLS client, returns the persisted row); `getPlanComments(planId)`
  (`@/lib/review/comments`, oldest→newest, author names resolved via the co-member
  profiles policy). `decidePlan` is reused unchanged for approve/return/reopen.
- **Sidebar** — `ReviewCommentsSidebar` (client) in the reserved right rail:
  header + count (`formatNumber`), flat thread (empty state + comment cards: pink
  avatar, name, "Coordinator" chip, timestamp, **`dir="auto"` body**), composer
  (**`dir="auto"` textarea** + microcopy + teal Comment, optimistic add), and the
  decision footer. Footer by status: `submitted` → Return (amber, gated on ≥1
  comment with a hint) + Approve (teal); `approved` → Undo; `needs_review` → Reopen.
  Return opens a 460px confirm modal listing the comments → "Return to {author}".
- **Decision band reconciled** — the standalone `CoordinatorDecisionBar` is removed;
  decisions now live only in the sidebar footer. The draft (`in_progress`) neutral
  "nothing to review yet" note is kept and rendered via the page (no sidebar on
  drafts).
- **Draft gating** — the sidebar mounts only for a coordinator AND only on
  `submitted | needs_review | approved`; a draft shows the neutral note and no
  sidebar; a non-coordinator sees the plan read-only with nothing loaded.
- **i18n** — new `review.comments.*` namespace in `messages/en/review.json` +
  `messages/ar/review.json` (Arabic is machine-translated — **flagged for the
  native-speaker review pass**). New board key earlier (`board.card.authorPeriod`)
  is unrelated.

### Migration (apply in Supabase SQL editor)

`supabase/migrations/0022_plan_comments.sql` — printed in the handoff report.

### Verified

- `npx tsc --noEmit` clean · `next build` (Next 16.2.9) passes · `eslint` clean.

### Notes / follow-ups

- The reserved rail in `ReadOnlyPlan` is **360px** (its existing width); the sidebar
  fills it. The design calls for 384px, but widening the rail means editing
  `ReadOnlyPlan`, which this slice must not touch — flagged for the rail-width pass.
- Comment timestamps are pinned to `APP_TIME_ZONE` (Beirut) to avoid SSR/client
  hydration drift.
- No design-reference HTML for the sidebar exists in the repo; the port follows the
  prompt's detailed behavioural/visual spec.
