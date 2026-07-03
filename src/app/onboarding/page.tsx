import { Logo } from '@/components/ui/Logo';
import { getOnboardingData } from '@/lib/onboarding';
import { createClient } from '@/lib/supabase/server';
import { OnboardingForm } from '@/components/onboarding/OnboardingForm';
import { PendingApproval } from '@/components/onboarding/PendingApproval';

// Per-request: reflects the live session and the user's (empty) membership state.
export const dynamic = 'force-dynamic';

/**
 * First-run setup. The proxy routes any authenticated user with no active space
 * (`subject_membership` OR `coordinator_subject`) here; once a space exists the
 * gate bounces this route back to `/`. A user awaiting coordinator approval has
 * neither, so they stay here — and we show them the pending screen instead of the
 * form. The shell is shown but its nav is greyed — the user can't leave setup
 * midway.
 */
export default async function OnboardingPage() {
  const pending = await getPendingCoordinatorRequest();

  return (
    <div className="flex min-h-screen flex-col bg-[#FBF8F3]">
      <OnboardingHeader />
      <main className="flex flex-1 flex-col items-center px-7 pb-[34px] pt-8">
        {pending ? <PendingApproval subjectName={pending.subjectName} /> : <OnboardingFormLoader />}
      </main>
    </div>
  );
}

async function OnboardingFormLoader() {
  const data = await getOnboardingData();
  return <OnboardingForm data={data} />;
}

/**
 * The caller's own pending coordinator request (if any), with its subject name.
 * `coordinator_request_select_own` RLS lets a user read only their own rows, so
 * this auth'd read is safe and self-scoped.
 */
async function getPendingCoordinatorRequest(): Promise<{ subjectName: string | null } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('coordinator_request')
    .select('id, subjects ( name )')
    .eq('profile_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as { id: string; subjects: { name: string } | null } | null;
  if (!row) return null;
  return { subjectName: row.subjects?.name ?? null };
}

/** Static, non-interactive top bar — nav links greyed so the user can't navigate. */
function OnboardingHeader() {
  return (
    <header className="flex h-[58px] items-center gap-[18px] border-b border-border bg-surface px-5">
      <div className="flex items-center gap-[9px]">
        <Logo size="sm" tone="dark" />
        <span className="h-[19px] w-px bg-[#E2D9CC]" />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-neutral-600">
          Lesson Planning
        </span>
      </div>
      <nav aria-hidden className="flex items-center gap-[2px] opacity-60">
        <span className="rounded-[8px] bg-teal-tint px-[11px] py-[6px] text-[12.5px] font-semibold text-teal-deep">
          Lesson Planning
        </span>
        <span className="px-[11px] py-[6px] text-[12.5px] font-medium text-[#BBB1A6]">Curriculum</span>
        <span className="px-[11px] py-[6px] text-[12.5px] font-medium text-[#BBB1A6]">Resources</span>
      </nav>
    </header>
  );
}
