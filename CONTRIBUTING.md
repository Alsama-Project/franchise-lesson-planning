# Contributing

## How code reaches the live app

```
your branch  ──PR──▶  test  ──release PR──▶  main
                     (test env)                (live)
```

1. **Branch from `test`**: `git switch test && git pull && git switch -c feat/short-name`.
2. **Open a pull request into `test`.** CI runs automatically and Vercel posts a preview link.
   Green checks are required to merge into `test`; no approval is needed.
3. **Check it on the test deploy.** Merged work lands on the test environment's site.
4. **Release**: when test has been checked, open a PR from `test` into `main`.
   It needs green checks and one approval from a code owner who didn't open it.
   Merging it deploys to the live app.

Never push directly to `test` or `main`; both are protected.

## Branch names

`feat/…` new features · `fix/…` bug fixes · `chore/…` tooling, deps, docs · `hotfix/…` urgent live fixes

A **hotfix** may branch from `main` and PR straight into `main`.

## How test stays current with main

- Feature PRs into `test` use **squash merge** (one tidy commit per PR).
- Release PRs from `test` into `main` use a **merge commit**, so `main` and `test` share history.
- After a release, `test` and `main` hold the same code, so nothing else is needed.
- If `main` gets something `test` doesn't have (a hotfix), the *Keep test in sync with main*
  workflow opens a "Sync main → test" PR; an admin merges it with a merge commit.

## What CI checks

- ESLint on the files you changed
- TypeScript type check (`npx tsc --noEmit`)
- Tests (`npm test`)
- Production build (`npm run build`)
- All Supabase migrations apply cleanly to an empty database

Run the same checks locally before opening a PR:

```
npx eslint <changed files> && npx tsc --noEmit && npm test && npm run build
```

## Database changes

Add a new file under `supabase/migrations/`. Never edit a migration that has already been applied.
Test locally with `supabase db reset`, and describe the change in the PR.

## Environment variables and secrets

Secrets live in Vercel (and, where needed, GitHub environment settings), never in the repo.
If you add a variable, add it to `.env.example` with a comment, and tell whoever manages Vercel
so it gets set for both the Preview (test) and Production environments.
