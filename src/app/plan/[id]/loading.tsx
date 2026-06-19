import { AppShellSkeleton, Skeleton } from '@/components/ui/Skeleton';

/**
 * Instant fallback for the lesson-plan editor while the plan, its class context,
 * curriculum target and activity bank load. Mirrors the wizard frame (sub-header
 * + stepper + curriculum band + objective) so the page never appears frozen.
 */
export default function Loading() {
  return (
    <AppShellSkeleton>
      <div className="-mx-6 -my-8 lg:-mx-10">
        {/* Sub-header */}
        <div className="border-b border-[#EFE8DD] px-[22px] py-4 lg:px-[30px]">
          <Skeleton className="mb-2.5 h-[14px] w-[90px]" />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Skeleton className="h-[22px] w-[320px]" />
            <Skeleton className="h-[20px] w-[110px]" />
          </div>
        </div>

        {/* Stepper band */}
        <div className="border-b border-[#EFE8DD] px-[22px] py-[15px] lg:px-[30px]">
          <div className="flex items-center gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-1 items-center gap-2.5">
                <Skeleton className="size-[30px] rounded-full" />
                <Skeleton className="hidden h-[14px] w-[110px] sm:block" />
              </div>
            ))}
            <Skeleton className="h-[38px] w-[120px] rounded-[9px]" />
          </div>
        </div>

        <div className="px-[22px] pt-[22px] lg:px-[30px]">
          {/* Curriculum band */}
          <Skeleton className="mb-3 h-[14px] w-[300px]" />
          <div className="grid grid-cols-1 gap-[14px] md:grid-cols-[1.5fr_1fr_1fr]">
            <Skeleton className="h-[88px] w-full rounded-[11px]" />
            <Skeleton className="h-[88px] w-full rounded-[11px]" />
            <Skeleton className="h-[88px] w-full rounded-[11px]" />
          </div>

          {/* Objective editor */}
          <Skeleton className="mt-[22px] h-[28px] w-[280px]" />
          <Skeleton className="mt-4 h-[150px] w-full rounded-[14px]" />
        </div>
      </div>
    </AppShellSkeleton>
  );
}
