-- 0024_backfill_english_monthly_lo_grammar_vocabulary.sql
--
-- DATA BACKFILL (not a schema migration). Populates the curriculum_lesson
-- `monthly_lo` and `grammar_vocabulary` columns for English, which were added by
-- 0015 but never backfilled — so the editor's cream curriculum panels render blank
-- in production for those fields.
--
-- PROVENANCE: generated from the source workbook
--   "Alsama_English_Curriculum (JUNE 2025)", sheet "English Curriculum"
-- by the SAME importer the app uses (src/lib/curriculum/parse.ts ->
-- parseCurriculumWorkbook): schema-drift-resilient header matching by meaning, the
-- bilingual alias dictionary, grain detection, and the taxonomy-composed lesson_key.
-- monthly_lo = "Monthly Learning Outcome" (col J), grammar_vocabulary = "Content
-- covered within grammar" (col Y). No values are hand-authored.
--
-- HOW TO APPLY: George runs this in the Supabase SQL editor. The DB is never written
-- by the agent. Like 0010/0015 it is committed for repo provenance and a local
-- `supabase db reset` (where it no-ops until curriculum_lesson is populated).
--
-- SAFETY:
--   * Idempotent — each statement matches the stable, unique `lesson_key` and sets
--     authoritative source values; safe to re-run, result is the same.
--   * Scoped to English (subject_code = 'english').
--   * Only columns with non-empty source content are set, per row — an empty source
--     cell is skipped, never blanking an existing value.
--   * A lesson_key absent from the table updates 0 rows (harmless no-op).
--
-- Generated rows: 1190 UPDATEs (1190 set monthly_lo, 875 set grammar_vocabulary).
-- 140 source records lack the year/month/week needed by curriculum_lesson and have no row to update.

begin;

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W1|P1';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W1|P2';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W1|P3';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W1|P4';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W1|P5';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W2|P1';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W2|P2';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W2|P3';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W2|P4';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W2|P5';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W3|P1';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W3|P2';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W3|P3';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W3|P4';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.', grammar_vocabulary = 'Understanding of ''I am'' as the verb ''to be'' (without introducing the grammar and full rule)'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W3|P5';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.', grammar_vocabulary = 'Subject pronouns (I/ you/ he/ she/ we/ they)'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W4|P1';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.', grammar_vocabulary = 'Subject pronouns (I/ you/ he/ she/ we/ they)'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W4|P2';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.', grammar_vocabulary = 'Subject pronouns (I/ you/ he/ she/ we/ they)'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W4|P3';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.', grammar_vocabulary = 'Subject pronouns (I/ you/ he/ she/ we/ they)'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W4|P4';

update public.curriculum_lesson set monthly_lo = 'Skills
. Recognize and name some English letters.

. Begin to copy about 10 familiar words.

. Show awareness that written symbols represent sounds.

. Listen to and repeat simple words and sounds.

Knowledge
. All the vowels, y, n, t, d, h, c - and the numbers 1-15.
. Simple greetings, introductions, and her name.', grammar_vocabulary = 'Subject pronouns (I/ you/ he/ she/ we/ they)'
  where subject_code = 'english' and lesson_key = 'english|Y0|February|W4|P5';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words'
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W5|P1';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words'
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W5|P2';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Yes/ no'
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W5|P3';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Yes/ no'
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W5|P4';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words'
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W5|P5';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Verb ''to be'', aurally'
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W6|P1';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Verb ''to be'', aurally'
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W6|P2';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Verb ''to be'', aurally'
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W6|P3';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Verb ''to be'', aurally'
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W6|P4';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Verb ''to be'', aurally'
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W6|P5';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Question words (what, when, where, why, how, how many)'
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W7|P1';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Question words (what, when, where, why, how, how many)'
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W7|P2';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Question words (what, when, where, why, how, how many)'
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W7|P3';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Question words (what, when, where, why, how, how many)'
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W7|P4';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Question words (what, when, where, why, how, how many)'
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W7|P5';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Written knowledge of verb ''to be'''
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W8|P1';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Written knowledge of verb ''to be'''
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W8|P2';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Written knowledge of verb ''to be'''
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W8|P3';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Written knowledge of verb ''to be'''
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W8|P4';

update public.curriculum_lesson set monthly_lo = 'Skills

 . Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. Letters i, k, s, sh, f, l, p, w, th, b ,ch, k, z, v, y, x
. The verb ''to be'', question words', grammar_vocabulary = 'Written knowledge of verb ''to be'''
  where subject_code = 'english' and lesson_key = 'english|Y0|March|W8|P5';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = 'I have'''
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W9|P1';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = 'Adding ''s'' for plurals/'
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W9|P2';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = 'I have'''
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W9|P3';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = 'I have'''
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W9|P4';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = 'I have'''
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W9|P5';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes'
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W10|P1';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = 'Familiarity with the word ''not'''
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W10|P2';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = 'Understanding of how to negate the verb ''to be''.'
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W10|P3';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = 'This is/ these are'
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W10|P4';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = 'Knowledge of the existence of articles ''the'' and ''a'', without understanding their difference'
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W10|P5';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = '. Ability to use adjectives to describe things'
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W11|P1';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = '. Ability to use adjectives to describe things'
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W11|P2';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = '. Ability to use adjectives to describe things'
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W11|P3';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = '. Ability to use adjectives to describe things'
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W11|P4';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = '. Ability to use adjectives to describe things'
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W11|P5';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes'
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W12|P1';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes'
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W12|P2';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = '. Knolwedge of prepositions of place (on, under, above, beside)'
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W12|P3';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = '. Ability to use prepositions of place'
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W12|P4';

update public.curriculum_lesson set monthly_lo = 'Skills

. Sound out and read new, simple words using phonics.

. Begin using everyday vocabulary in speaking and writing.

. Write short, familiar words independently.

. Understand simple oral sentences and answer basic questions.

Knowledge

. I have, plurals, negation of the verb ''to be'', adjectives, prepositions of place
. Family, animals, colours, clothes', grammar_vocabulary = '. Ability to use prepositions of place'
  where subject_code = 'english' and lesson_key = 'english|Y0|April|W12|P5';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W13|P1';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W13|P2';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks', grammar_vocabulary = '. Ability to use object pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W13|P3';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks', grammar_vocabulary = '. Ability to differentiate between subject and object pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W13|P4';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks', grammar_vocabulary = '. Ability to differentiate between subject and object pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W13|P5';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks', grammar_vocabulary = '. Knowledge of some basic verbs related to food'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W14|P1';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks', grammar_vocabulary = '. Knowledge of the rules of the present simple'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W14|P2';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks', grammar_vocabulary = '. Ability to form sentences in the present simple'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W14|P3';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks', grammar_vocabulary = '. Ability to form sentences in the present simple'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W14|P4';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks', grammar_vocabulary = '. Ability to form sentences in the present simple'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W14|P5';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W15|P1';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W15|P2';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks', grammar_vocabulary = '. Present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W15|P3';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks', grammar_vocabulary = '. Present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W15|P4';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks', grammar_vocabulary = '. Present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W15|P5';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W16|P1';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks', grammar_vocabulary = 'Basic conjunctions (and, but, so), with the present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W16|P2';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks', grammar_vocabulary = 'Basic conjunctions (and, but, so), with the present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W16|P3';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks', grammar_vocabulary = 'Basic conjunctions (and, but, so), with the present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W16|P4';

update public.curriculum_lesson set monthly_lo = 'Skills

. Connect words to form simple subject-verb-object sentences.

. Read short predictable texts with guidance.

. Write brief sentences about familiar topics with support.

. Participate in simple conversations using learned vocabulary.

Knowledge

. object pronouns, presen simple, present continuous, conjunctions
. the body and the face, transport, school, food and drinks', grammar_vocabulary = '. Present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y0|May|W16|P5';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W17|P1';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W17|P2';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W17|P3';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'I like/ i dont like'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W17|P4';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'I like/ i dont like'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W17|P5';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'There is/ there are'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W18|P1';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'There is/ there are'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W18|P2';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'There is/ there are'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W18|P3';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'There is/ there are'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W18|P4';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'There is/ there are'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W18|P5';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'Mixed'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W19|P1';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'Mixed'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W19|P2';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'Mixed'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W19|P3';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'Mixed'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W19|P4';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'Mixed'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W19|P5';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'Ability to make sentences using ''I like + ing verb'' structure'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W20|P1';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'Ability to make sentences using ''I like + ing verb'' structure'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W20|P2';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'Ability to make sentences using ''I like + ing verb'' structure'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W20|P3';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'Ability to make sentences using ''I like + ing verb'' structure'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W20|P4';

update public.curriculum_lesson set monthly_lo = 'Skills 

