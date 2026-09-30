// H2 + M1 · Who may write a plan's worksheet, image links and review comments, and
// where a plan may be filed.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { asUser, createUser, pool, tryQuery, withTx, type Db } from './helpers';

after(() => pool.end());

/** Two centres, one subject, and people in known roles. */
async function world(db: Db) {
  const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0].id as string;
  const centreA = await q(`insert into public.schools (name) values ('Centre A') returning id`);
  const centreB = await q(`insert into public.schools (name) values ('Centre B') returning id`);
  const subject = await q(`insert into public.subjects (name, code) values ('Test Subject', 'tst-' || substr(md5(random()::text), 1, 8)) returning id`);
  const other = await q(`insert into public.subjects (name, code) values ('Other Subject', 'oth-' || substr(md5(random()::text), 1, 8)) returning id`);

  const author = await createUser(db);
  const colleague = await createUser(db);        // same subject, other centre
  const peer = await createUser(db);             // same subject, same centre
  const outsider = await createUser(db);         // a different subject entirely
  const coordinator = await createUser(db, { role: 'coordinator' });
  const admin = await createUser(db, { role: 'admin' });
  const join = (p: string, s: string, sub: string) =>
    db.query('insert into public.subject_membership (profile_id, school_id, subject_id) values ($1, $2, $3)', [p, s, sub]);
  await join(author, centreA, subject);
  await join(colleague, centreB, subject);
  await join(peer, centreA, subject);
  await join(outsider, centreA, other);
  await db.query('insert into public.coordinator_subject (profile_id, subject_id) values ($1, $2)', [coordinator, subject]);

  const plan = await q(
    `insert into public.lesson_plans (created_by, scope, school_id, subject_id, curriculum_lesson_id)
     values ($1, 'centre', $2, $3, 'test-lesson') returning id`, [author, centreA, subject]);
  const exercise = await q(
    `insert into public.worksheet_exercise (lesson_plan_id, position, title, exercise_type)
     values ($1, 1, 'Ex 1', 'free') returning id`, [plan]);
  const comment = await q(
    `insert into public.plan_annotations (plan_id, author_id, kind, anchor_type, note)
     values ($1, $2, 'comment', 'general', 'Coordinator note') returning id`, [plan, coordinator]);
  const image = await q(
    `insert into public.worksheet_image (prompt_hash, brief, style_version, storage_path, model, prompt_sent, created_by)
     values ('h', 'apple', 'v1', 'p/apple.png', 'm', 'apple', $1) returning id`, [admin]);
  return { centreA, centreB, subject, other, author, colleague, peer, outsider, coordinator, admin, plan, exercise, comment, image };
}

// ── H2: worksheet exercises ──────────────────────────────────────────────────
test('H2: a colleague who can see a plan cannot edit its worksheet exercises', async () => {
  await withTx(async (db) => {
    const w = await world(db);
    const res = await asUser(db, w.colleague, () =>
      tryQuery(db, `update public.worksheet_exercise set title = 'changed' where id = $1`, [w.exercise]));
    assert.equal(res.rowCount, 0, 'colleague updated an exercise on someone else\'s plan');
  });
});

test('H2: a colleague cannot delete or add worksheet exercises on someone else\'s plan', async () => {
  await withTx(async (db) => {
    const w = await world(db);
    const del = await asUser(db, w.colleague, () =>
      tryQuery(db, 'delete from public.worksheet_exercise where id = $1', [w.exercise]));
    assert.equal(del.rowCount, 0, 'colleague deleted an exercise');
    const ins = await asUser(db, w.colleague, () =>
      tryQuery(db, `insert into public.worksheet_exercise (lesson_plan_id, position, title, exercise_type) values ($1, 2, 'x', 'free')`, [w.plan]));
    assert.ok(ins.error, 'colleague added an exercise');
  });
});

for (const who of ['author', 'coordinator', 'admin'] as const) {
  test(`H2: the plan's ${who} can still edit its worksheet exercises`, async () => {
    await withTx(async (db) => {
      const w = await world(db);
      const res = await asUser(db, w[who], () =>
        tryQuery(db, `update public.worksheet_exercise set title = 'changed' where id = $1`, [w.exercise]));
      assert.equal(res.error, null);
      assert.equal(res.rowCount, 1);
    });
  });
}

// ── H2: image bindings ───────────────────────────────────────────────────────
test('H2: a colleague cannot bind images into someone else\'s worksheet', async () => {
  await withTx(async (db) => {
    const w = await world(db);
    const res = await asUser(db, w.colleague, () =>
      tryQuery(db, `insert into public.worksheet_image_use (lesson_plan_id, worksheet_exercise_id, worksheet_image_id, slot_id) values ($1, $2, $3, 's1')`,
        [w.plan, w.exercise, w.image]));
    assert.ok(res.error, 'colleague bound an image');
  });
});

