# Admin scripts

One-off, privileged maintenance snippets. These run with the **service-role**
connection (Supabase SQL editor, or `psql` against the database) and bypass RLS.
They must **never** run from a user request or with the anon key.

## `assign_teacher.sql`

Provisions a signed-in user as a real teacher so the Weekly Overview slice has
data: it sets the profile's `school_id`/`subject_id` to the seeded English
school/subject and inserts `class_teachers` rows for the seeded classes at that
school. Idempotent — safe to re-run.

**Prerequisite:** the user must have signed in once (the `handle_new_user`
trigger creates their `profiles` row on first sign-in).

### Find the user's auth uid

- The authed landing page (`/`) temporarily prints "Your user id", or
- Supabase dashboard → **Authentication → Users**.

### Run it

By email, with `psql`:

```bash
psql "$DATABASE_URL" -v teacher_email="'teacher@example.org'" \
  -f supabase/admin/assign_teacher.sql
```

By uid: edit the resolver in the script (comment the email line, uncomment the
uid line), then:

```bash
psql "$DATABASE_URL" -v teacher_uid="'00000000-0000-0000-0000-000000000000'" \
  -f supabase/admin/assign_teacher.sql
```

In the **Supabase SQL editor** (no `-v` support): open the file, replace
`:'teacher_email'` with a literal `'teacher@example.org'`, and run.

## `seed_sample_plans.sql`

Inserts ~5 sample `lesson_plans` across the **current** week (Mon–Fri) for a
teacher's assigned classes, covering all four stored statuses (`in_progress`,
`submitted`, `needs_review`, `approved`). Every plan starts from `DEFAULT_BLOCKS`
and points at a real, year-appropriate curriculum key, so the Weekly Overview
shows real classes, statuses and daily learning outcomes before the editor
exists. Idempotent (`ON CONFLICT (class_id, lesson_date) DO NOTHING`).

**Prerequisites:** the user has signed in once **and** has been provisioned with
classes — run `assign_teacher.sql` first.

Run it the same way as `assign_teacher.sql`:

```bash
psql "$DATABASE_URL" -v teacher_email="'teacher@example.org'" \
  -f supabase/admin/seed_sample_plans.sql
```

By uid, or in the Supabase SQL editor, follow the same email/uid resolver
instructions documented at the top of the file. To re-seed from scratch, delete
the teacher's plans for the week first, then re-run.

## `report_seed_references.sql` → `purge_seed_centres.sql`

A two-step, **read-then-delete** cleanup for the four SEED centres left in prod by
`seed_centres_classes.sql` — `Shatila 1`, `Shatila 2`, `Bourj 1`, `Bourj 2` — which
now clutter the centres list beside the two REAL centres (`Shatila Centre`
`42c11721-…`, `Bourj al-Barajneh Centre` `c87896b6-…`). Both resolve the seed
centres by **name** and ABORT if any resolved id equals a real centre id.

1. **`report_seed_references.sql`** — read-only. Prints, per seed centre, how many
   `class_teachers`, `lesson_plans` (by class and by centre), `subject_membership`,
   and `profiles.school_id` rows reference it. **Run this first** and confirm every
   count is seed-only before deleting.
2. **`purge_seed_centres.sql`** — ⚠️ destructive hard delete in ONE transaction,
   bottom-up (`lesson_plans` → `class_teachers` → `subject_membership` → null
   `profiles.school_id` → `classes` → `schools`). `plan_comments`/`plan_events`
   cascade from `lesson_plans` automatically. Any unexpected FK rolls the whole
   thing back — nothing partial.

Run both in the Supabase SQL editor (service-role). Never from a user request.

## `reset_personas_english_shatila.sql`

The **re-runnable "reset the impersonation personas to English · Shatila" fixture**.
When the two canonical impersonation personas (`teacher1` / `coordinator1`) drift
during end-to-end testing — teacher1 picking up extra subject memberships/class
links so it can author non-English plans, coordinator1's chrome pointing at the
wrong centre+subject while its coordinator power sprawls across many subjects — this
pins both back to English · Shatila and nothing else. Next drift is a one-paste fix.

It is **idempotent** (scoped delete-then-upsert; guards throughout) and touches
**only these two profiles' rows** — no other user's memberships. End state:

- **teacher1** → 1 `subject_membership` (English·Shatila, `role='teacher'`, primary),
  0 `coordinator_subject`, 2 `class_teachers` (English·Shatila Y1 + Y2).
- **coordinator1** → 1 `subject_membership` (English·Shatila, `role='coordinator'`,
  primary), 1 `coordinator_subject` (English), 0 `class_teachers`.

Why three tables: the coordinator scope is split — `coordinator_subject` is the
school-agnostic **power** (console Members/Curriculum + all-schools plan RLS), while
the `subject_membership` `role='coordinator'` row is the **chrome** (persona chip
label, read-only review board, review-queue notifications). The planning board also
folds any `class_teachers` row into a board space regardless of membership, so class
links are scoped too — that fold is exactly how teacher1 authored the stray Arabic
plan. Also soft-deletes the abandoned Arabic-centre plan
(`577f2207-…`, reversible via `restore_lesson_plan`).