. Read and understand short illustrated stories.

. Follow the main ideas in simple spoken conversations.

. Write a few connected sentences describing people, places, and daily routines.

. Begin to ask and answer simple questions about familiar topics.

Knowledge
.  I like/ i don''t like, there is/ there are, I like + verb+ing
. Weather, the home, sports, hobbies 
.', grammar_vocabulary = 'Ability to make sentences using ''I like + ing verb'' structure'
  where subject_code = 'english' and lesson_key = 'english|Y0|June|W20|P5';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'Simple Present Review'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W3|P1';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'Simple Present Review'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W3|P2';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'Simple Present Review'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W3|P3';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'Simple Present Review'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W3|P4';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'Simple Present Review'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W3|P5';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'Present simple - negation'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W4|P1';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'Present simple - negation'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W4|P2';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'Present simple - questions'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W4|P3';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'Present simple - questions'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W4|P4';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'Present simple - negation and questions'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W4|P5';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'Possessive pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W5|P1';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'Possessive pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W5|P2';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'Possessive pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W5|P3';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'Possessive pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W5|P4';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'Possessive pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W5|P5';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'Present continuous review'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W6|P1';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'negating present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W6|P2';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'asking questions in the present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W6|P3';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions', grammar_vocabulary = 'present continuous - all forms'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W6|P4';

update public.curriculum_lesson set monthly_lo = 'Skill

Describe people, actions, and her own belongings using the simple present and present continuous (including negatives), colours, and possessive pronouns, and order food and say what she is eating in an English-speaking restaurant, using short spoken and written texts and guided gap-fill activities. 

Knowledge

Knowledge of vocabulary pertaining to family and friends, colours, and food and drink
Knowledge of how to form the present simple and continuous tenses, as well as their negatives and questions'
  where subject_code = 'english' and lesson_key = 'english|Y1|September|W6|P5';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'Prepositions of place'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W7|P1';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'Prepositions of place'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W7|P2';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'Prepositions of place'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W7|P3';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'Prepositions of place'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W7|P4';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'Prepositions of place'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W7|P5';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'countable and uncountable nouns'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W8|P1';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'countable and uncountable nouns'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W8|P2';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'countable and uncountable nouns'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W8|P3';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'countable and uncountable nouns'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W8|P4';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'countable and uncountable nouns'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W8|P5';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'Prepositions of time'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W9|P1';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'Prepositions of time'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W9|P2';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'Prepositions of time'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W9|P3';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'Prepositions of time'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W9|P4';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'Prepositions of time'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W9|P5';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'Adverbs of frequency'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W10|P1';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'Adverbs of frequency'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W10|P2';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'Adverbs of frequency'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W10|P3';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'Adverbs of frequency'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W10|P4';

update public.curriculum_lesson set monthly_lo = 'Skill

Take part in simple conversations and complete written tasks about familiar contexts (animals, home, sports) by asking and answering questions and describing locations, quantities, and routines.

Knowledge

Knowledge of vocbulary pertaining to animals, the home, and sports
Knowledge of the use of prepositions of place and time, adverbs of frequency, and the difference between countable and uncountable nouns', grammar_vocabulary = 'Adverbs of frequency'
  where subject_code = 'english' and lesson_key = 'english|Y1|October|W10|P5';

update public.curriculum_lesson set monthly_lo = 'Skill
Use familiar vocabulary, common verbs, present-tense negation, future structures, and phrases such as “I would like to” to understand short simple texts, answer questions, complete gapped tasks, spell familiar words heard aurally, and produce short connected spoken and written phrases about familiar topics.

Knowledge
Have knowledge of A1-related vocabulary related to clothes, common verbs, daily routines, and familiar activities, as well as the basic structures used to form present simple and present continuous negation, express preferences with “I would like to”, and describe planned future actions.', grammar_vocabulary = 'negation of the present simple'
  where subject_code = 'english' and lesson_key = 'english|Y1|March|W1|wk';

update public.curriculum_lesson set monthly_lo = 'Skill
Use familiar vocabulary, common verbs, present-tense negation, future structures, and phrases such as “I would like to” to understand short simple texts, answer questions, complete gapped tasks, spell familiar words heard aurally, and produce short connected spoken and written phrases about familiar topics.

Knowledge
Have knowledge of A1-related vocabulary related to clothes, common verbs, daily routines, and familiar activities, as well as the basic structures used to form present simple and present continuous negation, express preferences with “I would like to”, and describe planned future actions.', grammar_vocabulary = 'negation of the continuous tense'
  where subject_code = 'english' and lesson_key = 'english|Y1|March|W10|wk';

update public.curriculum_lesson set monthly_lo = 'Endline Evaluation'
  where subject_code = 'english' and lesson_key = 'english|Y2|August|W1|wk';

update public.curriculum_lesson set monthly_lo = 'Endline Evaluation'
  where subject_code = 'english' and lesson_key = 'english|Y2|August|W2|wk';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W3|P1';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Simple tense review (present)'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W3|P2';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Simple tense review (present)'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W3|P3';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Simple tense review (present)'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W3|P4';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Simple tense review (present)'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W3|P5';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Simple tense review (past)'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W4|P1';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Simple tense review (past)'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W4|P2';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Simple tense review (past)'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W4|P3';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Simple tense review (past)'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W4|P4';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Simple tense review (past)'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W4|P5';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Comparatives and superlatives'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W5|P1';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Comparatives and superlatives'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W5|P2';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Comparatives and superlatives'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W5|P3';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Comparatives and superlatives'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W5|P4';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Comparatives and superlatives'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W5|P5';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Mixing simple tenses'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W6|P1';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Mixing simple tenses'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W6|P2';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Mixing simple tenses'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W6|P3';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.', grammar_vocabulary = 'Mixing simple tenses'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W6|P4';

update public.curriculum_lesson set monthly_lo = 'Be able to write a short letter that gives personal information about her family and friends and the hobbies they take part in, using a variety of simple tenses as well as comparative adjectives to enhance her writing.'
  where subject_code = 'english' and lesson_key = 'english|Y2|September|W6|P5';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Prepositions of place'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W7|P1';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Prepositions of place'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W7|P2';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Prepositions of place'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W7|P3';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Prepositions of place'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W7|P4';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Prepositions of place'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W7|P5';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Imperatives'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W8|P1';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Imperatives'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W8|P2';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Imperatives'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W8|P3';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Imperatives'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W8|P4';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Imperatives'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W8|P5';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Future simple (will)'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W9|P1';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Future simple (will)'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W9|P2';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Future simple (will)'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W9|P3';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Future simple (will)'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W9|P4';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Future simple (will)'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W9|P5';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Future simple (going to)'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W10|P1';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Future simple (going to)'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W10|P2';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Future simple (going to)'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W10|P3';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Future simple (going to)'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W10|P4';

update public.curriculum_lesson set monthly_lo = 'Students will be able to understand simple instructions related to home and shopping, as well as comprehending slightly longer texts and audios with the help of pictures and using descriptive language to enhance her writing where possible.', grammar_vocabulary = 'Future simple (going to)'
  where subject_code = 'english' and lesson_key = 'english|Y2|October|W10|P5';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W11|P1';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W11|P2';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W11|P3';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W11|P4';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W11|P5';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Past continuous'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W12|P1';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Past continuous'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W12|P2';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Past continuous'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W12|P3';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Past continuous'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W12|P4';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Past continuous'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W12|P5';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Prepositions of time'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W13|P1';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Prepositions of time'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W13|P2';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Prepositions of time'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W13|P3';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Prepositions of time'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W13|P4';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Prepositions of time'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W13|P5';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Adverbs of frequency'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W14|P1';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Adverbs of frequency'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W14|P2';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Adverbs of frequency'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W14|P3';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Adverbs of frequency'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W14|P4';

update public.curriculum_lesson set monthly_lo = 'Write longer texts describing key aspects of her life, adding information such as when and how often by using prepositions and adverbs.', grammar_vocabulary = 'Adverbs of frequency'
  where subject_code = 'english' and lesson_key = 'english|Y2|November|W14|P5';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Singular and plural nouns'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W15|P1';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Singular and plural nouns'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W15|P2';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Singular and plural nouns'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W15|P3';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Singular and plural nouns'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W15|P4';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Singular and plural nouns'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W15|P5';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Countable and uncountable nouns'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W16|P1';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Countable and uncountable nouns'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W16|P2';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Countable and uncountable nouns'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W16|P3';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Countable and uncountable nouns'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W16|P4';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Countable and uncountable nouns'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W16|P5';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'determiners'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W17|P1';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'determiners'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W17|P2';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'determiners'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W17|P3';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'determiners'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W17|P4';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'determiners'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W17|P5';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Can and could'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W18|P1';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Can and could'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W18|P2';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Can and could'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W18|P3';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Can and could'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W18|P4';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Can and could'
  where subject_code = 'english' and lesson_key = 'english|Y2|December|W18|P5';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Articles'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W19|P1';

