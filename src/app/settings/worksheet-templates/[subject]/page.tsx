import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { getHeaderProfile } from '@/lib/profile';
import { getConsoleAccess } from '@/lib/console';
import { createClient } from '@/lib/supabase/server';
import { getTagVocabulary } from '@/lib/resources';
import type { WorksheetContext } from '@/components/editor/worksheet/context';
import type { WorksheetContentLanguage } from '@/lib/editor/worksheet-content-locale';
import { TemplateModeEditor } from '@/components/settings/worksheet-templates/TemplateModeEditor';

// Per-request: reflects the live session, the caller's role, and the stored template.
export const dynamic = 'force-dynamic';

/**
 * Settings ▸ Worksheet Templates ▸ {Subject} master — Template Mode.
 *
 * Gated to `is_admin() OR is_coordinator_of_subject(subject)` at BOTH the route level
 * (here) and the DB level (RLS on `worksheet_template`, migration 0062). The `[subject]`
 * route param is the subject UUID. Loads the subject + its stored template body and
 * mounts the SAME worksheet editor in Template Mode; the editor autosaves to
 * `worksheet_template.body` (never a `lesson_plans` row).
 */
export default async function WorksheetTemplatePage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const { subject } = await params;
  const subjectId = decodeURIComponent(subject);

  const access = await getConsoleAccess();
  const coordinatesThis = access.coordinatorSpaces.some((s) => s.subjectId === subjectId);
  if (!access.isAdmin && !coordinatesThis) redirect('/settings');

  const supabase = await createClient();
  const [{ data: subjectRow }, { data: templateRow }, { name, subtitle }] = await Promise.all([
    supabase.from('subjects').select('id, name, content_language').eq('id', subjectId).maybeSingle(),
    supabase.from('worksheet_template').select('body').eq('subject_id', subjectId).maybeSingle(),
    getHeaderProfile(),
  ]);

  const subjectData = subjectRow as { id: string; name: string; content_language: string | null } | null;
  if (!subjectData) redirect('/settings');

  const contentLanguage: WorksheetContentLanguage =
    subjectData.content_language === 'ar' ? 'ar' : 'en';
  const vocabulary = await getTagVocabulary(subjectId);
  const initialBody = (templateRow as { body: unknown } | null)?.body ?? null;

  // Template Mode has no lesson: the master frame renders subject + language only;
  // the objective strip shows its "appears when a teacher plans" hint (empty objective),
  // and there is no year/theme/centre/lesson code. The generate/bank services read
  // `subjectName` + `subjectId`; the curriculum anchors are legitimately empty.
  const context: WorksheetContext = {
    subjectName: subjectData.name,
    contentLanguage,
    year: null,
    theme: '',
    dailyOutcome: '',
    smarttObjective: '',
    centreName: '',
    lessonCode: '',
    exitTicket: '',
    weeklyOutcome: '',
    monthlyLo: '',
    grammarVocab: '',
    lessonPlanId: '',
    subjectId,
  };

  return (
    <AppShell name={name} subtitle={subtitle}>
      <TemplateModeEditor
        subjectId={subjectId}
        subjectName={subjectData.name}
        initialBody={initialBody}
        context={context}
        vocabulary={vocabulary}
      />
    </AppShell>
  );
}
