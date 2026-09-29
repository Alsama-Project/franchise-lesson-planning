# Contributing

## How code reaches the live app

```
your branch  ──PR──▶  staging  ──release PR──▶  main
                     (test env)                (live)
```

1. **Branch from `staging`**: `git switch staging && git pull && git switch -c feat/short-name`.
2. **Open a pull request into `staging`.** CI runs automatically and Vercel posts a preview link.
   One approval and green checks are required to merge.
3. **Check it on the staging deploy.** Merged work lands on the staging site, the shared test environment.
4. **Release**: when staging has been checked, open a PR from `staging` into `main`.
   Merging it deploys to the live app.

Never push directly to `staging` or `main`; both are protected.

## Branch names

`feat/…` new features · `fix/…` bug fixes · `chore/…` tooling, deps, docs · `hotfix/…` urgent live fixes

A **hotfix** may branch from `main` and PR straight into `main`. Afterwards, merge `main` back into
`staging` so the two don't drift apart.

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
so it gets set for both the Preview (staging) and Production environments.