update public.curriculum_lesson set monthly_lo = 'Use everyday vocabulary for the home and town along with correct singular, plural, countable, and uncountable noun forms to understand key information in short texts and dialogues, explain main ideas verbally, complete guided language tasks, and communicate in simple real-life situations such as asking for directions or giving basic instructions.', grammar_vocabulary = 'Articles'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W19|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Articles'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W19|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Articles'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W19|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Articles'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W19|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Modals (should/must/need/ have got to)'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W20|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Modals (should/must/need/ have got to)'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W20|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Modals (should/must/need/ have got to)'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W20|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Modals (should/must/need/ have got to)'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W20|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Modals (should/must/need/ have got to)'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W20|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Modals (should/must/need/ have got to)'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W21|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Modals (should/must/need/ have got to)'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W21|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Modals (should/must/need/ have got to)'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W21|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Modals (should/must/need/ have got to)'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W21|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Modals (should/must/need/ have got to)'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W21|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Quantifiers (much, many, some, any)'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W22|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Quantifiers (much, many, some, any)'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W22|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Quantifiers (much, many, some, any)'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W22|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Quantifiers (much, many, some, any)'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W22|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to understand gist and key information in short everyday texts and use basic modals and quantifiers to describe routines, places, and give simple advice in speaking and writing.', grammar_vocabulary = 'Quantifiers (much, many, some, any)'
  where subject_code = 'english' and lesson_key = 'english|Y2|January|W22|P5';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Gerunds after verbs and nouns'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W23|P1';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Gerunds after verbs and nouns'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W23|P2';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Gerunds after verbs and nouns'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W23|P3';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Gerunds after verbs and nouns'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W23|P4';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Gerunds after verbs and nouns'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W23|P5';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W24|P1';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W24|P2';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W24|P3';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W24|P4';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W24|P5';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Full stops and capital letters'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W25|P1';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Full stops and capital letters'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W25|P2';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Full stops and capital letters'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W25|P3';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Full stops and capital letters'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W25|P4';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Full stops and capital letters'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W25|P5';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Ability to avoid run-on sentences'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W26|P1';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Ability to avoid run-on sentences'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W26|P2';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Ability to avoid run-on sentences'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W26|P3';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Ability to avoid run-on sentences'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W26|P4';

update public.curriculum_lesson set monthly_lo = 'Understand, interpret, and produce short spoken and written texts with growing control of sentence structure, including accurate punctuation, clear sentence boundaries, and consistent tense in simple narratives and descriptions.', grammar_vocabulary = 'Clauses and simple commas (e.g. before fanboys)'
  where subject_code = 'english' and lesson_key = 'english|Y2|February|W26|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Adverbs of manner and degree'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W27|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Adverbs of manner and degree'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W27|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Adverbs of manner and degree'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W27|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Adverbs of manner and degree'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W27|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Adverbs of manner and degree'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W27|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Forming questions in different tenses'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W28|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Forming questions in different tenses'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W28|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Forming questions in different tenses'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W28|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Forming questions in different tenses'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W28|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Forming questions in different tenses'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W28|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Relative clauses to link ideas'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W29|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Relative clauses to link ideas'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W29|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Relative clauses to link ideas'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W29|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Relative clauses to link ideas'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W29|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Relative clauses to link ideas'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W29|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Simple connective'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W30|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Simple connective'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W30|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Simple connective'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W30|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Simple connective'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W30|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about familiar topics using clearer A2 sentences, showing progress in forming questions, linking ideas with simple connectives or relative clauses, and organising short texts with basic punctuation and structure.', grammar_vocabulary = 'Simple connective'
  where subject_code = 'english' and lesson_key = 'english|Y2|March|W30|P5';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Prepositional phrases and directions'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W31|P1';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Prepositional phrases and directions'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W31|P2';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Prepositional phrases and directions'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W31|P3';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Prepositional phrases and directions'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W31|P4';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Prepositional phrases and directions'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W31|P5';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Indefinites, some, many, any'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W32|P1';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Indefinites, some, many, any'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W32|P2';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Indefinites, some, many, any'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W32|P3';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Indefinites, some, many, any'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W32|P4';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Indefinites, some, many, any'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W32|P5';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Indefinites - something, anything, nothing'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W33|P1';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Indefinites - something, anything, nothing'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W33|P2';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Indefinites - something, anything, nothing'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W33|P3';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Indefinites - something, anything, nothing'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W33|P4';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Indefinites - something, anything, nothing'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W33|P5';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Genitives'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W34|P1';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Genitives'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W34|P2';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Genitives'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W34|P3';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---', grammar_vocabulary = 'Genitives'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W34|P4';

update public.curriculum_lesson set monthly_lo = 'Read, talk, and write about familiar topics such as travel, transport, and countryside life using clear A2 sentences that show growing control of basic grammar, including prepositional phrases, simple indefinites, something/anything/nothing, and the use of commas to organise short ideas.

---'
  where subject_code = 'english' and lesson_key = 'english|Y2|April|W34|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Posessives'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W35|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Posessives'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W35|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Posessives'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W35|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Posessives'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W35|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Posessives'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W35|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Demonstratives'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W36|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Demonstratives'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W36|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Demonstratives'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W36|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Demonstratives'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W36|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Demonstratives'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W36|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W37|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W37|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W37|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W37|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W37|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Used to'' to show habit'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W38|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Used to'' to show habit'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W38|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Used to'' to show habit'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W38|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Used to'' to show habit'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W38|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about everyday topics and basic documents using clear A2 sentences that show growing control of common grammar such as possessives, demonstratives, and used to, alongside the vocabulary needed to describe people, nature, and simple work-related information.', grammar_vocabulary = 'Used to'' to show habit'
  where subject_code = 'english' and lesson_key = 'english|Y2|May|W38|P5';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W39|P1';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W39|P2';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W39|P3';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W39|P4';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W39|P5';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W40|P1';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W40|P2';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W40|P3';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W40|P4';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W40|P5';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W41|P1';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.', grammar_vocabulary = 'Mixed tenses/ participles as adjectives/ prepositions and connectives review'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W41|P2';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W41|P3';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W41|P4';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W41|P5';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W42|P1';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W42|P2';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W42|P3';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W42|P4';

update public.curriculum_lesson set monthly_lo = 'Produce clear A2 exam-style responses in reading, listening, speaking, and writing by linking ideas with simple connectives and mixing familiar tenses accurately to show time, reason, and sequence.'
  where subject_code = 'english' and lesson_key = 'english|Y2|June|W42|P5';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y2|July|W43|P1';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y2|July|W43|P2';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y2|July|W43|P3';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y2|July|W43|P4';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y2|July|W43|P5';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y2|July|W44|P1';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y2|July|W44|P2';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y2|July|W44|P3';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y2|July|W44|P4';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y2|July|W44|P5';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y3|August|W1|wk';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y3|August|W2|wk';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Present simple'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W3|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Present simple'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W3|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Present simple'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W3|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Present simple'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W3|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Present simple'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W3|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Past simple'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W4|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Past simple'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W4|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Past simple'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W4|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Past simple'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W4|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Future simple'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W4|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Future simple'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W5|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Future simple'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W5|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Future simple'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W5|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Future simple'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W5|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Correct tense choice'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W5|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Correct tense choice'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W6|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Correct tense choice'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W6|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Correct tense choice'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W6|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.', grammar_vocabulary = 'Correct tense choice'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W6|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to mix simple tenses fluently and deal with a range of tenses in texts and audio. She will be familiar with signs, notices, and messages related to school, sports, shopping, and services.'
  where subject_code = 'english' and lesson_key = 'english|Y3|September|W6|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W7|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Articles'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W7|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Articles'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W7|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Articles'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W7|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Articles'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W7|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Articles'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W8|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Articles'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W8|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Simple versus continuous tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W8|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Simple versus continuous tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W8|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Simple versus continuous tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W8|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Simple versus continuous tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W9|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Simple versus continuous tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W9|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Simple versus continuous tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W9|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Simple versus continuous tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W9|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Simple versus continuous tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W9|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Future meaning of present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W10|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Future meaning of present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W10|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Future meaning of present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W10|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.', grammar_vocabulary = 'Future meaning of present continuous'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W10|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to talk fluently about things she does in her spare time, combining facts and opinions. She will start to have a grasp over basic grammar, and not make mistakes in her subject verb agreement or articles in her writing.'
  where subject_code = 'english' and lesson_key = 'english|Y3|October|W10|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W11|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Prepositions of place'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W11|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Prepositions of place'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W11|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Prepositions of place'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W11|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Prepositions of place'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W11|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Clauses of reason'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W12|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Clauses of reason'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W12|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Clauses of reason'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W12|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Clauses of reason'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W12|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Clauses of reason'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W12|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Clauses of purpose'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W13|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Clauses of purpose'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W13|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Clauses of purpose'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W13|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Clauses of purpose'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W13|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Clauses of purpose'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W13|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Prepositions of time'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W14|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Prepositions of time'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W14|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Prepositions of time'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W14|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Prepositions of time'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W14|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be familiar with the format of newspaper articles, and will develop her understanding of grammatical devices in order to understand and recreate the flow of ideas within a text.', grammar_vocabulary = 'Prepositions of time'
  where subject_code = 'english' and lesson_key = 'english|Y3|November|W14|P5';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'Clauses of contrast'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W15|P1';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'Clauses of contrast'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W15|P2';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'Clauses of contrast'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W15|P3';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'Clauses of contrast'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W15|P4';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'Clauses of contrast'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W15|P5';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'during, for, while, since'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W16|P1';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'during, for, while, since'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W16|P2';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'during, for, while, since'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W16|P3';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'during, for, while, since'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W16|P4';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'Clauses of contrast'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W16|P5';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'Present perfect'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W17|P1';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'Present perfect'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W17|P2';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'Present perfect'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W17|P3';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'Present perfect'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W17|P4';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'Present perfect'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W17|P5';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'Present perfect'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W18|P1';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'Present perfect'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W18|P2';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'Present perfect'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W18|P3';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'Present perfect'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W18|P4';

