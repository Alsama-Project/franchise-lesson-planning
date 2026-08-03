-- 20260803093441_applied_migration_ledger.sql
-- A hand-maintained ledger of which migration files have been applied.
--
-- Migrations here are applied by hand in the Supabase SQL editor, NOT by the
-- Supabase CLI. `supabase_migrations.schema_migrations` therefore never exists,
-- and until now nothing recorded which files had actually been run. This table
-- is that record.
--
-- The table has ALREADY been created by hand in the live database, so this file
-- is idempotent throughout (`create table if not exists`, `drop policy if
-- exists`, `on conflict do nothing`): it exists to make the object legible in
-- the repo, not to create it fresh, and re-running it is safe.
--
-- This is also the first migration to use the new
-- `YYYYMMDDHHMMSS_short_name.sql` naming convention. See
-- supabase/migrations/README.md.

create table if not exists applied_migration (
  filename    text primary key,
  applied_at  timestamptz not null default now(),
  applied_by  text not null default current_user,
  note        text
);

alter table applied_migration enable row level security;

-- Admin-only for all commands, matching the ai_context_doc pattern (0063).
drop policy if exists applied_migration_admin on applied_migration;
create policy applied_migration_admin on applied_migration
  for all using (is_admin()) with check (is_admin());

comment on table applied_migration is
  'Hand-maintained record of migrations applied through the Supabase SQL editor. Migrations here are applied by hand, not by the Supabase CLI, so supabase_migrations.schema_migrations does not exist. Every hand-apply MUST insert its own row (see supabase/migrations/README.md).';

-- NOTE: writeback_worksheet_exercise() is defined twice in the repo —
-- 0070_worksheet_writeback.sql and 0071_writeback_uploaded_by_fallback.sql —
-- differing only in the uploaded_by value. Both filenames are backfilled below
-- because both files exist in the repo; which definition is currently live is
-- being confirmed separately and is out of scope for this ledger.

-- Backfill: one row per migration file present on `main` at the time this
-- ledger was authored, read directly from the directory listing. Excluded:
-- the resources curriculum-lesson-key change (resources.curriculum_lesson_id →
-- text, on the unmerged claude/writeback-curriculum-key branch; confirmed
-- absent from the live schema) and anything else not present on `main`.
insert into applied_migration (filename, note)
values
  ('0001_init_enums.sql'),
  ('0002_core_tables.sql'),
  ('0003_lesson_plans.sql'),
  ('0004_activity_bank.sql'),
  ('0005_handle_new_user.sql'),
  ('0006_rls.sql'),
  ('0007_activity_bank_unique.sql'),
  ('0008_resource_bank.sql'),
  ('0009_lesson_plans_worksheet_materials.sql'),
  ('0010_curriculum_lesson.sql'),
  ('0012_subject_membership.sql'),
  ('0013_profiles_comember_read.sql'),
  ('0014_org_admin_columns.sql'),
  ('0015_curriculum_import_fields.sql'),
  ('0016_ai_resource_guide.sql'),
  ('0017_lesson_plans_weekday.sql'),
  ('0018_remove_class_group.sql'),
  ('0019_lesson_plans_visibility_no_class.sql'),
  ('0020_smartt_objective_guide.sql'),
  ('0021_guidance_original_filename.sql'),
  ('0022_plan_comments.sql'),
  ('0023_admin_list_users.sql'),
  ('0024_backfill_english_monthly_lo_grammar_vocabulary.sql'),
  ('0025_plan_comments_member_select.sql'),
  ('0026_term_calendar.sql'),
  ('0027_plan_events.sql'),
  ('0028_lesson_plans_per_teacher_unique.sql'),
  ('0029_complete_onboarding_rpc.sql'),
  ('0030_backfill_english_classes_years.sql'),
  ('0030_impersonation_personas.sql'),
  ('0031_admin_write_org_structure.sql'),
  ('0031_set_my_classes_rpc.sql'),
  ('0032_user_deactivation.sql'),
  ('0033_enforce_deactivation.sql'),
  ('0034_list_users_admin.sql'),
  ('0035_user_admin_write_rpcs.sql'),
  ('0036_set_user_impersonation.sql'),
  ('0037_list_users_admin_space_ids.sql'),
  ('0038_list_users_admin_can_impersonate.sql'),
  ('0039_impersonation_role_toggle.sql'),
  ('0040_coordinator_subject.sql'),
  ('0041_coordinator_subject_backfill.sql'),
  ('0042_active_subject_space.sql'),
  ('0043_coordinator_requests.sql'),
  ('0044_curriculum_sync_run_warnings.sql'),
  ('0045_plan_annotations.sql'),
  ('0046_list_subject_members.sql'),
  ('0046_plan_annotation_delete.sql'),
  ('0047_curriculum_active_subjects.sql'),
  ('0048_lesson_plans_soft_delete.sql'),
  ('0049_curriculum_outcome_columns.sql'),
  ('0050_curriculum_taxonomy_aggregates.sql'),
  ('0051_curriculum_topic_threads.sql'),
  ('0052_curriculum_taxonomy_coverage.sql'),
  ('0053_curriculum_taxonomy_coverage_real.sql'),
  ('0054_curriculum_import_provenance.sql'),
  ('0055_curriculum_hours_by_linguistic_skill.sql'),
  ('0056_curriculum_versioning.sql'),
  ('0057_lesson_plans_subject_visibility.sql'),
  ('0058_born_approved_insert_guard.sql'),
  ('0059_curriculum_lesson_key_version_scoped_unique.sql'),
  ('0060_set_primary_space_ambiguous_column_fix.sql'),
  ('0061_fold_check_homework_into_recap.sql'),
  ('0061_subjects_content_language.sql'),
  ('0062_class_usage_counts.sql'),
  ('0062_term_calendar_school_year.sql'),
  ('0062_worksheet_template.sql'),
  ('0063_ai_context_stack.sql'),
  ('0063_curriculum_subject_shape.sql'),
  ('0064_context_stack_backfill.sql'),
  ('0065_seed_context_stack.sql'),
  ('0066_ai_context_doc_mutations.sql'),
  ('0066_drop_curriculum_subject_shape.sql'),
  ('0067_worksheet_exercise.sql'),
  ('0070_ai_context_tool_worksheet_image.sql'),
  ('0070_resources_ai_insert_admin.sql'),
  ('0070_worksheet_writeback.sql'),
  ('0071_seed_worksheet_image_context_doc.sql'),
  ('0071_writeback_uploaded_by_fallback.sql'),
  ('0072_worksheet_image.sql')
on conflict (filename) do nothing;

-- This migration records itself, per the going-forward convention.
insert into applied_migration (filename, note)
values ('20260803093441_applied_migration_ledger.sql', null)
on conflict (filename) do nothing;
