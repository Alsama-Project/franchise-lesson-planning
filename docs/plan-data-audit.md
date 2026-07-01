# Phase 0 read-only audit — plan data bleed & ownership lock

**Scope:** read-only investigation of BUG A (new-lesson content bleed) and BUG B
(ownership lock after role switch). No app code changed, no SQL run, no migration
applied. The migration below is **authored only** as a proposal.

**Verdict on the primary hypothesis:** **CONFIRMED for BUG A, and it is the shared
root cause.** Lesson plans have a surrogate `id` PK, but they are *found /
deduplicated by curriculum coordinate + scope*, never by the current teacher. The
owning-teacher column (`created_by`) is written on insert but is **not part of the
lookup key**, so the "create a new lesson" path routes a teacher into another
teacher's existing row. BUG B is the same ownership pivot seen from the read side:
"can I edit?" is decided by `created_by == auth.uid()`, so any viewer whose uid is
not the author is dropped to read-only.

One sub-claim in the hypothesis is **REFUTED**: the TEST MODE switch does **not**
overlay a role on the same uid — it genuinely signs in as a *different* Supabase
user (see §4). The "Viewing as: your account" label is a display artefact, not
evidence of a same-uid overlay.

---

## 1. Plan identity & creation

**Table:** `public.lesson_plans` (`supabase/migrations/0003_lesson_plans.sql:15-33`).

- **PK:** surrogate `id uuid` (`0003:16`).
- **Owner column:** `created_by uuid not null references profiles` (`0003:26`),
  indexed (`0003:41`).
- **Only in-repo unique constraint:** `unique (class_id, lesson_date)` (`0003:32`).
  This is now effectively dead: centre/org plans are created with
  `class_id = null` **and** `lesson_date = null` (`create-lesson.ts:150-151`), and
  Postgres treats NULLs as distinct, so the constraint never fires for the new
  scopes.
- The `scope`, `school_id`, `subject_id`, `year`, `weekday` columns the code relies
  on are **not in any numbered migration** — they were applied by hand in the
  Supabase SQL editor (provenance note at `0019:22-25`). Any per-scope unique index
  is likewise not in the repo; `create-lesson.ts:126,134` explicitly says the
  class-scope unique index "may be deferred (not guaranteed to exist)". **No index
  anywhere includes `created_by`.**

**Creation path (end to end):**

`AddLessonMenu.choose()` → `createScopedPlan(...)` → `router.push('/plan/'+id)`
(`AddLessonMenu.tsx:56-63`), and `/plan/[id]/page.tsx` server-loads the row via
`loadPlanForEditor` (`load-plan.ts:145-323`).

`createScopedPlan` is **SELECT-first, INSERT-only-if-absent** — i.e. an
open/upsert by coordinate, not a fresh per-teacher insert:

```
src/lib/actions/create-lesson.ts
127   const dupQuery = supabase
128     .from('lesson_plans')
129     .select('id')
130     .eq('curriculum_lesson_id', input.lessonKey)   // curriculum coordinate
131     .eq('scope', input.scope);
132   if (input.scope === 'class'  && classId) dupQuery.eq('class_id',  classId);
133   if (input.scope === 'centre' && schoolId) dupQuery.eq('school_id', schoolId);
136   const { data: existing } = await dupQuery.limit(1);
137   const existingId = (existing as { id: string }[] | null)?.[0]?.id;
138   if (existingId) return { ok: true, planId: existingId };   // ← opens SOMEONE ELSE'S row
```

