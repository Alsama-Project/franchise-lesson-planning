// H3 · The database helpers behind resolveImportStanding (src/lib/curriculum/import-access.ts).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { asUser, createUser, pool, withTx, type Db } from './helpers';

after(() => pool.end());

async function standing(db: Db, user: string, subject: string) {
  return asUser(db, user, async () => {
    const r = (await db.query(
      `select public.is_admin() as admin,
              public.is_coordinator_of_subject(null, $1) as coordinator,
              public.is_participant_of_subject($1) as participant`, [subject])).rows[0];
    return r.admin ? 'admin' : r.coordinator ? 'coordinator' : r.participant ? 'member' : 'none';
  });
}

test('H3: standing resolves to admin / coordinator / member / none', async () => {
  await withTx(async (db) => {
    const centre = (await db.query(`insert into public.schools (name) values ('C') returning id`)).rows[0].id;
    const subject = (await db.query(`insert into public.subjects (name, code) values ('S', 'imp-' || substr(md5(random()::text),1,8)) returning id`)).rows[0].id;
    const admin = await createUser(db, { role: 'admin' });
    const coordinator = await createUser(db, { role: 'coordinator' });
    const member = await createUser(db);
    const outsider = await createUser(db);
    await db.query('insert into public.coordinator_subject (profile_id, subject_id) values ($1, $2)', [coordinator, subject]);
    await db.query('insert into public.subject_membership (profile_id, school_id, subject_id) values ($1, $2, $3)', [member, centre, subject]);
    assert.equal(await standing(db, admin, subject), 'admin');
    assert.equal(await standing(db, coordinator, subject), 'coordinator');
    assert.equal(await standing(db, member, subject), 'member');
    assert.equal(await standing(db, outsider, subject), 'none');
  });
});

test('H3: a deactivated coordinator has no standing', async () => {
  await withTx(async (db) => {
    const subject = (await db.query(`insert into public.subjects (name, code) values ('S', 'imp-' || substr(md5(random()::text),1,8)) returning id`)).rows[0].id;
    const coordinator = await createUser(db, { role: 'coordinator' });
    await db.query('insert into public.coordinator_subject (profile_id, subject_id) values ($1, $2)', [coordinator, subject]);
    await db.query('insert into public.user_deactivation (user_id) values ($1)', [coordinator]);
    assert.equal(await standing(db, coordinator, subject), 'none');
  });
});
