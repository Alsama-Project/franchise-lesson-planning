// C1 · What a signed-in user may change on their own profile row.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { asUser, createUser, pool, tryQuery, withTx } from './helpers';

after(() => pool.end());

async function roleOf(db: Parameters<Parameters<typeof withTx>[0]>[0], id: string) {
  return (await db.query('select role, can_impersonate, is_test_persona from public.profiles where id = $1', [id])).rows[0];
}

for (const start of ['teacher', 'coordinator'] as const) {
  for (const target of ['admin', 'coordinator'] as const) {
    if (start === target) continue;
    test(`C1: a ${start} cannot change their own role to ${target}`, async () => {
      await withTx(async (db) => {
        const me = await createUser(db, { role: start });
        await asUser(db, me, () => tryQuery(db, 'update public.profiles set role = $2 where id = $1', [me, target]));
        assert.equal((await roleOf(db, me)).role, start);
      });
    });
  }
}

for (const column of ['can_impersonate', 'is_test_persona'] as const) {
  test(`C1: a teacher cannot turn on ${column} for themselves`, async () => {
    await withTx(async (db) => {
      const me = await createUser(db);
      await asUser(db, me, () => tryQuery(db, `update public.profiles set ${column} = true where id = $1`, [me]));
      assert.equal((await roleOf(db, me))[column], false);
    });
  });
}

test('C1: a teacher can still change their own name', async () => {
  await withTx(async (db) => {
    const me = await createUser(db, { name: 'Old Name' });
    const { error } = await asUser(db, me, () =>
      tryQuery(db, 'update public.profiles set full_name = $2 where id = $1', [me, 'New Name']),
    );
    assert.equal(error, null);
    const row = (await db.query('select full_name from public.profiles where id = $1', [me])).rows[0];
    assert.equal(row.full_name, 'New Name');
  });
});

test('C1: an admin can still make someone an admin through set_user_admin', async () => {
  await withTx(async (db) => {
    const admin = await createUser(db, { role: 'admin' });
    const other = await createUser(db);
    const { error } = await asUser(db, admin, () => tryQuery(db, 'select public.set_user_admin($1, true)', [other]));
    assert.equal(error, null);
    assert.equal((await roleOf(db, other)).role, 'admin');
  });
});

test('C1: a teacher cannot use set_user_admin', async () => {
  await withTx(async (db) => {
    const me = await createUser(db);
    const { error } = await asUser(db, me, () => tryQuery(db, 'select public.set_user_admin($1, true)', [me]));
    assert.ok(error);
    assert.equal((await roleOf(db, me)).role, 'teacher');
  });
});
