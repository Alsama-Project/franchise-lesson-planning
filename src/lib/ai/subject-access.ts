import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';

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
