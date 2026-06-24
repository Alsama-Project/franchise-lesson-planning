// Preloaded via `node --import ./scripts/loader-register.mjs` to register the
// extensionless-→-.ts resolve hook for the test suite and the dev ingest script.
import { register } from 'node:module';

register('./ts-ext-hook.mjs', import.meta.url);