update public.curriculum_lesson set monthly_lo = 'Use a range of target grammar structures (clauses of contrast, time words during/for/while/since, and the present perfect) to understand and express meaning by identifying attitudes and key information in texts and audio, responding to comprehension questions, comparing viewpoints in discussion, and producing spoken and written work with clear personal opinions.', grammar_vocabulary = 'Present perfect'
  where subject_code = 'english' and lesson_key = 'english|Y3|December|W18|P5';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'Perfect continuous'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W19|P1';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'Perfect continuous'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W19|P2';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'Perfect continuous'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W19|P3';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'Perfect continuous'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W19|P4';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'Perfect continuous'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W19|P5';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'Perfect continuous'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W20|P1';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'Perfect continuous'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W20|P2';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'Perfect continuous'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W20|P3';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'Perfect continuous'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W20|P4';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'Perfect continuous'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W20|P5';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'all/ any/ no/ none'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W21|P1';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'all/ any/ no/ none'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W21|P2';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'all/ any/ no/ none'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W21|P3';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'all/ any/ no/ none'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W21|P4';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'all/ any/ no/ none'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W21|P5';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'much/many/ a lot/ a litte/ a few'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W22|P1';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'much/many/ a lot/ a litte/ a few'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W22|P2';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'much/many/ a lot/ a litte/ a few'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W22|P3';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'much/many/ a lot/ a litte/ a few'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W22|P4';

update public.curriculum_lesson set monthly_lo = 'Apply B1 reading, listening, speaking, and writing skills across a range of familiar topics—health, countryside, and nature—using clear sentences that show growing control of key grammar, including the present perfect continuous, quantity words (much, many, a lot of, a few, a little), and determiners such as all, any, no, and none.', grammar_vocabulary = 'much/many/ a lot/ a litte/ a few'
  where subject_code = 'english' and lesson_key = 'english|Y3|January|W22|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'perfect tense review'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W23|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Past perfect - function'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W23|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Past Perfect'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W23|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Past Perfect'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W23|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Past Perfect'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W23|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Other/ the others etc.'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W24|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Other/ the others etc.'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W24|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Other/ the others etc.'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W24|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Other/ the others etc.'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W24|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Other/ the others etc.'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W24|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Second conditional'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W25|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Second conditional'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W25|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Second conditional'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W25|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Second conditional'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W25|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Second conditional'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W25|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W26|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W26|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W26|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W26|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse, discuss, and produce short texts across a range of familiar B1 themes—hobbies and leisure, appliances, jobs, and transport—using clear language and showing growing control of key grammar structures such as the past perfect, other/another/the other/the others, and both first and second conditional'
  where subject_code = 'english' and lesson_key = 'english|Y3|February|W26|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'First and second conditional review'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W27|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Third conditional'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W27|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Third conditional'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W27|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Third conditional'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W27|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Third conditional'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W27|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Have to/ must/ should'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W28|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Have to/ must/ should'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W28|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Have to/ must/ should'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W28|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Have to/ must/ should'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W28|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Have to/ must/ should'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W28|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Modals of ability'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W29|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Modals of ability'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W29|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Modals of ability'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W29|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Modals of ability'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W29|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Modals of ability'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W29|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Modals of possibility'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W30|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Modals of possibility'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W30|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Modals of possibility'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W30|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.', grammar_vocabulary = 'Modals of possibility'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W30|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of familiar B1 topics using clear language and a growing command of conditional forms and modal verbs to express real situations, imagined ideas, obligations, abilities, and possibilities in accurate and meaningful ways.'
  where subject_code = 'english' and lesson_key = 'english|Y3|March|W30|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Knowledge of ed/ing endings in adjectives.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W31|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Knowledge of ed/ing endings in adjectives.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W31|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Knowledge of ed/ing endings in adjectives.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W31|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Knowledge of ed/ing endings in adjectives.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W31|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Knowledge of ed/ing endings in adjectives.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W31|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Ability to use and recognise modals of deduction.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W32|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Ability to use and recognise modals of deduction.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W32|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Ability to use and recognise modals of deduction.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W32|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Ability to use and recognise modals of deduction.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W32|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Ability to use and recognise modals of deduction.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W32|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Ability to use would rather/sooner to express preference.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W33|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Ability to use would rather/sooner to express preference.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W33|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Ability to use would rather/sooner to express preference.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W33|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Ability to use would rather/sooner to express preference.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W33|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Ability to use would rather/sooner to express preference.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W33|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Display knowledge of the different uses of ''used to/ get used to'' etc.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W34|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Display knowledge of the different uses of ''used to/ get used to'' etc.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W34|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Display knowledge of the different uses of ''used to/ get used to'' etc.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W34|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).', grammar_vocabulary = 'Display knowledge of the different uses of ''used to/ get used to'' etc.'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W34|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write about a range of B1 topics using clear language to identify bias in texts, compare viewpoints, negotiate ideas in discussions, and express preferences, deductions, and emotional responses through accurate use of key grammar forms (-ed/-ing adjectives, modals of deduction, would rather / would sooner, and used to / be used to / get used to).'
  where subject_code = 'english' and lesson_key = 'english|Y3|April|W34|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Relative adverbs and pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W35|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Relative adverbs and pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W35|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Relative adverbs and pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W35|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Relative adverbs and pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W35|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Relative adverbs and pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W35|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Knowledge of verb patterns using gerund and infinitive'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W36|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Knowledge of verb patterns using gerund and infinitive'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W36|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Knowledge of verb patterns using gerund and infinitive'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W36|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Knowledge of verb patterns using gerund and infinitive'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W36|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Knowledge of verb patterns using gerund and infinitive'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W36|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Purpose of the passive voice'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W37|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Purpose of the passive voice'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W37|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Purpose of the passive voice'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W37|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Purpose of the passive voice'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W37|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Purpose of the passive voice'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W37|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Use of the passive voice'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W38|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Use of the passive voice'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W38|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Use of the passive voice'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W38|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Use of the passive voice'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W38|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of familiar B1 themes—sports and exercise, transport, film and television, and education—showing accurate use of relative clauses to add detail, organised presentation of ideas using correct gerund/infinitive verb patterns, and confident application of passive structures to describe events, processes, and information in extended texts.', grammar_vocabulary = 'Use of the passive voice'
  where subject_code = 'english' and lesson_key = 'english|Y3|May|W38|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Mixed tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W39|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Mixed tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W39|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Mixed tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W39|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Mixed tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W39|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Mixed tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W39|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Mixed tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W40|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Mixed tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W40|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Mixed tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W40|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Mixed tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W40|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Mixed tenses'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W40|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Prepositions review'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W41|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Prepositions review'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W41|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Prepositions review'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W41|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Prepositions review'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W41|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Prepositions review'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W41|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Advanced linking words review'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W42|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Advanced linking words review'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W42|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Advanced linking words review'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W42|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.', grammar_vocabulary = 'Advanced linking words review'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W42|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate exam-ready reading, listening, and writing skills by confidently understanding detailed texts, identifying attitudes and global meaning, and producing clear, well-structured answers that use accurate prepositions and advanced linking words.'
  where subject_code = 'english' and lesson_key = 'english|Y3|June|W42|P5';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision'
  where subject_code = 'english' and lesson_key = 'english|Y3|July|W43|P1';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y3|July|W43|P2';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y3|July|W43|P3';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y3|July|W43|P4';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y3|July|W43|P5';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y3|July|W44|P1';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y3|July|W44|P2';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y3|July|W44|P3';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y3|July|W44|P4';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y3|July|W44|P5';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y4|August|W1|wk';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y4|August|W2|wk';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W3|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Verbs of the senses'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W3|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Verbs of the senses'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W3|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Verbs of the senses'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W3|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Verbs of the senses'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W3|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Past perfect simple'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W4|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Past perfect simple'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W4|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Past perfect simple'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W4|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Past perfect simple'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W4|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Past perfect simple'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W4|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Modal and auxiliary verbs'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W5|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Modal and auxiliary verbs'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W5|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Modal and auxiliary verbs'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W5|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Modal and auxiliary verbs'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W5|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Modal and auxiliary verbs'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W5|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Modals of speculation'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W6|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Modals of speculation'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W6|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Modals of speculation'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W6|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Modals of speculation'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W6|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to write essays combining facts and opinions and using correct essay structure. She will be able to use advanced grammar to vary her sentence structure.', grammar_vocabulary = 'Modals of speculation'
  where subject_code = 'english' and lesson_key = 'english|Y4|September|W6|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W7|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W7|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W7|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W7|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Review'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W7|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Second and third conditionals'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W8|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Second and third conditionals'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W8|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Second and third conditionals'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W8|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Second and third conditionals'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W8|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Second and third conditionals'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W8|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Use ''provided'', ''as long as'' or ''unless'' in conditional structures.'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W9|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Use ''provided'', ''as long as'' or ''unless'' in conditional structures.'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W9|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Use ''provided'', ''as long as'' or ''unless'' in conditional structures.'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W9|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Use ''provided'', ''as long as'' or ''unless'' in conditional structures.'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W9|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Use ''provided'', ''as long as'' or ''unless'' in conditional structures.'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W9|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Other ways to express the future (be about to, be due to)'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W10|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Other ways to express the future (be about to, be due to)'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W10|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Other ways to express the future (be about to, be due to)'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W10|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Other ways to express the future (be about to, be due to)'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W10|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use advanced topic-specific vocabulary (media, communication, travel, world issues) and complex grammar structures (second and third conditionals, advanced future forms) to read, summarise, and evaluate texts, and to express and justify her ideas orally and in writing on familiar and unfamiliar topics.', grammar_vocabulary = 'Other ways to express the future (be about to, be due to)'
  where subject_code = 'english' and lesson_key = 'english|Y4|October|W10|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Expressing future in the past'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W11|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Expressing future in the past'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W11|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Expressing future in the past'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W11|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Expressing future in the past'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W11|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Expressing future in the past'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W11|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Passives review'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W12|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Passives review'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W12|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Passives review'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W12|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Passives review'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W12|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Passives review'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W12|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Using passives with two objects'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W13|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Using passives with two objects'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W13|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Using passives with two objects'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W13|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Using passives with two objects'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W13|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Using passives with two objects'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W13|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Understanding of distancing . expressions and passive of reporting verbs.'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W14|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Understanding of distancing . expressions and passive of reporting verbs.'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W14|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Understanding of distancing . expressions and passive of reporting verbs.'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W14|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Understanding of distancing . expressions and passive of reporting verbs.'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W14|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with conventions of letter writing, learn to study independently by taking notes, and develop confidence when sharing her opinion with her classmates.', grammar_vocabulary = 'Understanding of distancing . expressions and passive of reporting verbs.'
  where subject_code = 'english' and lesson_key = 'english|Y4|November|W14|P5';

