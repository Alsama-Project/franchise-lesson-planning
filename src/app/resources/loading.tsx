import { AppShellSkeleton, Skeleton, SkeletonCard } from '@/components/ui/Skeleton';

/**
 * Instant fallback for the Resource Bank while the server loads the role,
 * vocabulary and first page of resources. Mirrors the search header + sidebar +
 * card-grid frame so navigation never feels frozen.
 */
export default function Loading() {
  return (
    <AppShellSkeleton>
      <SkeletonCard>
        {/* Search header */}
        <div className="flex items-center gap-4 border-b border-border px-8 py-5">
          <Skeleton className="h-[46px] flex-1 rounded-[12px]" />
          <Skeleton className="h-[40px] w-[170px] rounded-[9px]" />
        </div>

        <div className="grid grid-cols-[286px_1fr]">
          {/* Sidebar */}
          <div className="border-r border-border bg-surface-subtle p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="border-t border-[#EFE8DD] py-[13px]">
                <Skeleton className="mb-3 h-[12px] w-[80px]" />
                <Skeleton className="mb-2 h-[14px] w-full" />
                <Skeleton className="h-[14px] w-[70%]" />
              </div>
            ))}
          </div>

          {/* Card grid */}
          <div className="px-8 pb-8 pt-[18px]">
            <Skeleton className="mb-[14px] h-[16px] w-[180px]" />
            <div className="grid grid-cols-3 gap-[14px]">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-[14px] border border-border">
                  <Skeleton className="h-20 rounded-none" />
                  <div className="p-[13px]">
                    <Skeleton className="mb-2 h-[14px] w-[90%]" />
                    <Skeleton className="mb-2 h-[16px] w-[60%] rounded-badge" />
                    <Skeleton className="h-[11px] w-[70%]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SkeletonCard>
    </AppShellSkeleton>
  );
}
