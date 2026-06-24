// Node ESM resolve hook: lets extensionless relative imports (e.g. `./types`) resolve
// to their `.ts` file when running the curriculum parser directly on Node's
// TypeScript type-stripping. App source stays extensionless (so tsc + Next are
// unaffected); only the test/dev-script runner loads this hook via `--import`.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
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
