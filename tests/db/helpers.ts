// Helpers for database permission tests. They run against a local Supabase database
// (never a hosted one): DATABASE_URL, defaulting to the local stack on port 54322.
//
// Each test runs inside one transaction that is always rolled back, so tests leave no
// data behind and can run in any order. `asUser` switches to the `authenticated` role
// with that user's JWT claims, so row-level security and grants apply exactly as they
// do for a signed-in browser.

import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  throw new Error('Database tests only run against a local database.');
}

export const pool = new pg.Pool({ connectionString: url, max: 4 });

export type Db = pg.PoolClient;

/** Run `fn` in a transaction that is always rolled back. */
export async function withTx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('begin');
    return await fn(db);
  } finally {
    await db.query('rollback');
    db.release();
  }
}

export type Role = 'teacher' | 'coordinator' | 'admin';

/** Create a user (the handle_new_user trigger creates the profile) and set its role. */
export async function createUser(db: Db, opts: { role?: Role; name?: string } = {}): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, $3, now(), now())`,
    [id, `${id}@test.local`, JSON.stringify({ full_name: opts.name ?? 'Test user' })],
  );
  if (opts.role && opts.role !== 'teacher') {
    await db.query('update public.profiles set role = $2 where id = $1', [id, opts.role]);
  }
  return id;
}

/** Run `fn` as a signed-in user, then switch back to the setup role. */
export async function asUser<T>(db: Db, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated' }),
  ]);
  await db.query('set local role authenticated');
  try {
    return await fn();
  } finally {
    await db.query('reset role');
  }
}

/**
 * Run a statement that should be refused. Returns the Postgres error (or null if it
 * ran). A savepoint keeps the surrounding transaction usable after the error.
 */
export async function tryQuery(db: Db, sql: string, params: unknown[] = []): Promise<{ error: pg.DatabaseError | null; rowCount: number }> {
  await db.query('savepoint try_query');
  try {
    const res = await db.query(sql, params);
    await db.query('release savepoint try_query');
    return { error: null, rowCount: res.rowCount ?? 0 };
  } catch (err) {
    await db.query('rollback to savepoint try_query');
    return { error: err as pg.DatabaseError, rowCount: 0 };
  }
}
