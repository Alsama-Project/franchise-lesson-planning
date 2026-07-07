'use client';

// Read-side affordance for the SMARTT objective on the review view. Renders nothing
// on a non-member's plain read-only view (no provider); with a provider it shows a
// count badge (focuses the objective's first card) below the objective box. The
// add-comment ＋ now lives in the right gutter (AnnotatedSection), so this no longer
// carries an authoring trigger.

import { useLocale } from 'next-intl';
import { useOptionalAnnotations } from './context';
import { CountBadge } from './PhaseRow';

export function ObjectiveAnnotations() {
  const ctx = useOptionalAnnotations();
  const locale = useLocale();

  if (!ctx) return null;
  const cards = ctx.forObjective();
  if (cards.length === 0) return null;

  return (
    <div className="mt-[8px] flex items-center gap-[8px]">
      <CountBadge count={cards.length} onClick={() => ctx.setActiveId(cards[0]?.id)} locale={locale} />
    </div>
  );
}
