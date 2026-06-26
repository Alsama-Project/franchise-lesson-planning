'use client';

// Shared presentational primitives for the admin console's upload surfaces — the
// curriculum sync card and the two guidance-document upload cards (AI resource
// guide, SMARTT objective guide). Extracted so all three share one progress bar,
// one status-pill treatment and one stat layout: same teal action semantics, same
// look and feel. Colour tokens follow the curriculum card exactly.

import type { ReactNode } from 'react';

/** A relative "x ago" for the last-synced / last-uploaded line. */
export function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Local clock time as HH:MM (for the "… failed · {HH:MM}" badge). */
export function hhmm(iso: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** A labelled stat in the card's header row (uppercase label over a value). */
export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#A79E94]">{label}</div>
      <div className="mt-px truncate text-[14px] font-semibold tabular-nums text-[#2A2422]">{value}</div>
    </div>
  );
}

/**
 * The upload progress element. Determinate (teal fill + `{pct}% · {parsed} of
 * ~{total}`) when the caller exposes parsed/total; otherwise a single
 * indeterminate teal bar with no text under it. Numbers are never fabricated — a
 * single-shot upload (no progress counts) simply renders indeterminate.
 */
export function UploadProgressBar({
  parsed,
  total,
  label = 'Uploading',
}: {
  parsed?: number;
  total?: number;
  label?: string;
}) {
  const determinate = typeof total === 'number' && total > 0 && typeof parsed === 'number';
  if (determinate) {
    const pct = Math.min(100, Math.max(0, Math.round((parsed! / total!) * 100)));
    return (
      <div>
        <div className="relative h-[6px] w-full overflow-hidden rounded-full bg-[#E4F0ED]">
          <div
            className="h-full rounded-full bg-[#1F7A6C] transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-[7px] text-[12px] text-[#A79E94]">
          {pct}% · {parsed} of ~{total}
        </p>
      </div>
    );
  }
  return (
    <div
      className="relative h-[6px] w-full overflow-hidden rounded-full bg-[#E4F0ED]"
      role="progressbar"
      aria-label={label}
    >
      <span className="curriculum-sync-bar" />
    </div>
  );
}

/** Status pill in the card header — teal for normal states, red for failures. */
export function UploadStatusBadge({ tone, label }: { tone: 'teal' | 'red'; label: string }) {
  const palette =
    tone === 'red' ? { bg: '#FBF2F5', fg: '#B23A2E' } : { bg: '#E4F0ED', fg: '#186155' };
  return (
    <span
      className="inline-flex items-center rounded-full px-[10px] py-[3px] text-[11.5px] font-semibold"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {label}
    </span>
  );
}
