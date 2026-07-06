'use client';

// The design's "Unlock for editing" header CTA — a coordinator-only, client-side
// SUGGESTING toggle. It is NOT a real unlock: it never changes plan status and never
// writes the plan. While on, the coordinator's inline edits (objective / description
// text, duration, grouping) are captured as plan_annotations suggestions; the plan is
// only ever mutated when the TEACHER accepts one. Renders nothing for the teacher or a
// non-member (no provider).

import { useTranslations } from 'next-intl';
import { useOptionalAnnotations } from './context';
import { A } from './tokens';

export function SuggestingToggle() {
  const ctx = useOptionalAnnotations();
  const t = useTranslations('review');
  if (!ctx || ctx.role !== 'coordinator') return null;

  const on = ctx.suggesting;
  return (
    <button
      type="button"
      onClick={() => ctx.setSuggesting(!on)}
      aria-pressed={on}
      className="inline-flex items-center gap-[6px] rounded-[9px] border px-[11px] py-[6px] text-[12.5px] font-semibold transition-colors"
      style={on ? { background: A.teal, color: '#fff', borderColor: A.teal } : { background: 'transparent', color: A.teal, borderColor: A.tealBorder }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {on ? (
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        ) : (
          <>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </>
        )}
      </svg>
      {on ? t('annotations.suggesting.on') : t('annotations.suggesting.off')}
    </button>
  );
}
