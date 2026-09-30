// Smoke test for the database test helpers themselves.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { asUser, createUser, pool, tryQuery, withTx } from './helpers';

after(() => pool.end());

test('a new user gets a teacher profile and can read it', async () => {
  await withTx(async (db) => {
    const me = await createUser(db, { name: 'Harness Check' });
    const row = await asUser(db, me, async () =>
      (await db.query('select full_name, role from public.profiles where id = $1', [me])).rows[0],
    );
    assert.deepEqual(row, { full_name: 'Harness Check', role: 'teacher' });
  });
});

test('a signed-in user cannot read another user\'s profile outside their spaces', async () => {
  await withTx(async (db) => {
    const me = await createUser(db);
    const other = await createUser(db);
    const rows = await asUser(db, me, async () =>
      (await db.query('select id from public.profiles where id = $1', [other])).rows,
    );
    assert.equal(rows.length, 0);
  });
});

test('tryQuery reports errors without breaking the transaction', async () => {
  await withTx(async (db) => {
    const { error } = await tryQuery(db, 'select * from no_such_table');
    assert.ok(error);
    assert.equal((await db.query('select 1 as ok')).rows[0].ok, 1);
  });
});
