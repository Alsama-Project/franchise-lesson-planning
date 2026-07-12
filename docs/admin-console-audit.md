# Admin console audit — Phase 0 (read-only)

**Scope:** Map what exists and what blocks five admin capabilities before any of
them is built. **Investigation only** — no application code, no migrations
applied, no UI changes in this pass.

Capabilities under review:

1. Create a new subject
2. Delete a user
3. Change a user's permissions / role
4. Promote a user to admin
5. Delete a school (centre)

The five words used below:
- **Wire-up** — a handler + policy already exist; only a UI affordance (or a call
  to an existing handler) is missing.
- **RLS** — a write is blocked by a missing/mismatched Row-Level-Security policy.
- **RPC** — the safe fix is a `SECURITY DEFINER` function (mirroring
  `complete_onboarding` / `admin_list_users`), typically because the write needs
  to bypass RLS *and* hardcode a privileged value (role, cascade) server-side.
- **Migration** — schema/policy DDL to add (George applies in the Supabase SQL
  editor; committed idempotently in `supabase/migrations/`).
- **New layout → Claude Design** — needs UI that doesn't exist yet.

---

## 1. Console inventory

**Route:** `/settings` → `src/app/settings/page.tsx` (there is no standalone
`/admin` route; it was retired). The page is a role-aware tabbed console rendered
by `src/components/settings/SettingsConsole.tsx`. Admin tabs (from
`getConsoleAccess()` in `src/lib/console.ts:72`):
`centres · subjects · classes · calendar · members · curriculum · ai_guide · smartt_guide`.

Tab components live in `src/components/settings/console/`; all mutations go
through server actions in `src/lib/actions/console.ts`.

| Capability | UI affordance | Handler | Notes |
|---|---|---|---|
| **Create subject** | **Exists** — `SubjectsTab` "New subject" inline form (`SubjectsTab.tsx:64‑97`) | **Exists** — `createSubject()` (`console.ts:143`) | Full UI + handler already built. Blocked at the DB layer (see §3/§5). |
| **Delete user** | **Absent** | **Absent** | `AdminMembersTab` "Remove" only deletes a `subject_membership` row (`removeMembership`), never the user. No affordance touches `auth.users` / `profiles`. |
| **Change permissions / role** | **Partial** — per-space role only. `AssignModal` sets (centre × subject) pairs + teacher/coordinator role (`MembersTab.tsx:162`); `coordPromoteMember` promotes teacher→coordinator in a space. | **Exists** for per-space (`saveMembership`, `coordPromoteMember`) | This is *subject-membership* role, not the global `profiles.role`. There is **no** affordance to change a user's global role. |
| **Promote to admin** | **Absent** | **Absent** | Nothing anywhere writes `profiles.role`. `grep` for `profiles.*update.*role` / `set_admin` / `promote.*admin` returns no write path. |
| **Delete school** | **Absent (hard delete)** — only **Archive** (soft) exists: `CentresTab` archive dialog (`CentresTab.tsx:198`) → `archiveCentre()` sets `archived_at` | **Soft only** — `archiveCentre` / `restoreCentre` (`console.ts:76,102`) | No hard-delete button, no `deleteCentre` handler. Archive is hard-blocked while any active class references the centre. |

---

## 2. Auth / role model

**"admin" is a global value on `profiles.role`.**

- `public.user_role` enum = `teacher | coordinator | admin` (0002 seeds
  teacher/coordinator; `admin` added in `0012_subject_membership.sql:20`).
- `profiles.role` (`0002_core_tables.sql:33`) `not null default 'teacher'`.
  There is **no** separate `admins` table, no boolean flag, and admin is **not**
  stored in `app_metadata` — it is purely `profiles.role`.

**Security-definer helpers** (`0012_subject_membership.sql`):

| Function | Reads |
|---|---|
| `is_admin()` | `exists(select 1 from profiles where id = auth.uid() and role = 'admin')` (`:59`) |
| `is_member_of_subject(p_school, p_subject)` | `exists(... subject_membership where profile_id = auth.uid() and school_id = p_school and subject_id = p_subject)` (`:72`) |
| `is_coordinator_of_subject(p_school, p_subject)` | same as above **and** `role = 'coordinator'` (`:87`) |

All three are `security definer`, `stable`, `set search_path = public` so they can
be referenced inside RLS policies without recursion.

**Coordinator / teacher roles** are per-space, stored on
`subject_membership.role` (`public.membership_role` enum = `teacher | coordinator`,
`0012:25,37`). A person can be teacher in one (centre, subject) space and
coordinator in another. This is orthogonal to the global `profiles.role`.

**Precise mechanism to make a user an admin:** set `profiles.role = 'admin'` for
that user id. `profiles` RLS is own-row `select`/`update` + co-member `select`
only (`0006_rls.sql:16‑23`, `0013`) — **there is no admin-write policy on
`profiles`**, so this cannot be done from any auth'd (browser) request today. It
must run through the service role (SQL editor) or a new `SECURITY DEFINER` RPC.