test('H2: the author can bind images into their own worksheet', async () => {
  await withTx(async (db) => {
    const w = await world(db);
    const res = await asUser(db, w.author, () =>
      tryQuery(db, `insert into public.worksheet_image_use (lesson_plan_id, worksheet_exercise_id, worksheet_image_id, slot_id) values ($1, $2, $3, 's1')`,
        [w.plan, w.exercise, w.image]));
    assert.equal(res.error, null);
  });
});

// ── H2: review comments ──────────────────────────────────────────────────────
test('H2: a same-centre colleague cannot rewrite a coordinator\'s review comment', async () => {
  await withTx(async (db) => {
    const w = await world(db);
    const res = await asUser(db, w.peer, () =>
      tryQuery(db, `update public.plan_annotations set note = 'rewritten' where id = $1`, [w.comment]));
    assert.equal(res.rowCount, 0, 'colleague rewrote the comment');
  });
});

test('H2: the comment author can edit it, and the plan author can resolve it', async () => {
  await withTx(async (db) => {
    const w = await world(db);
    const own = await asUser(db, w.coordinator, () =>
      tryQuery(db, `update public.plan_annotations set note = 'edited' where id = $1`, [w.comment]));
    assert.equal(own.rowCount, 1);
    const resolve = await asUser(db, w.author, () =>
      tryQuery(db, `update public.plan_annotations set resolved = true where id = $1`, [w.comment]));
    assert.equal(resolve.rowCount, 1);
  });
});

// ── M1: where a plan may be filed ────────────────────────────────────────────
test('M1: a teacher cannot file a plan under a subject they don\'t belong to', async () => {
  await withTx(async (db) => {
    const w = await world(db);
    const res = await asUser(db, w.outsider, () =>
      tryQuery(db, `insert into public.lesson_plans (created_by, scope, school_id, subject_id, curriculum_lesson_id) values ($1, 'centre', $2, $3, 'x')`,
        [w.outsider, w.centreA, w.subject]));
    assert.ok(res.error, 'outsider filed a plan in a subject they are not in');
  });
});

test('M1: a teacher cannot file a plan at a centre where they don\'t teach that subject', async () => {
  await withTx(async (db) => {
    const w = await world(db);
    const res = await asUser(db, w.colleague, () =>
      tryQuery(db, `insert into public.lesson_plans (created_by, scope, school_id, subject_id, curriculum_lesson_id) values ($1, 'centre', $2, $3, 'x')`,
        [w.colleague, w.centreA, w.subject]));
    assert.ok(res.error, 'teacher filed a plan at another centre');
  });
});

test('M1: an author cannot move their plan to another subject or centre', async () => {
  await withTx(async (db) => {
    const w = await world(db);
    const subj = await asUser(db, w.author, () =>
      tryQuery(db, 'update public.lesson_plans set subject_id = $2 where id = $1', [w.plan, w.other]));
    const centre = await asUser(db, w.author, () =>
      tryQuery(db, 'update public.lesson_plans set school_id = $2 where id = $1', [w.plan, w.centreB]));
    const row = (await db.query('select school_id, subject_id from public.lesson_plans where id = $1', [w.plan])).rows[0];
    assert.deepEqual(row, { school_id: w.centreA, subject_id: w.subject },
      `plan moved (subject: ${subj.error?.message ?? 'no error'}, centre: ${centre.error?.message ?? 'no error'})`);
  });
});

test('M1: a teacher can still create and edit a plan in their own space', async () => {
  await withTx(async (db) => {
    const w = await world(db);
    const ins = await asUser(db, w.author, () =>
      tryQuery(db, `insert into public.lesson_plans (created_by, scope, school_id, subject_id, curriculum_lesson_id) values ($1, 'centre', $2, $3, 'y')`,
        [w.author, w.centreA, w.subject]));
    assert.equal(ins.error, null);
    const upd = await asUser(db, w.author, () =>
      tryQuery(db, `update public.lesson_plans set smartt_objective = 'I can …' where id = $1`, [w.plan]));
    assert.equal(upd.rowCount, 1);
  });
});

test('M1: a coordinator can still create an organisation-wide plan in their subject', async () => {
  await withTx(async (db) => {
    const w = await world(db);
    const res = await asUser(db, w.coordinator, () =>
      tryQuery(db, `insert into public.lesson_plans (created_by, scope, school_id, subject_id, curriculum_lesson_id) values ($1, 'org', null, $2, 'z')`,
        [w.coordinator, w.subject]));
    assert.equal(res.error, null);
  });
});