update public.curriculum_lesson set monthly_lo = 'ntegrate accurate relative clause use with crime-related vocabulary and discourse markers to analyse ideas, express informed opinions, craft organised written texts, and enhance overall clarity through structured revision.', grammar_vocabulary = 'Relative and participle clauses'
  where subject_code = 'english' and lesson_key = 'english|Y4|December|W15|P1';

update public.curriculum_lesson set monthly_lo = 'ntegrate accurate relative clause use with crime-related vocabulary and discourse markers to analyse ideas, express informed opinions, craft organised written texts, and enhance overall clarity through structured revision.', grammar_vocabulary = 'Relative and participle clauses'
  where subject_code = 'english' and lesson_key = 'english|Y4|December|W15|P2';

update public.curriculum_lesson set monthly_lo = 'ntegrate accurate relative clause use with crime-related vocabulary and discourse markers to analyse ideas, express informed opinions, craft organised written texts, and enhance overall clarity through structured revision.', grammar_vocabulary = 'Relative and participle clauses'
  where subject_code = 'english' and lesson_key = 'english|Y4|December|W15|P3';

update public.curriculum_lesson set monthly_lo = 'ntegrate accurate relative clause use with crime-related vocabulary and discourse markers to analyse ideas, express informed opinions, craft organised written texts, and enhance overall clarity through structured revision.', grammar_vocabulary = 'Relative and participle clauses'
  where subject_code = 'english' and lesson_key = 'english|Y4|December|W15|P4';

update public.curriculum_lesson set monthly_lo = 'ntegrate accurate relative clause use with crime-related vocabulary and discourse markers to analyse ideas, express informed opinions, craft organised written texts, and enhance overall clarity through structured revision.', grammar_vocabulary = 'Relative and participle clauses'
  where subject_code = 'english' and lesson_key = 'english|Y4|December|W15|P5';

update public.curriculum_lesson set monthly_lo = 'ntegrate accurate relative clause use with crime-related vocabulary and discourse markers to analyse ideas, express informed opinions, craft organised written texts, and enhance overall clarity through structured revision.', grammar_vocabulary = 'Discourse Markers'
  where subject_code = 'english' and lesson_key = 'english|Y4|December|W16|P1';

update public.curriculum_lesson set monthly_lo = 'ntegrate accurate relative clause use with crime-related vocabulary and discourse markers to analyse ideas, express informed opinions, craft organised written texts, and enhance overall clarity through structured revision.', grammar_vocabulary = 'Discourse Markers'
  where subject_code = 'english' and lesson_key = 'english|Y4|December|W16|P2';

update public.curriculum_lesson set monthly_lo = 'ntegrate accurate relative clause use with crime-related vocabulary and discourse markers to analyse ideas, express informed opinions, craft organised written texts, and enhance overall clarity through structured revision.', grammar_vocabulary = 'Discourse Markers'
  where subject_code = 'english' and lesson_key = 'english|Y4|December|W16|P3';

update public.curriculum_lesson set monthly_lo = 'ntegrate accurate relative clause use with crime-related vocabulary and discourse markers to analyse ideas, express informed opinions, craft organised written texts, and enhance overall clarity through structured revision.', grammar_vocabulary = 'Discourse Markers'
  where subject_code = 'english' and lesson_key = 'english|Y4|December|W16|P4';

update public.curriculum_lesson set monthly_lo = 'ntegrate accurate relative clause use with crime-related vocabulary and discourse markers to analyse ideas, express informed opinions, craft organised written texts, and enhance overall clarity through structured revision.', grammar_vocabulary = 'Discourse Markers'
  where subject_code = 'english' and lesson_key = 'english|Y4|December|W16|P5';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Verb + object + infinitive/gerund verb patterns.'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W19|P1';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Verb + object + infinitive/gerund verb patterns.'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W19|P2';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Verb + object + infinitive/gerund verb patterns.'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W19|P3';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Verb + object + infinitive/gerund verb patterns.'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W19|P4';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Verb + object + infinitive/gerund verb patterns.'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W19|P5';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Awareness of complex forms of gerunds and infinitives.'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W20|P1';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Awareness of complex forms of gerunds and infinitives.'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W20|P2';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Awareness of complex forms of gerunds and infinitives.'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W20|P3';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Awareness of complex forms of gerunds and infinitives.'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W20|P4';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Awareness of complex forms of gerunds and infinitives.'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W20|P5';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Compound nouns, possessive forms, and possessive''s with time expressions.'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W21|P1';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Compound nouns, possessive forms, and possessive''s with time expressions.'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W21|P2';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Compound nouns, possessive forms, and possessive''s with time expressions.'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W21|P3';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Compound nouns, possessive forms, and possessive''s with time expressions.'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W21|P4';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Compound nouns, possessive forms, and possessive''s with time expressions.'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W21|P5';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Reflexive and reciprocal pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W22|P1';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Reflexive and reciprocal pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W22|P2';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Reflexive and reciprocal pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W22|P3';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Reflexive and reciprocal pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W22|P4';

