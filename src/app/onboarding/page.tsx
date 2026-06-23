import { Wordmark } from '@/components/ui/Wordmark';
import { getOnboardingData } from '@/lib/onboarding';
import { OnboardingForm } from '@/components/onboarding/OnboardingForm';

// Per-request: reflects the live session and the user's (empty) membership state.
export const dynamic = 'force-dynamic';

/**
 * First-run setup. The proxy routes any authenticated user with no
 * `subject_membership` row here; once a space exists the gate bounces this route
 * back to `/`. The shell is shown but its nav is greyed — the user can't leave
 * setup midway.
 */
export default async function OnboardingPage() {
  const data = await getOnboardingData();

  return (
    <div className="flex min-h-screen flex-col bg-[#FBF8F3]">
      <OnboardingHeader />
      <main className="flex flex-1 flex-col items-center px-7 pb-[34px] pt-8">
        <OnboardingForm data={data} />
      </main>
    </div>
  );
}

/** Static, non-interactive top bar — nav links greyed so the user can't navigate. */
function OnboardingHeader() {
  return (
    <header className="flex h-[58px] items-center gap-[18px] border-b border-border bg-surface px-5">
      <div className="flex items-center gap-[9px]">
        <Wordmark size="sm" tone="brand" className="leading-[0.7]" />
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
