// Who may run a curriculum import. Shared by the upload route
// (src/app/api/curriculum/import/route.ts) and the server action
// (src/lib/curriculum/actions.ts) so both paths apply the same rule.

import type { SupabaseClient } from '@supabase/supabase-js';

/** The caller's standing for one subject. */
export type ImportStanding = 'admin' | 'coordinator' | 'member' | 'none';

/**
 * A dry run only parses and reports, so any member of the subject may run one. A real
 * run changes the subject's curriculum for every centre, so it needs an admin or a
 * coordinator of that subject.
 */
export function mayRunImport(standing: ImportStanding, dryRun: boolean): boolean {
  if (standing === 'none') return false;
  if (dryRun) return true;
  return standing === 'admin' || standing === 'coordinator';
}

/**
 * The signed-in caller's standing for a subject, read from the database helpers
 * (is_admin / is_coordinator_of_subject / is_participant_of_subject), which also
 * treat a deactivated account as having no standing.
 */
export async function resolveImportStanding(
  supabase: SupabaseClient,
  subjectId: string,
): Promise<ImportStanding> {
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (isAdmin === true) return 'admin';
  const { data: isCoordinator } = await supabase.rpc('is_coordinator_of_subject', {
    p_school: null,
    p_subject: subjectId,
  });
  if (isCoordinator === true) return 'coordinator';
  const { data: isParticipant } = await supabase.rpc('is_participant_of_subject', { p_subject: subjectId });
  return isParticipant === true ? 'member' : 'none';
}
