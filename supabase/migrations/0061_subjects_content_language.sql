-- 0061_subjects_content_language.sql
-- Subject content language — the language the SUBJECT is taught and produced in.
--
-- WHY: the student worksheet (the A4 preview and its printed/PDF output) is a
-- CONTENT-LANGUAGE artifact. Its scaffold (STUDENT WORKSHEET, Name/Date/Class, the
-- objective prefix, "Exercise N", the footer) must follow the SUBJECT's language —
-- an Arabic-subject worksheet stays Arabic for an English-UI teacher, and an
-- English-subject worksheet stays English for an Arabic-UI teacher — NOT the
-- teacher's NEXT_LOCALE UI cookie. That decision needs a first-class, per-subject
-- fact; language must never be inferred from the subject code or name in code.
-- This column is the single source of truth for a subject's content language.
--
-- Scope today: 'en' | 'ar'. English-medium subjects stay 'en' (the default, so no
-- existing row changes behaviour); Arabic-medium subjects are flipped to 'ar' via
-- the template below. Widen the CHECK when a third content language goes live.
--
-- PROVENANCE: authored in repo so the schema stays the locked source of truth and a
-- local `supabase db reset` reproduces it. NOT executed by this change — George
-- applies it (and the data flips below) by hand in the Supabase SQL editor, matching
-- the by-hand convention of 0010/0015/0024/0044/0047.

alter table public.subjects
  add column if not exists content_language text not null default 'en'
    check (content_language in ('en', 'ar'));

comment on column public.subjects.content_language is
  'The language the subject''s content is taught/produced in (''en'' | ''ar''). Drives the student-worksheet artifact scaffold language. Single source of truth — never inferred from code/name.';

-- ── DATA: flip the Arabic-medium subjects (edit + run by hand) ────────────────
-- Every subject defaults to 'en' after the DDL above. Uncomment the line for each
-- subject that is TAUGHT IN ARABIC and run it. Leave English-medium subjects as-is.
--
-- The codes below are the known curriculum subject codes at time of authoring; the
-- only one seeded locally is 'english'. BEFORE running, reconcile this list against
-- the live table so no subject is missed or misspelled:
--     select code, name, content_language from public.subjects order by code;
--
-- -- UPDATE public.subjects SET content_language = 'ar' WHERE code = 'arabic';
-- -- UPDATE public.subjects SET content_language = 'en' WHERE code = 'english';
-- -- UPDATE public.subjects SET content_language = 'en' WHERE code = 'science';
-- -- UPDATE public.subjects SET content_language = 'en' WHERE code = 'maths';
-- -- UPDATE public.subjects SET content_language = 'en' WHERE code = 'it';
-- -- UPDATE public.subjects SET content_language = 'en' WHERE code = 'yoga';
-- -- UPDATE public.subjects SET content_language = 'en' WHERE code = 'professionalism';
