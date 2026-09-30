// L5 · The database side the app now relies on (src/lib/role.ts effectiveRole).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { asUser, createUser, pool, withTx } from './helpers';

after(() => pool.end());

test('L5: is_admin() is true for an admin and false once they are deactivated', async () => {
  await withTx(async (db) => {
    const admin = await createUser(db, { role: 'admin' });
    const check = () => asUser(db, admin, async () => (await db.query('select public.is_admin() as a')).rows[0].a);
    assert.equal(await check(), true);
    await db.query('insert into public.user_deactivation (user_id) values ($1)', [admin]);
    assert.equal(await check(), false);
    const stored = (await db.query('select role from public.profiles where id = $1', [admin])).rows[0].role;
    assert.equal(stored, 'admin', 'the stored role still says admin, which is why the app must not trust it alone');
  });
});
