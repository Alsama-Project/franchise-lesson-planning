-- seed.sql
-- Seed reference data: schools, the English subject, classes, and a sample of
-- the activity_bank. Runs after migrations (supabase db reset / supabase start).
--
-- profiles and class_teachers are intentionally NOT seeded: they require real
-- auth users and are handled in the auth phase.

insert into public.schools (name) values
  ('Shatila 1'),
  ('Shatila 2'),
  ('Bourj 1'),
  ('Bourj 2');

insert into public.subjects (name, code) values
  ('English', 'english');

-- classes (school · subject English · year). Post-0018 a class is keyed by
-- (school, subject, year) with no group letter. The curriculum runs Years 1–6,
-- so every centre gets one English class per year. `literacy` is left at the
-- column default ('mixed'); adjust per real class if a centre streams by literacy.
insert into public.classes (school_id, subject_id, year)
select s.id, sub.id, y.year
from public.schools s
cross join public.subjects sub
cross join generate_series(1, 6) as y(year)
where sub.code = 'english';

-- activity_bank — the full pre-approved sets for the two blocks that have menus
-- (Check for Understanding + Exit Ticket). Upserted on the (block_type, name)
-- key (migration 0007) so ids stay stable across re-seeds. Re-running this seed
-- against an already-populated DB fully replaces the old sample (the trailing
-- delete prunes any cfu/exit_ticket rows no longer in the canonical set).
insert into public.activity_bank (block_type, name, summary, illiterate_instructions, literate_instructions, sort_order) values
  ('cfu', 'Fist to Five', 'Students show understanding on a 0–5 finger scale.',
    'Hold up 0–5 fingers to show how well they understand (0 = lost, 5 = expert).',
    'Write their number + one thing they need help with.', 1),
  ('cfu', 'Whiteboard / Show Me', 'Students show an answer on a small board or sticky note.',
    'Draw a picture or circle an answer on a small sticky-note.',
    'Write a word, number, or short sentence on a small sticky-note.', 2),
  ('cfu', 'Think–Pair–Share', 'Students discuss with a partner, then share.',
    'Turn to a partner and SAY one thing they remember.',
    'Turn to a partner, SAY, then WRITE one thing their partner said.', 3),
  ('cfu', 'Hand Signals', 'Students answer with agreed hand signs.',
    'Use hand signs (thumbs up = understand, sideways = unsure, down = confused; one finger = A, two = B, three = C).',
    'Same, but the teacher can also ask them to write why they chose that answer.', 4),
  ('cfu', 'Random Call', 'Teacher cold-calls a student to answer aloud.',
    'Teacher pulls a name; the student answers out loud (1–3 words).',
    'Same, but the student writes the answer on the board or paper.', 5),
  ('cfu', 'Sentence Stem', 'Students complete a spoken or written sentence stem.',
    'Teacher says ''A noun is…''; the student finishes out loud with 1–2 words.',
    'The student completes the sentence in writing: ''A noun is ______.''', 6),
  ('cfu', 'Traffic Light Cards', 'Students show red/yellow/green for their confidence.',
    'Student holds up red (confused), yellow (a little unsure), or green (ready).',
    'Same, plus the student writes one question on yellow or red.', 7),
  ('cfu', 'One Minute Paper', 'Students write for one minute on the key takeaway.',
    'Not applicable (no writing).',
    'Student writes for 1 minute: ''The most important thing I learned is…''', 8),
  ('cfu', 'Find Your Partner', 'Students move around to match words with meanings.',
    'Teacher gives half the class a word/picture and the other half a matching definition/picture; students walk and find their match.',
    'Same, but the matching card includes a sentence students must read.', 9),
  ('cfu', 'Quick Quiz (verbal)', 'Teacher asks 1–2 quick questions to check recall.',
    'Teacher asks 1–2 yes/no or either/or questions; students answer aloud or show thumbs up/down.',
    'Teacher gives 1–2 short written questions; students write answers.', 10),
  ('cfu', 'Retell in 10 Seconds', 'Students quickly retell what they learned.',
    'Student says what they learned in 10 seconds (teacher times it).',
    'Student writes 1–2 sentences in 30 seconds.', 11),
  ('exit_ticket', 'Thumbs / Emoji', 'Students rate the lesson with thumbs or an emoji.',
    'Thumbs up / sideways / down, or point to 😀 😐 😞.',
    'Write which emoji they choose + one reason.', 1),
  ('exit_ticket', 'One Thing Learned', 'Students name one thing they learned.',
    'Say one word from the lesson out loud.',
    'Write one complete sentence: ''Today I learned…''', 2),
  ('exit_ticket', 'Confusion Check', 'Students flag what still confuses them.',
    'Point to a red (confused), yellow (so-so), or green (got it) card.',
    'Write: ''I am still confused about…''', 3),
  ('exit_ticket', 'Partner Share', 'Students share one thing with a partner.',
    'Whisper one thing to a partner (no writing).',
    'Write one thing their partner said.', 4),
  ('exit_ticket', 'Draw It', 'Students draw what they learned.',
    'Draw a picture related to the lesson (no writing needed).',
    'Draw a picture and label it with 1–3 words.', 5),
  ('exit_ticket', 'Finish the Sentence', 'Students complete ''Today I…''.',
    'Complete out loud: ''Today I…'' (e.g. ''Today I wrote'').',
    'Complete in writing: ''Today I…''', 6),
  ('exit_ticket', 'True or False', 'Students respond to true/false statements.',
    'Stand up if true, sit down if false (teacher reads the statement).',
    'Write ''T'' or ''F'' and fix the false statements.', 7),
  ('exit_ticket', 'Self-Rating', 'Students rate their understanding 1–5.',
    'Hold up 1–5 fingers (1 = lost, 5 = expert).',
    'Write their rating number + one reason why.', 8),
  ('exit_ticket', 'Question Box', 'Students pose one question about the lesson.',
    'Say one question out loud (teacher writes it on the board).',
    'Write one question on a sticky note.', 9)
on conflict (block_type, name) do update set
  summary = excluded.summary,
  illiterate_instructions = excluded.illiterate_instructions,
  literate_instructions = excluded.literate_instructions,
  sort_order = excluded.sort_order;

-- Prune any stale cfu/exit_ticket rows from earlier sample seeds.
delete from public.activity_bank
where block_type in ('cfu', 'exit_ticket')
  and name not in (
    'Fist to Five', 'Whiteboard / Show Me', 'Think–Pair–Share', 'Hand Signals',
    'Random Call', 'Sentence Stem', 'Traffic Light Cards', 'One Minute Paper',
    'Find Your Partner', 'Quick Quiz (verbal)', 'Retell in 10 Seconds',
    'Thumbs / Emoji', 'One Thing Learned', 'Confusion Check', 'Partner Share',
    'Draw It', 'Finish the Sentence', 'True or False', 'Self-Rating', 'Question Box'
  );