**There is no `.eq('created_by', user.id)` on the lookup.** For `centre` scope (the
scope the board's "+ Add lesson" always uses — `AddLessonMenu.tsx:58`), the key is
just `(scope='centre', school_id, curriculum_lesson_id)`. So the *first* teacher at
a centre to open a slot creates the row; *every other* teacher who "adds a lesson"
for that same slot is handed that first teacher's `planId` and routed straight into
it. The race handler on unique violation repeats the same coordinate lookup
(`create-lesson.ts:162-171`) — also without `created_by` — so it too resolves to
the foreign row.

The INSERT itself is correct and does set the owner (`create-lesson.ts:154`:
`created_by: user.id`) — but only on the branch that is skipped whenever a row
already exists.

---

## 2. Ownership

- Owning teacher = `created_by`, set on insert (`create-lesson.ts:154`), NOT NULL
  (`0003:26`).
- **No coordinator action reassigns it.** `decidePlan` (return-for-changes /
  approve / undo / reopen) patches only `status` + timestamps
  (`lesson-plan.ts:245-259`); `setPlanStatus` patches only `status`
  (`lesson-plan.ts:144-149`). `created_by` is never mutated anywhere.

So ownership is stable — the problem is not that it changes, but that the *lookup*
and the *edit gate* don't use the current teacher's identity when deciding which
row to open (§1) or whether it's editable (§3).

---

## 3. Editability logic (where "not your plan / view-only" comes from)

Two independent gates, both keyed on `created_by`:

**(a) Page-level redirect — the source of the lock.** `/plan/[id]/page.tsx:40`:

```
if (canCoordinate && data.plan.created_by !== user?.id) {
  redirect(`/plan/${id}/view`);      // → ReadOnlyPlan, "Read only" badge (ReadOnlyPlan.tsx:133-135)
}
```

`canCoordinatePlan` is true for any coordinator of the plan's (centre, subject)
space **or any admin** (`lesson-plan.ts:188-208`). So: *coordinator/admin of the
space + not the author → forced to the read-only `/view` page*, in **every** status
(the redirect ignores status). The "Read only · <scope>" badge
(`ReadOnlyPlan.tsx:133-135`) is the "not your plan"-style message the user saw.

**(b) Editor lock — status only, NOT ownership.** Inside the editor,
`locked = status === 'submitted' || status === 'approved'`
(`LessonPlanEditor.tsx:119`). `in_progress` and `needs_review` are editable. The
editor has **no** ownership check and no "not your plan" copy — it trusts the page
redirect (a) and RLS to have already gated non-authors out.

**(c) RLS write.** `lp_member_all` (`0019:29-58`) allows UPDATE for
`created_by = auth.uid() OR is_admin() OR is_member_of_subject(space)`. So a
same-space teacher/coordinator can technically write; the *author-only* editing
promise is enforced only by gate (a), not by RLS.

**How this produces BUG B:** the plan is authored under one uid and later viewed
under a *different* uid that is a coordinator/admin of the space (the role switch —
§4 — changes the effective uid). `created_by !== user.id` becomes true and gate (a)
redirects to read-only. Aggravated by BUG A: when the "planned" lesson was actually
a foreign-authored shared row to begin with, `created_by` never equalled the
teacher's uid, so the mismatch is latent from creation.

---

## 4. Role-switch mechanics

**It swaps the whole session to a different user — not a same-uid overlay.**
`POST /api/test-impersonate` calls `supabase.auth.signInWithPassword({ email,
password })` with the *test user's* credentials for the chosen role
(`route.ts:208-211`; creds resolved per role at `test-impersonation.ts:118-122`).
Teacher / coordinator / admin are three **distinct seeded accounts with distinct
uids**. RLS and every server action therefore read role from that test user's
`subject_membership` / `profiles.role` **in the DB** (`auth.ts:41-64,140-148`) — not
from any overlay flag. There is no "role on the same uid" anywhere.

**"Viewing as: your account" is a label bug, not evidence of an overlay.**
`TestUserBar.tsx:87`:
`viewing = impersonating && currentRole ? ROLE_LABELS[currentRole] : 'your account'`.
It shows "your account" whenever `currentRole` reads null — i.e. the
`IMPERSONATION_ROLE_COOKIE` (set at `route.ts:217`, read at
`test-impersonation.ts:262`) wasn't present on that render — even while a different
test user is fully signed in. So the user was on a *different uid* despite the
label.

**The mismatch that locks you out:** the plan is created under the teacher test
uid; the edit gate (§3a) then compares `created_by` against whatever uid is active
when the page renders. If the effective identity at that point is the
coordinator/admin test user (or the switch-back didn't land cleanly), the
comparison fails and you're routed to read-only.

**Relation to the known "Return to my account" allowlist bug — DISTINCT.** That bug
lives in the return/restore path, authorised purely from the stashed real-admin uid
(`route.ts:116-143`, `getImpersonationState` at `test-impersonation.ts:254-278`).
BUG B lives in the plan page + RLS edit gate (`page.tsx:40`, `0019`). Different code,
different cause; they only rhyme because both are ultimately identity comparisons.

---

## 5. Draft / autosave hydration

**No client-side draft can bleed content.** There is **zero** `localStorage` /
`sessionStorage` / shared-draft usage in the editor or the create flow
(`grep` over `src/components/editor/*.tsx` → no matches; the create-lesson
components hold no draft). The editor hydrates its initial state exclusively from
the server-loaded `data.plan` prop (`LessonPlanEditor.tsx:83-108`), which comes from
`loadPlanForEditor` reading the DB row (`load-plan.ts:151-169`, mapped at
`load-plan.ts:297-320`).

**Therefore BUG A's content is real DB data, not a stale local draft.** Connie's
SMARTT objective / blocks / worksheet appear because `createScopedPlan` returned
Connie's actual `planId` (§1) and the editor faithfully loaded that row.
(`lesson-drafts.ts` does query drafts, but it is the standalone Resources-tab "add
to a lesson" picker and is correctly scoped `created_by = me AND status =
'in_progress'` at `lesson-drafts.ts:56-61` — not part of new-lesson hydration.)

---

## 6. RLS

**`lesson_plans` (`lp_member_all`, `0019:29-58`) — SELECT & UPDATE, `for all`:**
`created_by = auth.uid() OR is_admin() OR is_member_of_subject(space)`, where
`space` is derived class-optionally (class join, else the plan's own
`school_id`/`subject_id`). **This is broader than owner-only:** *any* member of the
plan's (centre, subject) space can both **read and hydrate** another teacher's full
plan — objective, blocks, worksheet. This is exactly what lets BUG A's foreign row
load without an RLS 404, and it means the "author-only editing" rule is not enforced
at the RLS layer at all (only by the page redirect in §3a).

(The original narrower `0006` policies — `select_own_or_assigned` /
`update_own_or_assigned`, `0006:48-80` — were superseded by `lp_member_all` in
`0019`.)

**Blocks:** there is no separate blocks table. `blocks` (and `worksheet`) are JSONB
columns on `lesson_plans` (`0003:25`, `0009:8`), so they inherit `lp_member_all`
wholesale — no finer gating.

---

## Root cause

**Both bugs share one root cause: a lesson plan is modelled as a shared artefact
keyed by (scope, curriculum coordinate, class/centre), owned by whoever created it
first — not as a per-teacher plan keyed by owner.**

- **BUG A** = the *create* path opens that shared row by coordinate without
  filtering on `created_by` (`create-lesson.ts:127-138,162-171`), and RLS
  (`lp_member_all`) happily loads a co-member's content.
- **BUG B** = the *edit* gate keys "may edit" on `created_by == auth.uid()`
  (`page.tsx:40` + RLS), so as soon as the viewing uid differs from the author's
  (role switch, or an already-foreign row from BUG A) the user is dropped to
  read-only.

---

## Recommended fixes (one decisive fix each)

### BUG A — scope the "open, don't duplicate" lookup to the current teacher
Add `.eq('created_by', user.id)` to **both** the dedup query
(`create-lesson.ts:127-136`) and the race-recovery query
(`create-lesson.ts:162-169`). Each teacher then opens/creates **their own** row for
a slot; a colleague's plan is never surfaced. This restores per-teacher plan
identity at the app layer. (Code-only; app change not made in this phase.)

> This on its own is the decisive behavioural fix. It **must** be paired with the
> schema change below, because if a hand-applied per-scope unique index that
> *excludes* `created_by` exists in the live DB, the owner-scoped INSERT would raise
> `23505` and the race handler would resolve back to the foreign row — reintroducing
> the bug.

### BUG B — same fix resolves it; plus align the edit gate with per-teacher ownership
Once each teacher owns their own row (fix A), `created_by` equals the authoring
teacher on every legitimate open, so `page.tsx:40` no longer misfires and RLS write
succeeds. No second mechanism is required for the reported scenario. If per-account
role testing is to remain, also consider making gate (a) status-aware/author-aware
so an author is never redirected off their own draft — but that is secondary to the
ownership fix. (No same-uid "role overlay" exists to fix; §4.)

### Schema change required → proposed migration (authored, NOT applied)
Current highest migration is **0027**; the proposal is **`0028`**. It (idempotently)
drops the now-dead `unique (class_id, lesson_date)` and establishes **per-teacher,
per-scope, per-slot** uniqueness (partial indexes, one per scope, all keyed on
`created_by`). Written to `supabase/migrations/0028_lesson_plans_per_teacher_unique.sql`
as a proposal only — **do not apply until approved**, and confirm against the live
DB which scope columns / hand-applied indexes actually exist first (they are not all
in-repo — §1).

---

## Confidence & caveats

- **BUG A: high confidence**, fully traceable in code (§1, §5, §6).
- **BUG B: high confidence on the mechanism** (`created_by`-keyed edit gate + genuine
  uid swap; §3, §4). Exact reproduction depends on live session/identity and seed
  role data I cannot introspect read-only; the fix does not depend on that detail.
- The live `lesson_plans` schema differs from the in-repo migrations (scope columns
  + any unique indexes applied by hand — §1). **Verify the live schema before
  applying 0028.**
</content>
</invoke>
