// H8 · Per-user daily AI quotas (take_ai_quota).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { asUser, createUser, pool, tryQuery, withTx, type Db } from './helpers';

after(() => pool.end());

const take = (db: Db, user: string, feature: string, limit: number) =>
  asUser(db, user, async () => (await db.query('select public.take_ai_quota($1, $2) as ok', [feature, limit])).rows[0].ok as boolean);

test('H8: a user gets exactly their daily allowance, then is refused', async () => {
  await withTx(async (db) => {
    const me = await createUser(db);
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await take(db, me, 'worksheet_image', 3));
    assert.deepEqual(results, [true, true, true, false]);
  });
});

test('H8: allowances are per feature and per user', async () => {
  await withTx(async (db) => {
    const a = await createUser(db);
    const b = await createUser(db);
    assert.equal(await take(db, a, 'worksheet_image', 1), true);
    assert.equal(await take(db, a, 'worksheet_image', 1), false);
    assert.equal(await take(db, a, 'objective_check', 1), true);
    assert.equal(await take(db, b, 'worksheet_image', 1), true);
  });
});

test('H8: yesterday\'s use doesn\'t count against today', async () => {
  await withTx(async (db) => {
    const me = await createUser(db);
    assert.equal(await take(db, me, 'resource', 1), true);
    await db.query(`update public.ai_usage set created_at = now() - interval '1 day' where user_id = $1`, [me]);
    assert.equal(await take(db, me, 'resource', 1), true);
  });
});

test('H8: a deactivated user gets no allowance', async () => {
  await withTx(async (db) => {
    const me = await createUser(db);
    await db.query('insert into public.user_deactivation (user_id) values ($1)', [me]);
    assert.equal(await take(db, me, 'resource', 10), false);
  });
});

test('H8: users cannot write usage rows directly (only through the quota function)', async () => {
  await withTx(async (db) => {
    const me = await createUser(db);
    const res = await asUser(db, me, () =>
      tryQuery(db, `delete from public.ai_usage where user_id = $1`, [me]));
    const ins = await asUser(db, me, () =>
      tryQuery(db, `insert into public.ai_usage (user_id, feature) values ($1, 'x')`, [me]));
    assert.ok(ins.error, 'user inserted a usage row');
    assert.equal(res.rowCount, 0);
  });
});
