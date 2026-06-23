// Small shared presentational pieces for the onboarding + settings pickers.
import type { ReactNode } from 'react';
import type { Literacy } from '@/lib/onboarding';

/** White check used inside teal checkboxes/avatars. */
export function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fff"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12l4 4 10-11" />
    </svg>
  );
}

/** Neutral subject chip (e.g. "English") used on class rows. */
export function SubjectChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[6px] bg-[#F3ECE2] px-2 py-[3px] text-[10.5px] text-neutral-700">
      {children}
    </span>
  );
}

/**
 * Literacy pill. The schema enum is literate | illiterate | mixed; the design
 * labels illiterate as "Pre-literate" (teal for literate, pink for pre-literate,
 * neutral for mixed).
 */
export function LiteracyPill({ literacy }: { literacy: Literacy }) {
  const map: Record<Literacy, { label: string; cls: string }> = {
    literate: { label: 'Literate', cls: 'bg-teal-tint text-teal-deep' },
    illiterate: { label: 'Pre-literate', cls: 'bg-[#FBEFF3] text-pink' },
    mixed: { label: 'Mixed', cls: 'bg-[#EFEAE3] text-neutral-700' },
  };
  const { label, cls } = map[literacy];
  return (
    <span className={`rounded-[6px] px-2 py-[3px] text-[10.5px] font-semibold ${cls}`}>{label}</span>
  );
}

/** Two-letter avatar from a subject name, e.g. "English" → "En". */
export function subjectInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed[0].toUpperCase() + (trimmed[1]?.toLowerCase() ?? '');
}