### One-liner to promote Connie (service role / Supabase SQL editor)

```sql
update public.profiles
set role = 'admin'
where id = '05077ec1-de1b-46ba-8199-dcb30b08bef1';
```

> Runs as service role in the SQL editor (bypasses RLS). To confirm:
> `select id, full_name, role from public.profiles where id = '05077ec1-de1b-46ba-8199-dcb30b08bef1';`

---

## 3. Subjects

**Schema** (`0002_core_tables.sql:10` + `0014_org_admin_columns.sql:19`):

```
subjects(
  id          uuid pk default gen_random_uuid(),
  name        text not null,
  code        text not null unique,
  created_at  timestamptz not null default now(),
  archived_at timestamptz            -- 0014, soft-archive marker
)
```

**What creating a subject requires:** a **bare row** (`name` + `code`). No
dependent rows are required. `code` is **system-derived, never user-entered** —
`createSubject()` slugs it from the name (`deriveSubjectCode`, `console.ts:133`:
`'English' → 'english'`) because it is the join key to
`curriculum_lesson.subject_code`. The handler already rejects a name that yields
no code and enforces case-insensitive `code` uniqueness. Curriculum rows do **not**
need to pre-exist — a new subject simply has no curriculum until imported.

**Is INSERT gated by RLS, and does an admin pass it?**
**No policy exists → the INSERT is rejected for everyone, admins included.**
`0006_rls.sql:30` defines only `subjects_select_authenticated` (SELECT `using
(true)`). There is **no** `insert`/`update`/`delete` policy on `subjects` in any
committed migration (grep of all `create policy … on public.subjects` returns the
SELECT policy only). With RLS enabled and no permissive INSERT policy, an auth'd
admin's `insert into subjects` fails with *"new row violates row-level security
policy for table subjects"*.

> ⚠️ **This is the blocker for create-subject.** The UI and handler are complete;
> the write dies at RLS. The same gap applies to `schools` and `classes` — they
> too are SELECT-only in the committed schema, so `createCentre` / `createClass`
> / the archive handlers would be blocked identically. **If** the live database
> has admin-write policies applied manually (this repo has precedent — 0014/0018/
> 0019 note DDL "applied manually by an operator in the Supabase SQL editor" and
> only committed afterward), those centre/class writes would work while the
> policy remains uncommitted. Either way the repo (the locked source of truth) is
> missing the policy and it must be committed. **Recommend George confirm the live
> `subjects` policies** — if create-centre works in production but create-subject
> doesn't, the live DB has a schools/classes admin-write policy but not one for
> subjects.

**Fix options (create subject):** add a committed admin-write RLS policy on
`subjects` (mirror `term_admin_insert`, `0026:102`) — this is the minimal fix and
makes the existing handler work as-is:

```sql
-- migration (illustrative — do NOT apply in Phase 0)
create policy subjects_admin_write on public.subjects
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
```

An RPC is **not** needed here (no privilege escalation, no cross-user PII, no
cascade) — an RLS policy is the right altitude.

---

## 4. Schools (centres)

**Schema** (`0002_core_tables.sql:4` + `0014_org_admin_columns.sql:17‑18`):

```
schools(
  id          uuid pk default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  region      text,                 -- 0014
  archived_at timestamptz           -- 0014, soft-archive marker
)
```

**FK dependents and ON DELETE behaviour** — every FK to `schools` is declared
**without** `on delete`, so all default to `NO ACTION` (RESTRICT):

| Dependent (column) | Nullable? | ON DELETE | Effect on `delete from schools` |
|---|---|---|---|
| `classes.school_id` (`0002:19`) | no | NO ACTION | **Blocks** delete if any class references the centre |
| `subject_membership.school_id` (`0012:35`) | no | NO ACTION | **Blocks** if anyone is a member of a space in that centre |
| `profiles.school_id` (`0002:34`, legacy) | yes | NO ACTION | **Blocks** if any profile still points at it (legacy column) |
| `lesson_plans.school_id` (scope column, added manually; see `0019`/`0028`) | yes | *verify* | Org-scoped plans store a raw `school_id`; confirm whether it carries a FK — if so, **blocks** too |

**Blast radius / is a hard delete safe?** **No.** A live centre with classes,
memberships, or plans cannot be hard-deleted — the RESTRICT FKs reject it. Forcing
it (adding `ON DELETE CASCADE`) would silently destroy classes, every teacher's
membership in that centre, and lesson-plan history — **destructive and
irreversible**. There is also **no `delete` RLS policy** on `schools`, so even a
dependency-free centre can't be deleted from an auth'd request today.

**Recommendation:** the app already models a centre lifecycle as **soft-delete**
(`archived_at` + the "reassign/archive classes first" guard in `archiveCentre`,
`console.ts:81‑91`). Hard delete should either be **declined in favour of the
existing archive**, or — if a true purge is genuinely wanted — implemented as a
`SECURITY DEFINER` RPC that (a) hard-gates on `is_admin()`, (b) refuses when any
dependent exists (never auto-cascades), and (c) is the only delete path (no
permissive client `delete` policy). **This is a destructive DB operation whose
cascade/soft-delete behaviour needs your decision before build.**

