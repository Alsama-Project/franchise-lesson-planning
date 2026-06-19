import { AppShell } from '@/components/app-shell/AppShell';
import { ResourceBank } from '@/components/resources/ResourceBank';
import { createClient } from '@/lib/supabase/server';
import { getHeaderProfile } from '@/lib/profile';
import { getTagVocabulary, listFolders, listResources } from '@/lib/resources';
import type { Role } from '@/components/resources/types';

// Rendered per-request so it reflects the live session, role and bank contents.
export const dynamic = 'force-dynamic';

/**
 * The full-screen Resource Bank (/resources), inside the app shell. The server
 * loads everything the first paint needs through the auth'd, RLS-scoped client —
 * the signed-in user's role, the subject list, the tag vocabulary (scoped to the
 * default subject so subject-specific dimensions adapt), the first page of
 * resources, and the user's folders — then hands them to the client component,
 * which re-queries via Server Actions as the teacher filters and uploads. The
 * shell header identity comes from the shared `getHeaderProfile` helper.
 */
export default async function ResourcesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy protects this route, so a session should exist; stay safe anyway.
  const userId = user?.id ?? '';

  const [{ name, subtitle }, { data: profile }, { data: subjectRows }] = await Promise.all([
    getHeaderProfile(),
    supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
    supabase.from('subjects').select('id, name, code').order('name', { ascending: true }),
  ]);

  const role: Role = profile?.role === 'coordinator' ? 'coordinator' : 'teacher';

  const subjects = ((subjectRows ?? []) as Array<{ id: string; name: string; code: string }>).map(
    (s) => ({ id: s.id, name: s.name })
  );
  // Default the bank's subject scope to English (the first subject), so the
  // subject-specific facets (skill type, grammar content) appear.
  const english = (subjectRows ?? []).find(
    (s: { code: string }) => s.code === 'english'
  ) as { id: string } | undefined;
  const defaultSubjectId = english?.id ?? subjects[0]?.id ?? null;

  const [vocabulary, initialResources, initialFolders] = await Promise.all([
    getTagVocabulary(defaultSubjectId ?? undefined),
    listResources(defaultSubjectId ? { subjectId: defaultSubjectId } : {}),
    listFolders(),
  ]);

  return (
    <AppShell name={name} subtitle={subtitle}>
      <ResourceBank
        role={role}
        currentUserId={userId}
        subjects={subjects}
        defaultSubjectId={defaultSubjectId}
        vocabulary={vocabulary}
        initialResources={initialResources}
        initialFolders={initialFolders}
      />
    </AppShell>
  );
}
