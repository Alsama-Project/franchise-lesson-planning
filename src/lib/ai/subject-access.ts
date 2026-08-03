import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import {
  toContentLanguage,
  type WorksheetContentLanguage,
} from '@/lib/editor/worksheet-content-locale';

/**
 * Server-side validation of a client-supplied subject UUID before it is allowed
 * to steer the AI context stack.
 *
 * WHY THIS EXISTS: `get_active_context_stack(tool, subject_id)` is SECURITY
 * DEFINER, so RLS places no constraint on which subject's documents a caller can
 * pull. A stale, spoofed, or simply mismatched `subject_id` from the browser
 * would silently compose the prompt under the WRONG subject's instructions —
 * a worse failure than the null we are removing. So we never trust the client's
 * id: we confirm the caller genuinely belongs to that subject, and on any doubt
 * fall back to null (the request is still serviceable without a subject).
 *
 * THE EXACT CHECK (does not use `is_member_of_subject`, whose teacher branch
 * needs a school id we do not have here, and whose argument semantics changed
 * across migrations): the caller is allowed iff
 *   - they are an admin (`profiles.role = 'admin'`), OR
 *   - they own a `subject_membership` row for this `subject_id` — queried under
 *     their OWN RLS and filtered by `profile_id = <self>`, so a hit is
 *     unambiguously the caller's own membership (not a teammate's row they can
 *     merely see), at any centre.
 * Everything runs on the RLS-honouring server client; the service-role key is
 * never used.
 */

export type SubjectResolution = 'present' | 'absent' | 'rejected';

export interface ResolvedSubject {
  /** The subject UUID to pass to the composer, or null when absent/rejected. */
  subjectId: string | null;
  /** How it was resolved: no id supplied, validated, or supplied-but-unauthorised. */
  resolution: SubjectResolution;
}

/**
 * Resolve a raw (client-supplied, untrusted) subject id into a validated one.
 * `absent` = nothing usable was supplied; `present` = the caller may use it;
 * `rejected` = an id was supplied but the caller is not a member/admin, so it is
 * dropped to null.
 */
export async function resolveSubjectId(raw: unknown): Promise<ResolvedSubject> {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { subjectId: null, resolution: 'absent' };
  }
  const subjectId = raw.trim();

  const profile = await getCurrentProfile();
  if (!profile) return { subjectId: null, resolution: 'rejected' };
  if (profile.role === 'admin') return { subjectId, resolution: 'present' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('subject_membership')
    .select('id')
    .eq('profile_id', profile.id)
    .eq('subject_id', subjectId)
    .limit(1);

  if (!error && Array.isArray(data) && data.length > 0) {
    return { subjectId, resolution: 'present' };
  }
  return { subjectId: null, resolution: 'rejected' };
}

/**
 * Resolve the SUBJECT's content language (`subjects.content_language`) for a
 * subject id that {@link resolveSubjectId} has ALREADY validated as `present`.
 * This is the single source of truth for a subject's language — never inferred
 * from its code or name (see migration 0061).
 *
 * CALL ONLY for a `present` subject. An `absent` or `rejected` id must never
 * reach here: a rejected id must not trigger a `subjects` query, and there is no
 * trustworthy subject to read a language from. The caller falls back to English
 * in those cases and records the fallback — never a silent drop to UI locale.
 *
 * Runs on the RLS-honouring server client (`subjects` is a read-only reference
 * table for authenticated users); the service-role key is never used. Defaults to
 * English when the row/column is missing or unreadable — mirroring the DB default
 * and the worksheet path's {@link toContentLanguage}.
 */
export async function resolveContentLanguage(
  subjectId: string,
): Promise<WorksheetContentLanguage> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('subjects')
    .select('content_language')
    .eq('id', subjectId)
    .maybeSingle();

  if (error || !data) return 'en';
  return toContentLanguage((data as { content_language: unknown }).content_language);
}

/** The checker's feedback language plus how it was chosen — mirrors the shape of
 *  {@link ResolvedSubject} (a value + a resolution enum). */
export interface ResolvedFeedbackLanguage {
  /** The language the model must write feedback in. */
  contentLanguage: WorksheetContentLanguage;
  /** `subject` = read from the resolved subject; `fallback` = English, no read. */
  languageResolution: 'subject' | 'fallback';
}

/**
 * Decide the SMARTT checker's feedback language from an already-resolved subject.
 *
 * The one rule this encodes: read `content_language` ONLY for a `present`
 * subject. An `absent` or `rejected` id must not trigger a `subjects` query — it
 * falls back to English, recorded as `'fallback'` so the fallback is queryable in
 * the compose log, never a silent drop to the UI locale (the bug being fixed).
 *
 * `readLanguage` is injectable purely so the decision can be tested without a DB;
 * it defaults to the real {@link resolveContentLanguage} and is never overridden
 * in production.
 */
export async function resolveFeedbackLanguage(
  resolved: ResolvedSubject,
  readLanguage: (subjectId: string) => Promise<WorksheetContentLanguage> = resolveContentLanguage,
): Promise<ResolvedFeedbackLanguage> {
  if (resolved.resolution === 'present' && resolved.subjectId) {
    return { contentLanguage: await readLanguage(resolved.subjectId), languageResolution: 'subject' };
  }
  return { contentLanguage: 'en', languageResolution: 'fallback' };
}
