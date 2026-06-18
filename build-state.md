# Build state

Living record of what each phase delivered and what comes next. Update as you go.

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

## Phase 3 — Weekly Overview (read view) ✅ (this phase)

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
  Slots with a plan link to `/plan/{id}` (the editor, built next); empty slots
  are inert. Calm empty state when the teacher has no classes.
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

## Next slice (not started)

1. **Lesson editor** — SMARTT objective + the 9 in-session blocks + activity
   bank; the create/edit flow the overview's `/plan/{id}` links point at, plus
   creation from empty "Not started" slots.
2. **Curriculum browser.**
3. **AI assistance**, **Word (.docx) export**, **coordinator UI**.
4. **Multi-subject curriculum** — populate `subject`, ingestion script (the old
   spreadsheet→JSON generator was never in the repo and must be rebuilt).