---

## 5. RLS blockers per capability

| Capability | Blocking policy / gap today | Fix class |
|---|---|---|
| **Create subject** | No INSERT policy on `subjects` (SELECT-only, `0006:30`). Handler + UI exist. | **RLS** (add `subjects_admin_write`) — then existing handler works |
| **Delete user** | `profiles` has no `delete` policy; deleting a *user* means deleting from `auth.users` (cascades to `profiles` via `0002:31`), which no auth'd client can ever do. Cross-user + auth-schema write. | **RPC** (`SECURITY DEFINER`, hard-gated on `is_admin()`, calls `auth.admin`-equivalent delete) **+ new UI**. Destructive — needs decision. |
| **Change permissions / role (per-space)** | **Already works.** `sm_admin_write` (`0012:112`, `FOR ALL` on `is_admin()`) backs `saveMembership` / `removeMembership`; `admin_list_users` (`0023`) surfaces zero-membership users. | **None** (shipped) |
| **Promote to admin (global role)** | No admin-write policy on `profiles` (own-row update only, `0006:20`). A user cannot elevate their own or anyone's `role`. | **RPC** (`SECURITY DEFINER`, `is_admin()`-gated, sets `profiles.role`; hardcode the target role literal — mirror the `complete_onboarding` "role hardcoded" pattern to prevent escalation) **+ new UI**. |
| **Delete school** | No `delete` policy on `schools`; RESTRICT FKs from classes/memberships/(plans) block a hard delete regardless. | **Decision first** → likely keep **soft-delete** (archive, already built), or **RPC** for a guarded purge **+ new UI**. Destructive. |

**On the `SECURITY DEFINER` pattern to mirror:** `0029_complete_onboarding_rpc.sql`
and `0023_admin_list_users.sql` are the templates — `security definer`, pinned
`set search_path = public`, `revoke execute … from public` + `grant execute … to
authenticated`, and a hard `is_admin()` gate that **raises** for non-admins.
Critically, `complete_onboarding` **hardcodes** `role = 'teacher'` and never
accepts a role/profile_id from the client — the same discipline must apply to a
promote-to-admin RPC (hardcode `'admin'`, take target id as the only arg) and a
delete-user RPC (gate + refuse-on-dependents), since both are privilege-sensitive.

---

## 6. Verdict per capability

| Capability | UI exists? | Data/RLS path exists? | What's needed |
|---|---|---|---|
| **Create subject** | ✅ Yes (`SubjectsTab` form + `createSubject`) | ❌ No — `subjects` has no INSERT policy | **RLS + Migration**: add `subjects_admin_write` policy; existing handler then works. No new UI. |
| **Delete user** | ❌ No | ❌ No — no path; touches `auth.users` | **RPC + Migration + New layout → Claude Design**. ⚠️ Destructive — decision needed. |
| **Change permissions / role (per-space)** | ✅ Yes | ✅ Yes (`sm_admin_write` + `saveMembership`) | **None** — already functional. |
| **Promote to admin (global)** | ❌ No | ❌ No — no admin-write on `profiles` | **RPC + Migration + New layout → Claude Design** (add an admin toggle/affordance). Interim: the §2 one-liner. |
| **Delete school** | ⚠️ Soft-delete only (Archive) | ❌ No hard-delete path (no `delete` policy; RESTRICT FKs) | **Decision first**: keep archive (recommended) or build guarded **RPC + New layout → Claude Design**. ⚠️ Destructive cascade. |

---

## Flags for George (STOP conditions)

- **Needs new UI layout → route through Claude Design before build:**
  **delete user**, **promote to admin**, and **hard delete school** (if pursued).
  Create-subject and per-space role changes need **no** new layout.
- **Destructive DB operations needing a cascade / soft-delete decision:**
  **delete user** (cascades `profiles` → all their plans' authorship, memberships)
  and **delete school** (RESTRICT today; any cascade destroys classes +
  memberships + plan history). Recommendation: prefer the existing **archive**
  soft-delete for schools; if a true purge is required, gate it behind an
  `is_admin()` `SECURITY DEFINER` RPC that refuses when dependents exist.
- **Verify before building create-subject:** confirm whether the live DB already
  carries admin-write policies on `schools`/`classes` (applied manually per the
  0014/0018/0019 provenance notes) but **not** on `subjects` — that would explain
  "centres work, subjects don't." The committed repo lacks all three; the fix is
  to commit the `subjects` (and, for parity, `schools`/`classes`) admin-write
  policies.
- **Promote-to-admin one-liner** for Connie (uid
  `05077ec1-de1b-46ba-8199-dcb30b08bef1`) is in §2.

*No code changed and no migrations applied in this pass — audit only.*
