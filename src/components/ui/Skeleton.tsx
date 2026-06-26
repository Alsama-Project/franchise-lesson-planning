import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A single pulsing placeholder bar/box. Colour follows the warm neutral ramp. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-sm bg-neutral-100", className)} aria-hidden />
  );
}

/**
 * The app-shell chrome as a skeleton, matching AppShell's header so route-level
 * `loading.tsx` fallbacks show the same frame instantly while the page streams
 * in. The body is supplied per route.
 */
export function AppShellSkeleton({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-screen flex-col"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <header className="sticky top-0 z-50 flex h-16 items-center gap-6 border-b border-border bg-surface px-[30px]">
        <div className="flex items-center gap-[11px]">
          <Skeleton className="h-[26px] w-[80px]" />
          <span className="h-[22px] w-px bg-neutral-200" />
          <Skeleton className="h-[14px] w-[110px]" />
        </div>
        <div className="hidden items-center gap-1 md:flex">
          <Skeleton className="h-[34px] w-[110px] rounded-[9px]" />
          <Skeleton className="h-[34px] w-[88px] rounded-[9px]" />
          <Skeleton className="h-[34px] w-[84px] rounded-[9px]" />
        </div>
        <div className="ms-auto flex items-center gap-[10px]">
          <Skeleton className="hidden h-[36px] w-[170px] rounded-[9px] sm:block" />
          <Skeleton className="size-[38px] rounded-[9px]" />
          <Skeleton className="h-[40px] w-[150px] rounded-full" />
        </div>
      </header>
      <main className="flex-1 bg-surface">
        <div className="px-6 py-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}

/** A card-shaped surface to hold a route's body skeleton. */
export function SkeletonCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
      {children}
    </div>
  );
}
