# Migrations

Read this before authoring a new migration.

## How migrations are applied

Migrations are **applied by hand in the Supabase SQL editor by George.** The
Supabase CLI is not used to apply them, so `supabase_migrations.schema_migrations`
does not exist. Sessions **author** numbered `.sql` files and **never execute
them** — no connecting to the database, no running SQL.

Which files have been applied is tracked in the `applied_migration` table (a
hand-maintained ledger; see `20260803093441_applied_migration_ledger.sql`).

## Naming new files

New migrations use the Supabase CLI convention:

```
YYYYMMDDHHMMSS_short_name.sql
```

This sorts correctly and cannot collide between parallel sessions. Existing
integer-prefixed files (`0001`–`0072`) are **historical**: they are referenced
by number across PRs, handovers and status docs, so they are **never renamed**.
Do not renumber them.

## Every migration records itself

So that applying a migration also records it in the same paste, every migration
must **end with its own ledger insert**:

```sql
insert into applied_migration (filename, note)
values ('YYYYMMDDHHMMSS_name.sql', null)
on conflict (filename) do nothing;
```

## Known quirks in the historical (integer-prefixed) files

**Duplicate prefixes — always refer to a migration by its full filename, never
by number alone.** Nine prefixes have collisions from parallel sessions;
`0070` is shared by three files and `0071` by two, so a bare number is
ambiguous:

- `0030` — `0030_backfill_english_classes_years.sql`, `0030_impersonation_personas.sql`
- `0031` — `0031_admin_write_org_structure.sql`, `0031_set_my_classes_rpc.sql`
- `0046` — `0046_list_subject_members.sql`, `0046_plan_annotation_delete.sql`
- `0061` — `0061_fold_check_homework_into_recap.sql`, `0061_subjects_content_language.sql`
- `0062` — `0062_class_usage_counts.sql`, `0062_term_calendar_school_year.sql`, `0062_worksheet_template.sql`
- `0063` — `0063_ai_context_stack.sql`, `0063_curriculum_subject_shape.sql`
- `0066` — `0066_ai_context_doc_mutations.sql`, `0066_drop_curriculum_subject_shape.sql`
- `0070` — `0070_ai_context_tool_worksheet_image.sql`, `0070_resources_ai_insert_admin.sql`, `0070_worksheet_writeback.sql`
- `0071` — `0071_seed_worksheet_image_context_doc.sql`, `0071_writeback_uploaded_by_fallback.sql`

**Unused / missing numbers:**

- `0068` and `0069` are unused — no file has those prefixes. `0069` was a
  superseded image migration that was **deliberately deleted** and **must never
  be applied**.
- `0011` is missing and has been for a long time. Not a concern.