update public.curriculum_lesson set monthly_lo = 'Apply complex verb patterns and topic-specific vocabulary related to **War and Peace, Hobbies and Adventure, and Personality Traits** to understand lectures, podcasts, and texts, recognise opinions and value judgements, and express, justify, and evaluate ideas in structured discussion and formal writing.', grammar_vocabulary = 'Reflexive and reciprocal pronouns'
  where subject_code = 'english' and lesson_key = 'english|Y4|January|W22|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Advanced perfect tense'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W23|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Advanced perfect tense'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W23|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Advanced perfect tense'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W23|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Advanced perfect tense'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W23|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Advanced perfect tense'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W23|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Narrative tenses in the past'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W24|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Narrative tenses in the past'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W24|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Narrative tenses in the past'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W24|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Narrative tenses in the past'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W24|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Narrative tenses in the past'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W24|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Preparation for CEFR use of English  part 1'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W25|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Preparation for CEFR use of English part 1'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W25|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Preparation for CEFR use of English part 1'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W25|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Preparation for CEFR use of English part 1'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W25|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Preparation for CEFR use of English part 1'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W25|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Knowledge of auxiliary verbs and their uses'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W26|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Knowledge of auxiliary verbs and their uses'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W26|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Knowledge of auxiliary verbs and their uses'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W26|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Knowledge of auxiliary verbs and their uses'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W26|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and interpret spoken and written texts on money, finance, and community issues to identify opinions and attitudes, and respond with logically coherent spoken and written communication, demonstrating accurate control of perfect and narrative tenses, prepositions, and auxiliary verbs in exam-style tasks and formal reporting.', grammar_vocabulary = 'Knowledge of auxiliary verbs and their uses'
  where subject_code = 'english' and lesson_key = 'english|Y4|February|W26|P5';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = 'Different meanings of ''get'''
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W27|P1';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = 'Different meanings of ''get'''
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W27|P2';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = 'Different meanings of ''get'''
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W27|P3';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = 'Different meanings of ''get'''
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W27|P4';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = 'Different meanings of ''get'''
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W27|P5';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = '. Use and understand a variety of clause types; including purpose, reason, contrast, and result.'
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W28|P1';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = '. Use and understand a variety of clause types; including purpose, reason, contrast, and result.'
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W28|P2';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = '. Use and understand a variety of clause types; including purpose, reason, contrast, and result.'
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W28|P3';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = '. Use and understand a variety of clause types; including purpose, reason, contrast, and result.'
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W28|P4';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = '. Use and understand a variety of clause types; including purpose, reason, contrast, and result.'
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W28|P5';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = 'Claues of Contrast'
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W29|P1';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = 'Claues of Contrast'
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W29|P2';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = 'Claues of Contrast'
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W29|P3';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = 'Claues of Contrast'
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W29|P4';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = 'Claues of Contrast'
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W29|P5';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = 'Emphasis through inversion and cleft sentences'
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W30|P1';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = 'Emphasis through inversion and cleft sentences'
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W30|P2';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = 'Emphasis through inversion and cleft sentences'
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W30|P3';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = 'Emphasis through inversion and cleft sentences'
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W30|P4';

update public.curriculum_lesson set monthly_lo = 'Interpret academic spoken and written texts to identify main ideas and detail, and produce coherent formal writing that uses emphasis effectively through inversion and cleft structures.', grammar_vocabulary = 'Emphasis through inversion and cleft sentences'
  where subject_code = 'english' and lesson_key = 'english|Y4|March|W30|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Knowledge of common patterns of word formations'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W31|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Knowledge of common patterns of word formations'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W31|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Knowledge of common patterns of word formations'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W31|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Knowledge of common patterns of word formations'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W31|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Knowledge of common patterns of word formations'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W31|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Knowledge of the appropriate preposition in a gapped text'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W32|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Knowledge of the appropriate preposition in a gapped text'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W32|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Knowledge of the appropriate preposition in a gapped text'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W32|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Knowledge of the appropriate preposition in a gapped text'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W32|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Knowledge of the appropriate preposition in a gapped text'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W32|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Ability to rewrite sentences to produce the same meaning, using a given word.'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W33|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Ability to rewrite sentences to produce the same meaning, using a given word.'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W33|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Ability to rewrite sentences to produce the same meaning, using a given word.'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W33|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Ability to rewrite sentences to produce the same meaning, using a given word.'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W33|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Ability to rewrite sentences to produce the same meaning, using a given word.'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W33|P5';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Ability to rewrite sentences to produce the same meaning, using phrasal verbs (Use of English part 4).'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W34|P1';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Ability to rewrite sentences to produce the same meaning, using phrasal verbs (Use of English part 4).'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W34|P2';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Ability to rewrite sentences to produce the same meaning, using phrasal verbs (Use of English part 4).'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W34|P3';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Ability to rewrite sentences to produce the same meaning, using phrasal verbs (Use of English part 4).'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W34|P4';

update public.curriculum_lesson set monthly_lo = 'Read, listen, speak, and write across a range of B2 themes—food, learning and education, and environmental issues—using accurate grammar and vocabulary to analyse viewpoints, summarise and compare texts, and complete Use of English Part 4–style sentence transformations, including word formation, prepositions, and phrasal verbs, while consistently preserving meaning and register', grammar_vocabulary = 'Ability to rewrite sentences to produce the same meaning, using phrasal verbs (Use of English part 4).'
  where subject_code = 'english' and lesson_key = 'english|Y4|April|W34|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.', grammar_vocabulary = 'Mixed'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W35|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.', grammar_vocabulary = 'Mixed'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W35|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.', grammar_vocabulary = 'Mixed'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W35|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.', grammar_vocabulary = 'Mixed'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W35|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.', grammar_vocabulary = 'Mixed'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W35|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.', grammar_vocabulary = 'Knowledge of the difference between linking words and preposition e.g. despite and although'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W36|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.', grammar_vocabulary = 'Ability to accurately fill gapped texts with the appropriate preposition or linking word.'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W36|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.', grammar_vocabulary = 'Ability to accurately fill gapped texts with the appropriate preposition or linking word.'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W36|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W36|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W36|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.', grammar_vocabulary = 'Coherent sentence structure when writing'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W37|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.', grammar_vocabulary = 'Coherent sentence structure when writing'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W37|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.', grammar_vocabulary = 'Coherent sentence structure when writing'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W37|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.', grammar_vocabulary = 'Coherent sentence structure when writing'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W37|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.', grammar_vocabulary = 'Coherent sentence structure when writing'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W37|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W38|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W38|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W38|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.', grammar_vocabulary = 'Rephrase sentences using provided words'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W38|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to **understand and extract key information and vocabulary from short medicine-related reading and listening texts**, and **accurately reformulate sentences in medical contexts using Use of English Part 4 strategies while maintaining meaning**, including under exam-style conditions.', grammar_vocabulary = 'Rephrase sentences using provided words'
  where subject_code = 'english' and lesson_key = 'english|Y4|May|W38|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Reporting verbs'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W39|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Reporting verbs'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W39|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Reporting verbs'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W39|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Reporting verbs'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W39|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Reporting verbs'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W39|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Articles with abstract nouns'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W40|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Articles with abstract nouns'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W40|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Articles with abstract nouns'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W40|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Articles with abstract nouns'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W40|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Articles with abstract nouns'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W40|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Pefect continuous tenses'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W41|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Pefect continuous tenses'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W41|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Pefect continuous tenses'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W41|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Pefect continuous tenses'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W41|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Pefect continuous tenses'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W41|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Preparatory subjects.'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W42|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Preparatory subjects.'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W42|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Preparatory subjects.'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W42|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Preparatory subjects.'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W42|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, students will be able to analyse texts on national and business issues, report and evaluate viewpoints, and communicate clearly in professional speaking and writing using appropriate reporting language, business vocabulary, and key grammatical structures.', grammar_vocabulary = 'Preparatory subjects.'
  where subject_code = 'english' and lesson_key = 'english|Y4|June|W42|P5';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y4|July|W43|P1';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y4|July|W43|P2';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y4|July|W43|P3';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y4|July|W43|P4';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y4|July|W43|P5';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y4|July|W44|P1';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y4|July|W44|P2';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y4|July|W44|P3';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y4|July|W44|P4';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y4|July|W44|P5';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y5|August|W1|wk';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.'
  where subject_code = 'english' and lesson_key = 'english|Y5|August|W2|wk';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Use of emphasis'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W3|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Use of emphasis'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W3|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Use of emphasis'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W3|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Use of emphasis'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W3|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Use of emphasis'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W3|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Modals of probability'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W4|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Modals of probability'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W4|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Modals of probability'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W4|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Modals of probability'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W4|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Modals of probability'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W4|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Ellipses'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W5|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Ellipses'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W5|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Ellipses'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W5|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Ellipses'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W5|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Ellipses'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W5|P5';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Modals of probability in the past'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W6|P1';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Modals of probability in the past'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W6|P2';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Modals of probability in the past'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W6|P3';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Modals of probability in the past'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W6|P4';

