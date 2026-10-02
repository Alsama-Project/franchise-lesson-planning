// H4 · The shared worksheet-image cache: who may write it, and blocking.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { asUser, createUser, pool, tryQuery, withTx, type Db } from './helpers';

after(() => pool.end());

const insertImage = `insert into public.worksheet_image
  (prompt_hash, brief, style_version, storage_path, model, prompt_sent, created_by)
  values ($1, 'apple', 'v1', $2, 'm', 'apple', $3) returning id`;

/** The route's cache lookup: newest non-blocked row for the hash. */
async function lookup(db: Db, hash: string) {
  return (await db.query(
    `select id from public.worksheet_image where prompt_hash = $1 and blocked_at is null
     order by created_at desc limit 1`, [hash])).rows[0]?.id ?? null;
}

test('H4: a signed-in user cannot write a cache row directly', async () => {
  await withTx(async (db) => {
    const me = await createUser(db);
    const res = await asUser(db, me, () => tryQuery(db, insertImage, ['hash-apple', 'mine/evil.png', me]));
    assert.ok(res.error, 'a user inserted a shared cache row');
  });
});

test('H4: the server (service role) can write cache rows', async () => {
  await withTx(async (db) => {
    const me = await createUser(db);
    await db.query('set local role service_role');
    const res = await tryQuery(db, insertImage, ['hash-apple', 'server/apple.png', me]);
    await db.query('reset role');
    assert.equal(res.error, null);
  });
});

test('H4: an admin can block an image and it drops out of the cache lookup', async () => {
  await withTx(async (db) => {
    const admin = await createUser(db, { role: 'admin' });
    const older = (await db.query(insertImage, ['hash-pear', 'server/pear-1.png', admin])).rows[0].id;
    await db.query(`update public.worksheet_image set created_at = now() - interval '1 day' where id = $1`, [older]);
    const newer = (await db.query(insertImage, ['hash-pear', 'server/pear-2.png', admin])).rows[0].id;
    assert.equal(await lookup(db, 'hash-pear'), newer);
    const res = await asUser(db, admin, () => tryQuery(db, 'select public.block_worksheet_image($1)', [newer]));
    assert.equal(res.error, null);
    assert.equal(await lookup(db, 'hash-pear'), older);
  });
});

test('H4: a teacher cannot block images', async () => {
  await withTx(async (db) => {
    const admin = await createUser(db, { role: 'admin' });
    const teacher = await createUser(db);
    const id = (await db.query(insertImage, ['hash-plum', 'server/plum.png', admin])).rows[0].id;
    const res = await asUser(db, teacher, () => tryQuery(db, 'select public.block_worksheet_image($1)', [id]));
    assert.ok(res.error);
    assert.equal(await lookup(db, 'hash-plum'), id);
  });
});
