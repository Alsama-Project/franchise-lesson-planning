# Build state

Living record of what each phase delivered and what comes next. Update as you go.

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
