// Node ESM resolve hook: lets extensionless relative imports (e.g. `./types`) resolve
// to their `.ts` file when running the curriculum parser directly on Node's
// TypeScript type-stripping. App source stays extensionless (so tsc + Next are
// unaffected); only the test/dev-script runner loads this hook via `--import`.
//
// It also (for the test/dev runner only) resolves the `@/*` path alias to `src/*`
// and stubs the `server-only` marker, so a test can import a server module (e.g.
// the AI floor) under `node --test`. Neither affects tsc or Next — they read
// tsconfig `paths` and the real `server-only` package respectively; this hook is
// loaded solely by the `--import` entry.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Repo `src/` root, resolved from this file's location (scripts/ -> ../src/).
const SRC_ROOT = new URL('../src/', import.meta.url);

// `import 'server-only'` is a compile-time guard; in the test process there is no
// bundler to enforce it and the package ships no plain-Node entry, so map it to an
// empty module instead of failing to resolve.
const SERVER_ONLY_STUB = 'data:text/javascript,export{}';

/** Resolve a `@/x` alias specifier to an on-disk URL under `src/`, or null. */
function resolveAlias(specifier) {
  const base = new URL(specifier.slice(2), SRC_ROOT); // drop '@/'
  for (const candidate of [base.href, `${base.href}.ts`, `${base.href}.tsx`]) {
    if (existsSync(fileURLToPath(candidate))) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    return { url: SERVER_ONLY_STUB, shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    const aliased = resolveAlias(specifier);
    if (aliased) return nextResolve(aliased, context);
  }
  if (specifier.startsWith('.') && !/\.[mc]?[jt]s$/.test(specifier)) {
    const parentURL = context.parentURL;
    if (parentURL) {
      const tsURL = new URL(`${specifier}.ts`, parentURL);
      if (existsSync(fileURLToPath(tsURL))) {
        return nextResolve(`${specifier}.ts`, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