update public.curriculum_lesson set monthly_lo = 'By the end of the month, Aya will be able to use some more complex grammatical structures to vary her writing and speaking, and will begin to become familiar with longer and more complex texts and subjects.', grammar_vocabulary = 'Modals of probability in the past'
  where subject_code = 'english' and lesson_key = 'english|Y5|September|W6|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = 'Inversions after negative adverbials'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W7|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = 'Inversions after negative adverbials'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W7|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = 'Inversions after negative adverbials'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W7|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = 'Inversions after negative adverbials'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W7|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = 'Inversions after negative adverbials'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W7|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = 'Ability to correctly use commas to clarify her writing.'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W8|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = 'Ability to correctly use commas to clarify her writing.'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W8|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = 'Ability to correctly use commas to clarify her writing.'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W8|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = 'Ability to correctly use commas to clarify her writing.'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W8|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = 'Ability to correctly use commas to clarify her writing.'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W8|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = '. Ability to determine the correct word formation in her writing.'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W9|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = '. Ability to determine the correct word formation in her writing.'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W9|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = '. Ability to determine the correct word formation in her writing.'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W9|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = '. Ability to determine the correct word formation in her writing.'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W9|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = '. Ability to determine the correct word formation in her writing.'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W9|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = 'Have knowledge of some collocations relevant to the subject'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W10|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = 'Have knowledge of some collocations relevant to the subject'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W10|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = 'Have knowledge of some collocations relevant to the subject'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W10|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.', grammar_vocabulary = 'Have knowledge of some collocations relevant to the subject'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W10|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will develop her ability to gather and analyse perspectives on complex and unfamiliar topics, and be able to organise them in to her own arguments and ideas when she writes essay.'
  where subject_code = 'english' and lesson_key = 'english|Y5|October|W10|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Unreal Time'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W11|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Unreal Time'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W11|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Unreal Time'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W11|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Unreal Time'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W11|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Unreal Time'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W11|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Inversions in Conditionals'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W12|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Inversions in Conditionals'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W12|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Inversions in Conditionals'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W12|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Inversions in Conditionals'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W12|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Inversions in Conditionals'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W12|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Collocations and phrasal verbs'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W13|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Collocations and phrasal verbs'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W13|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Collocations and phrasal verbs'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W13|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Collocations and phrasal verbs'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W13|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Collocations and phrasal verbs'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W13|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Revision'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W14|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Revision'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W14|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Revision'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W14|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Revision'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W14|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to comprehend, compare, and summarise news articles and complex texts. She will be able to listen to podcast and watch TV shows and understand the majority of the spoken language.', grammar_vocabulary = 'Revision'
  where subject_code = 'english' and lesson_key = 'english|Y5|November|W14|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.', grammar_vocabulary = 'Simple passives review'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W15|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.', grammar_vocabulary = 'Simple passives review'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W15|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.', grammar_vocabulary = 'Simple passives review'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W15|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.', grammar_vocabulary = 'Simple passives review'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W15|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.', grammar_vocabulary = 'Simple passives review'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W15|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.', grammar_vocabulary = 'Perfect tense review'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W16|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.', grammar_vocabulary = 'Perfect tense review'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W16|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.', grammar_vocabulary = 'Perfect tense review'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W16|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.', grammar_vocabulary = 'Perfect tense review'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W16|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.', grammar_vocabulary = 'Perfect tense review'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W16|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W17|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W17|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W17|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W17|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W17|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W18|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W18|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W18|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W18|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to a range of spoken and written texts by identifying purpose, audience, tone, and function, adapting language in speaking, brainstorming ideas to meet prompt requirements, and producing coherent writing that accurately incorporates passive and perfect tense structures.'
  where subject_code = 'english' and lesson_key = 'english|Y5|December|W18|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Participle Clauses'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W19|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Participle Clauses'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W19|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Participle Clauses'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W19|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Participle Clauses'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W19|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Participle Clauses'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W19|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Participle Clauses'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W20|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Participle Clauses'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W20|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Participle Clauses'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W20|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Participle Clauses'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W20|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Participle Clauses'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W20|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Word order in phrasal verbs'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W21|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Word order in phrasal verbs'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W21|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Word order in phrasal verbs'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W21|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Word order in phrasal verbs'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W21|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Word order in phrasal verbs'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W21|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Advanced ways to contrast ideas'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W22|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Advanced ways to contrast ideas'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W22|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Advanced ways to contrast ideas'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W22|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Advanced ways to contrast ideas'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W22|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and evaluate complex texts on contemporary themes and produce formal spoken and written responses that integrate advanced language, accurate grammar, and appropriate register to compare and justify viewpoints.', grammar_vocabulary = 'Advanced ways to contrast ideas'
  where subject_code = 'english' and lesson_key = 'english|Y5|January|W22|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Possessions and noun modifiers'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W23|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Possessions and noun modifiers'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W23|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Possessions and noun modifiers'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W23|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Possessions and noun modifiers'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W23|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Possessions and noun modifiers'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W23|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Cleft senses for emphasis'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W24|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Cleft senses for emphasis'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W24|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Cleft senses for emphasis'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W24|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Cleft senses for emphasis'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W24|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Cleft senses for emphasis'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W24|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Common collocations'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W25|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Common collocations'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W25|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Common collocations'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W25|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Common collocations'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W25|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Common collocations'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W25|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Common collocations'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W26|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Common collocations'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W26|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Common collocations'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W26|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Common collocations'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W26|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate knowledge of how meaning, attitude, and purpose are conveyed in professional, entertainment, and arts-related spoken and written texts, including the role of text structure, paragraph organisation, sentence cohesion, collocations, and register, and how these features are used to construct clear arguments, integrate facts with evaluation, and produce formal, coherent written texts.', grammar_vocabulary = 'Common collocations'
  where subject_code = 'english' and lesson_key = 'english|Y5|February|W26|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Advanced passives'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W27|wk:re';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Advanced passives'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W27|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Advanced passives'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W27|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Advanced passives'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W27|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Advanced passives'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W27|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Advanced passives'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W28|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Advanced passives'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W28|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Advanced passives'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W28|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Advanced passives'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W28|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Advanced passives'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W28|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Parts of speech and word formations'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W29|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Parts of speech and word formations'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W29|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Parts of speech and word formations'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W29|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Parts of speech and word formations'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W29|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Parts of speech and word formations'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W29|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Rephrase setneces using a given word'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W30|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Rephrase setneces using a given word'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W30|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Rephrase setneces using a given word'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W30|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.', grammar_vocabulary = 'Rephrase setneces using a given word'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W30|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and respond to complex spoken and written discourse, and produce formal spoken and written texts that evaluate ideas, express agreement and disagreement, and justify decisions using accurate vocabulary, advanced passives, and effective rephrasing.'
  where subject_code = 'english' and lesson_key = 'english|Y5|March|W30|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'Advanced use of present simple and continuous'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W31|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'Advanced use of present simple and continuous'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W31|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'Advanced use of present simple and continuous'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W31|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'Advanced use of present simple and continuous'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W31|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'Advanced use of present simple and continuous'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W31|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'Further word formations and word choice'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W32|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'Further word formations and word choice'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W32|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'Further word formations and word choice'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W32|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'Further word formations and word choice'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W32|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'Further word formations and word choice'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W32|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'Standard patterns in reporting verbs'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W33|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'Standard patterns in reporting verbs'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W33|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'Standard patterns in reporting verbs'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W33|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'Standard patterns in reporting verbs'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W33|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'Standard patterns in reporting verbs'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W33|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'CEFR Use of Englihs parts 1-4'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W34|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'CEFR Use of Englihs parts 1-4'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W34|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'CEFR Use of Englihs parts 1-4'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W34|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'CEFR Use of Englihs parts 1-4'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W34|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts on contemporary issues and produce accurate spoken and written responses using appropriate vocabulary, reporting structures, and grammatical reformulation to evaluate viewpoints and communicate clearly.', grammar_vocabulary = 'CEFR Use of Englihs parts 1-4'
  where subject_code = 'english' and lesson_key = 'english|Y5|April|W34|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Writing and speaking in unreal time'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W35|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Writing and speaking in unreal time'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W35|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Writing and speaking in unreal time'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W35|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Writing and speaking in unreal time'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W35|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Writing and speaking in unreal time'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W35|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Use of modals in all tenses, to deduce and express probability'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W36|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Use of modals in all tenses, to deduce and express probability'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W36|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Use of modals in all tenses, to deduce and express probability'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W36|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Use of modals in all tenses, to deduce and express probability'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W36|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Use of modals in all tenses, to deduce and express probability'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W36|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Use of modals in all tenses, to deduce and express probability'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W37|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Use of modals in all tenses, to deduce and express probability'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W37|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Use of modals in all tenses, to deduce and express probability'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W37|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Use of modals in all tenses, to deduce and express probability'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W37|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Use of modals in all tenses, to deduce and express probability'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W37|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Conditionals review (all forms)'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W38|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Conditionals review (all forms)'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W38|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Conditionals review (all forms)'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W38|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Conditionals review (all forms)'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W38|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts across themes and produce structured spoken and written responses using unreal time, modals, and conditionals accurately to evaluate ideas, explain change, and express hypothetical meaning.', grammar_vocabulary = 'Conditionals review (all forms)'
  where subject_code = 'english' and lesson_key = 'english|Y5|May|W38|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Types of sentence structure'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W39|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Types of sentence structure'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W39|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Types of sentence structure'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W39|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Types of sentence structure'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W39|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Types of sentence structure'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W39|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Participle clauses'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W40|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Participle clauses'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W40|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Participle clauses'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W40|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Participle clauses'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W40|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Participle clauses'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W40|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Commas, colons, and semi-colons'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W41|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Commas, colons, and semi-colons'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W41|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Commas, colons, and semi-colons'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W41|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Commas, colons, and semi-colons'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W41|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Commas, colons, and semi-colons'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W41|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Sentence structure as a whole'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W42|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Sentence structure as a whole'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W42|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Sentence structure as a whole'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W42|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Sentence structure as a whole'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W42|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse spoken and written texts across a range of themes, interpreting tone, purpose, and bias, and produce clear, well-structured written responses that explain and evaluate ideas accurately, using appropriate sentence structures, participle clauses, and punctuation to maintain precision and coherence.', grammar_vocabulary = 'Sentence structure as a whole'
  where subject_code = 'english' and lesson_key = 'english|Y5|June|W42|P5';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y5|July|W43|P1';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y5|July|W43|P2';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y5|July|W43|P3';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y5|July|W43|P4';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y5|July|W43|P5';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y5|July|W44|P1';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y5|July|W44|P2';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y5|July|W44|P3';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y5|July|W44|P4';