Runs as plain DML in one transaction in the Supabase SQL editor (service-role) — no
path assumes `auth.uid()`. **No schema change** required: the current chrome resolves
to English·Shatila with the seed alone (no move-2 migration). It ends with a
count-asserting verify `SELECT` that reads **PASS**/**FAIL** per persona. Never runs
from a user request.

## `report_test_data.sql` → `reset_test_data.sql`

A two-step, **read-then-reset** one-off that resets the whole (centre, class) layer
to a clean, uniform test set. Final state: exactly five centres — `Shatila 1`,
`Shatila 2`, `Bourj 1`, `Bourj 2`, `Homs` — each with **English Year 0-6** classes
(7 per centre; the `year between 0 and 6` CHECK accepts Year 0). Only English is
seeded — add other subjects' classes from the admin page afterwards.

This DB currently holds **only the two REAL centres**, so there are no
seed-duplicate centres to delete. The five are reached by **renaming** the two real
centres (ids preserved, so every persona/tester `subject_membership` stays valid)
and **creating** the other three:

- **RENAME** Shatila Centre `42c11721-…` → `Shatila 1`
- **RENAME** Bourj al-Barajneh Centre `c87896b6-…` → `Bourj 1`
- **CREATE** `Shatila 2`, `Bourj 2`, `Homs` (only if missing)

1. **`report_test_data.sql`** — read-only. Shows all current centres and the global
   class/plan data the reset will **wipe** (all `lesson_plans`, `class_teachers`,
   `classes`), plus the `resource_usage` rows it will NULL. **Run this first.**
2. **`reset_test_data.sql`** — ⚠️ destructive, ONE transaction. NULLs
   `resource_usage.lesson_plan_id` (a no-cascade FK that would otherwise block the
   plan wipe; history rows survive) → wipes all `lesson_plans`
   (`plan_comments`/`plan_events` cascade) → `class_teachers` → `classes` → renames
   the two real centres → creates the three new centres → creates English Year 0-6
   across all five. **Never deletes a centre or any `subject_membership`.**
   Abort-guards (missing real id, missing English subject, or a centre name that
   resolves to >1 row) and any unexpected FK roll the whole thing back.

Run both in the Supabase SQL editor (service-role). Never from a user request.

## `trim_test_personas_to_english.sql`

Converges the two **canonical impersonation personas** — `teacher1`
(`4d8be40e-…`) and `coordinator1` (`a4e79fa9-…`) — onto a **single** subject-space,
**Shatila 1 · English**, across **both** coordinator models. The account chip's
space switcher renders one row per `subject_membership` row (`getSpaceSwitcher` in
`src/lib/active-space.ts`), so a persona sitting in eight spaces shows eight switcher
entries; trimming each to one membership collapses the switcher to a single entry,
shared across both personas.

**⚠️ Writes TWO tables because the app is half-migrated.** Migrations `0040`/`0041`
("Role-first access model") moved coordinator-ness out of
`subject_membership.role='coordinator'` into the school-agnostic table
`coordinator_subject(profile_id, subject_id)`. After `0041`, coordinator **power**
(the `setPlanStatus` approval gate + RLS via `is_coordinator_of_subject`) reads
**only** `coordinator_subject`, and `0041` **deletes** every `subject_membership`
coordinator row. But four client reads for coordinator **chrome** were **not**
migrated and still key off `subject_membership.role='coordinator'`:
`src/lib/weekly-overview.ts` (board), `src/lib/notifications.ts` (review bell),
`src/lib/console.ts`, and `src/components/app-shell/UserMenu.tsx` (switcher label).
Migrating those four is a **separate** task. Until then `coordinator1` needs a row in
**both** tables — `subject_membership(Shatila 1, English, coordinator)` for chrome
**and** `coordinator_subject(English)` for power — so this script writes both.

Two consequences:
- **Apply this script LAST**, after all pending migrations through `0042`. The
  `subject_membership` coordinator row is old-model chrome and is **fragile**: any
  re-run of `0041` deletes it (the toggle would then silently revert to teacher
  chrome), so the trim must run after `0041`.
- This script **supersedes `0039` A3 for `coordinator1`.** `0039` A3 derived the
  space with a non-deterministic `limit 1` over `teacher1`'s memberships and inserted
  a now-transient `subject_membership` coordinator row (possibly in the wrong
  subject); the convergent writes here — pinned to English, cleaning up any
  wrong-subject `coordinator_subject` row — are the source of truth for the persona.

Data-only. Touches **nothing** in the impersonation engine, the Teacher/Coordinator
toggle, the banner, `resolve_impersonation_persona`, or the `impersonation_canonical`
designation table, and **no schema** (no enum/constraint/table-shape change). Leaves
`is_test_persona`, `can_impersonate`, `profiles.role`, and the four half-migrated
client reads as-is.

Three parts, run in order in the Supabase SQL editor (service-role):

1. **PART A** — read-only. Verifies the pinned `Shatila 1` school id
   (`42c11721-…`, name `ilike 'shatila%'`) and resolves **English** by the stable
   key `subjects.code = 'english'` (never a hardcoded uuid). STOP if the school
   isn't Shatila or English doesn't resolve to exactly one row.
2. **PART B** — read-only preview of **both** tables for both personas
   (`subject_membership` + `coordinator_subject`, with centre/subject/role), so the
   full before-state is visible before any write. Eyeball the counts.
3. **PART C** — ⚠️ writes, ONE transaction, bound to the **two literal uids only**.
   Converges to: `teacher1` → one `subject_membership(Shatila 1, English, teacher)`
   and **zero** `coordinator_subject`; `coordinator1` → one
   `subject_membership(Shatila 1, English, coordinator)` **and** one
   `coordinator_subject(English)`. Re-asserts PART A's guards; any failure rolls back.
   **Idempotent** — re-running leaves both personas at exactly that end-state. Ends
   with a both-tables verification SELECT.

**Durability note (why no reseed re-introduces the clutter):** nothing in the repo
grants a persona all-subject memberships — the only persona `subject_membership`
inserts are `seed_test_personas.sql` (one **teacher** row at Shatila · English) and
migration `0039` A3 (one **coordinator** row for `coordinator1` in `teacher1`'s
derived space). Neither loops over subjects, so the eight-space clutter was a
manual / data-reset artifact, and PART C is sufficient to fix it.
