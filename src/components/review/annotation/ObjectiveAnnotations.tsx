'use client';

// Read-side affordance for the SMARTT objective on the review view. Renders nothing
// extra on a non-member's plain read-only view (no provider); with a provider it
// adds a count badge (focuses the objective's first card) and, for a coordinator, a
// "comment on the objective" toggle. Woven into ReadOnlyPlan BELOW the objective box
// (the box itself is the in-place text editor), so the comment composer attaches
// beneath the line rather than floating above it.

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useOptionalAnnotations } from './context';
import { CountBadge, CommentForm } from './PhaseRow';
import { AddCommentButton } from './AddCommentButton';

export function ObjectiveAnnotations() {
  const ctx = useOptionalAnnotations();
  const t = useTranslations('review');
  const locale = useLocale();
  const [authoring, setAuthoring] = useState(false);

  if (!ctx) return null;
  const cards = ctx.forObjective();
  const isCoordinator = ctx.role === 'coordinator';

  if (cards.length === 0 && !isCoordinator) return null;

  return (
    <div className="mt-[8px]">
      <div className="flex items-center gap-[8px]">
        {cards.length > 0 ? (
          <CountBadge count={cards.length} onClick={() => ctx.setActiveId(cards[0]?.id)} locale={locale} />
        ) : null}
        {isCoordinator ? (
          <AddCommentButton
            label={t('annotations.addComment')}
            active={authoring}
            onClick={() => setAuthoring((v) => !v)}
          />
        ) : null}
      </div>
      {isCoordinator && authoring ? (
        <div className="mt-[8px]">
          <CommentForm anchorType="objective" onClose={() => setAuthoring(false)} />
        </div>
      ) : null}
    </div>
  );
}
