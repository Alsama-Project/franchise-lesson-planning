'use client';

// The loading skeleton for one exercise: a solid pink box with sheened lines, at
// the height implied by the spec's estimated_height (short / medium / tall). Used
// two ways:
//   • during a full generation — one per planned spec, at its estimated height;
//   • during a per-card regenerate — at the card's CURRENT measured height, so
//     nothing below it moves (that height is passed in by the card).
// No overlay, no global spinner — the skeletons ARE the wait, and they are what
// make the long generation watchable.

export function ExerciseSkeleton({ height }: { height: number }) {
  // A handful of sheened lines proportional to the reserved height.
  const lineCount = Math.max(2, Math.min(8, Math.round((height - 40) / 42)));
  return (
    <div
      className="ws-no-print overflow-hidden rounded-[14px] bg-[#F7E4EB] p-[18px]"
      style={{ height }}
      role="status"
      aria-busy="true"
    >
      <div className="flex h-full flex-col gap-[14px]">
        <SheenBar className="h-[14px] w-[46%]" />
        <div className="flex flex-1 flex-col gap-[11px]">
          {Array.from({ length: lineCount }).map((_, i) => (
            <SheenBar key={i} className={`h-[10px] ${i % 3 === 2 ? 'w-[62%]' : 'w-full'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** One pulsing bar on the pink field (a lighter pink, animated). */
function SheenBar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-white/55 ${className ?? ''}`} aria-hidden />;
}
