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
