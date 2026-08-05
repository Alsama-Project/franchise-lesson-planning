import 'server-only';
import { createHash } from 'node:crypto';
import { STYLE_VERSION } from './image-floor';

// The worksheet-image dedupe key.
//
// The key hashes the SUBJECT — the plain literal thing depicted (1-4 words, authored
// by the model under the worksheet-builder floor) — NOT the prose brief. The brief is
// model-authored and differs slightly every generation, so hashing it gave a
// structurally zero cross-run hit rate: every worksheet paid full price for images it
// already had. A subject ("a bus") is stable across year groups and wordings, and the
// house style is already pinned by STYLE_VERSION, so subject is the correct key.
//
// Extracted from the image route as a pure function so this money-critical invariant
// is unit-tested directly rather than asserted by inspection.

/**
 * Normalise a subject for the cache key: lowercase, strip punctuation (keep letters,
 * numbers, whitespace — Unicode-aware so Arabic subjects survive), collapse
 * whitespace, then drop leading article(s) ("a bus" → "bus"). A deliberately literal
 * fold — no stemming, synonyms, or embeddings — so only trivially-equivalent subjects
 * collide.
 */
export function normaliseSubject(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:the|a|an)\s+)+/u, '');
}

/**
 * Content-addressed key: `sha256(normalise(subject[ :: instruction]) + ':' + STYLE_VERSION)`.
 *
 * A teacher `instruction` (a regeneration steer, e.g. "simpler") is folded into the key
 * so an instruction-adjusted image is stored under a DIFFERENT hash and never served to
 * a later plain request (cache poisoning). With no instruction the key is exactly the
 * subject hash, so two runs whose briefs differ but whose subject matches reuse one image.
 */
export function imageCacheKey(subject: string, instruction?: string | null): string {
  const steer = instruction?.trim();
  const material = steer ? `${subject} :: ${steer}` : subject;
  return createHash('sha256').update(`${normaliseSubject(material)}:${STYLE_VERSION}`).digest('hex');
}
