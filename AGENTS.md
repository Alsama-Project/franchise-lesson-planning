<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Alsama Lesson Planner

Teachers plan 50-minute lessons in Alsama's format — a SMARTT objective plus a
fixed sequence of timed blocks — using pre-approved activities, and submit them
to coordinators for approval. Multi-school, multi-subject (English first), two
roles (`teacher`, `coordinator`). This is a clean rebuild of an older app; only
the curriculum data layer was ported forward.

## Stack

- **Next.js 16.2.9** (App Router) + **React 19.2** + **TypeScript (strict)**.
- **Tailwind CSS v4** (no design system yet — deferred).
- **Supabase** (Postgres + Auth) via `@supabase/supabase-js` + `@supabase/ssr`.
- **Auth:** Microsoft SSO through Supabase Auth (Azure provider).
- Deploys to **Vercel**. Path alias `@/*` → `./src/*`.

## Conventions (read before changing code)

- **Verify the Next.js version, don't assume.** This Next differs from older
  conventions. When something behaves unexpectedly, read
  `node_modules/next/dist/docs/` for the installed version rather than relying on
  memory. Heed deprecation notices. (Example already hit: the `middleware` file
  convention is deprecated → renamed to **`proxy`**; this app uses `src/proxy.ts`.)

- **The database schema is the locked source of truth.** It lives in
  `supabase/migrations/` (numbered SQL). Do not drift from it. Postgres can't
  enforce JSONB shapes, so the `Block` / `SmarttCheck` / `LessonPlan` domain
  types in `src/types/lesson.ts` mirror it by hand and must be kept in sync.
  Generated row types live in `src/types/database.types.ts` (`npm run gen:types`).

- **Auth'd clients only — never the service-role key in a user request.** The old
  app used the service-role key everywhere, bypassing RLS. Do not replicate that.
  - Server Components / Actions / Route Handlers → `@/lib/supabase/server`.
  - Client Components → `@/lib/supabase/client`.
  - Session refresh + route protection → `src/proxy.ts` (via `@/lib/supabase/proxy`).
  - The `SUPABASE_SERVICE_ROLE_KEY` is for admin/seed scripts ONLY; it bypasses
    RLS and must never reach the browser or a user-facing request.

- **RLS scopes data per user.** Every table has RLS enabled. Teachers see/edit
  their own profile, their assigned classes, and lesson plans they created or are
  assigned to. Reference tables (schools, subjects, classes, activity_bank) are
  read-only to authenticated users; writes are seed/admin only.

- **Clean curriculum data at the boundary.** `src/data/curriculum.json` is a
  baked spreadsheet export with junk: 18 literal `"#N/A"` field values and 22
  empty `L.*` placeholder rows. `src/lib/curriculumUtils.ts` scrubs these once at
  the JSON boundary (`cleanCurriculumData`) so no consumer ever sees them. Keep
  that public query API otherwise stable.

## The 50-minute rule

The in-session target is **50 minutes = the sum of every block EXCEPT
`homework`** (1+1+1+7+10+5+20+5). `homework` is done at home (guidance:
30–60 min) and is excluded from the in-session total. (The former 2-minute
`check_homework` block was folded into `recap`, taking it 5 → 7.) The canonical scaffold is
`DEFAULT_BLOCKS` in `src/lib/blocks.ts`; `inSessionMinutes()` computes the total
and `IN_SESSION_TARGET_MINUTES` is the target.

## Lesson blocks (fixed order)

`anthem · warm_up · cool_down · recap · new_content · cfu ·
independent_practice · exit_ticket · homework`. Phases: `we_do` for the three
openers, `i_do` for new_content, `you_do` for independent_practice; the rest have
no phase. (`check_homework` was folded into `recap` and is no longer seeded in
`DEFAULT_BLOCKS`; it remains in the `LessonBlockType` union so legacy rows parse.)

## Local Supabase

- `supabase start` boots a local stack; `supabase db reset` applies all
  migrations then `supabase/seed.sql`.
- `npm run gen:types` regenerates `src/types/database.types.ts` from the local DB.
- Env: copy `.env.example` → `.env.local` and fill in
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

See `build-state.md` for what this phase delivered and what's next.