update public.curriculum_lesson set monthly_lo = 'Use exam strategies to confidently approach reading, listening, writing, and speaking tasks, showing progression in accuracy, comprehension, and fluency while addressing previous areas of weakness.', grammar_vocabulary = 'Revision (according to the teacher)'
  where subject_code = 'english' and lesson_key = 'english|Y5|July|W44|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W3|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W3|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W3|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W3|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W3|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W4|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W4|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W4|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W4|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W4|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W5|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W5|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W5|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W5|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W5|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W6|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W6|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W6|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W6|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will become familiar with the language found in contracts, policies, insurance, and visa forms, and be able to read the fine print to protect herself from harm.'
  where subject_code = 'english' and lesson_key = 'english|Y6|September|W6|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W7|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W7|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W7|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W7|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W7|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W8|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W8|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W8|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W8|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W8|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W9|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W9|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W9|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W9|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W9|P5';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W10|P1';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W10|P2';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W10|P3';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W10|P4';

update public.curriculum_lesson set monthly_lo = 'Aya will be able to communicate effectively in workplace contexts by participating in collaborative discussions, exchanging and justifying opinions, and writing structured reports and proposals that describe situations, summarise information, and recommend solutions. She will also be able to speak spontaneously and express ideas eloquently on management-related topics'
  where subject_code = 'english' and lesson_key = 'english|Y6|October|W10|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W11|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W11|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W11|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W11|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W11|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W12|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W12|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W12|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W12|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W12|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W13|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W13|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W13|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W13|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W13|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W14|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W14|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W14|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W14|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse and compare texts on the same topic by inferring writers’ viewpoints, attitudes, and purposes; evaluate bias, tone, and emphasis through word choice, connotation, sarcasm, and irony; and justify interpretations clearly using precise textual evidence in spoken discussion and short written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|November|W14|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W15|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W15|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W15|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W15|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W15|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W16|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W16|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W16|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W16|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W16|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W17|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W17|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W17|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W17|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W17|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W18|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W18|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W18|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W18|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse complex texts to identify the writer’s viewpoints, reasoning, and philosophical concepts, follow sophisticated narratives, and justify personal conclusions using clear evidence and logical argument when planning and producing extended written responses.'
  where subject_code = 'english' and lesson_key = 'english|Y6|December|W18|P5';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W19|P1';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W19|P2';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W19|P3';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W19|P4';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W19|P5';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W20|P1';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W20|P2';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W20|P3';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W20|P4';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W20|P5';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W21|P1';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W21|P2';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W21|P3';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W21|P4';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W21|P5';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W22|P1';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W22|P2';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W22|P3';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W22|P4';

update public.curriculum_lesson set monthly_lo = 'Synthesise and evaluate information from complex texts by comparing perspectives, interpreting implicit meaning, and producing clear, well-structured spoken and written responses supported by precise textual evidence.'
  where subject_code = 'english' and lesson_key = 'english|Y6|January|W22|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W23|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W23|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W23|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W23|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W23|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W24|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W24|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W24|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W24|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W24|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W25|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W25|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W25|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W25|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W25|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W26|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W26|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W26|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W26|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|February|W26|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W27|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W27|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W27|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W27|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W27|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W28|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W28|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W28|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W28|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W28|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W29|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W29|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W29|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W29|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W29|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W30|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W30|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W30|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W30|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|March|W30|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W31|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W31|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W31|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W31|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W31|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W32|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W32|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W32|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W32|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W32|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W33|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W33|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W33|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W33|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W33|P5';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W34|P1';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W34|P2';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W34|P3';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W34|P4';

update public.curriculum_lesson set monthly_lo = 'Demonstrate readiness for advanced historical study by analysing a range of written and audio sources, discerning writers’ viewpoints, identifying factual information on complex issues, comparing competing historical narratives, and producing clear, well-structured arguments that summarise complex ideas and take a principled, evidence-based stance.'
  where subject_code = 'english' and lesson_key = 'english|Y6|April|W34|P5';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W35|P1';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W35|P2';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W35|P3';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W35|P4';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W35|P5';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W36|P1';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W36|P2';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W36|P3';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W36|P4';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W36|P5';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W37|P1';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W37|P2';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W37|P3';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W37|P4';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W37|P5';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W38|P1';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W38|P2';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W38|P3';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W38|P4';

update public.curriculum_lesson set monthly_lo = 'Knowledge
Understanding the benefits and drawbacks of globalisation for underdeveloped countries through a variety of spoken and written texts, including those in different dialects.
Skills
Identifying and comparing perspectives across texts, building evidence-based arguments, and producing a well-structured argumentative essay while developing fluency in reading, listening, speaking, and writing.'
  where subject_code = 'english' and lesson_key = 'english|Y6|May|W38|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W39|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W39|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W39|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W39|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W39|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W40|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W40|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W40|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W40|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W40|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W41|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W41|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W41|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W41|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W41|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W42|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W42|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W42|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W42|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|June|W42|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|July|W43|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|July|W43|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|July|W43|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|July|W43|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|July|W43|P5';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|July|W44|P1';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|July|W44|P2';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|July|W44|P3';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|July|W44|P4';

update public.curriculum_lesson set monthly_lo = 'Analyse literary passages to interpret themes and devices, contribute effectively to discussions, and develop well-reasoned arguments. Plan and produce structured analytical writing using precise textual evidence, and apply critical theories with reference to secondary scholarship to write a fully cited academic essay.'
  where subject_code = 'english' and lesson_key = 'english|Y6|July|W44|P5';

commit;

-- ── Verification (run after applying; George sanity-checks) ──────────────────────
-- Populated vs total for English.
select
  count(*)                                              as total_english_rows,
  count(*) filter (where monthly_lo is not null
                     and btrim(monthly_lo) <> '')       as monthly_lo_populated,
  count(*) filter (where grammar_vocabulary is not null
                     and btrim(grammar_vocabulary) <> '') as grammar_vocabulary_populated
from public.curriculum_lesson
where subject_code = 'english' and is_active = true;

-- ~3 sample rows to eyeball the backfilled content.
select lesson_key,
       left(monthly_lo, 80)         as monthly_lo_sample,
       left(grammar_vocabulary, 80) as grammar_vocabulary_sample
from public.curriculum_lesson
where subject_code = 'english'
  and (monthly_lo is not null or grammar_vocabulary is not null)
order by year, month, week, period
limit 3;
