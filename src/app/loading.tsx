import { AppShellSkeleton, Skeleton } from '@/components/ui/Skeleton';

/**
 * Instant fallback for the Weekly Overview while the server component fetches the
 * teacher's week. Mirrors the header + weekday columns so navigation never feels
 * frozen. Prefetched by Next, so it appears immediately on navigation.
 */
export default function Loading() {
  return (
    <AppShellSkeleton>
      {/* Header: title + week nav + toggle */}
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-[25px] w-[140px]" />
          <Skeleton className="h-[14px] w-[240px]" />
        </div>
        <div className="flex items-center gap-[14px]">
          <Skeleton className="h-8 w-[250px]" />
          <Skeleton className="h-9 w-[170px] rounded-[9px]" />
        </div>
      </div>

      {/* Weekday columns */}
      <div className="grid grid-cols-5 items-start gap-[14px]">
        {Array.from({ length: 5 }).map((_, col) => (
          <div key={col} className="flex flex-col gap-[11px]">
            <div className="border-b-2 border-neutral-100 px-[2px] pb-[10px]">
              <Skeleton className="h-[16px] w-[70px]" />
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-[12px] border border-border p-[13px]">
                <Skeleton className="h-[11px] w-[56px]" />
                <Skeleton className="mt-2 h-[14px] w-[80px]" />
                <Skeleton className="mt-[9px] h-[18px] w-[88px] rounded-badge" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </AppShellSkeleton>
  );
}
