// H6 · Minimum versions for dependencies with known, fixed flaws. Reads the lockfile,
// so a downgrade (or a stale lockfile) fails CI rather than shipping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lock = JSON.parse(readFileSync(new URL('../../../package-lock.json', import.meta.url), 'utf8')) as {
  packages: Record<string, { version?: string }>;
};

function atLeast(installed: string, floor: string): boolean {
  const a = installed.split(/[.-]/).map(Number);
  const b = floor.split('.').map(Number);
  for (let i = 0; i < b.length; i++) {
    if ((a[i] ?? 0) !== b[i]) return (a[i] ?? 0) > b[i];
  }
  return true;
}

const FLOORS: Record<string, string> = {
  next: '16.3.6', // fixes a way around the sign-in check in the proxy
  xlsx: '0.20.2', // 0.18.5 (the last npm release) has unfixed parsing flaws; newer builds ship from cdn.sheetjs.com
};

for (const [name, floor] of Object.entries(FLOORS)) {
  test(`H6: ${name} is at least ${floor}`, () => {
    const installed = lock.packages[`node_modules/${name}`]?.version;
    assert.ok(installed, `${name} not found in package-lock.json`);
    assert.ok(atLeast(installed, floor), `${name} ${installed} is below ${floor}`);
  });
}
