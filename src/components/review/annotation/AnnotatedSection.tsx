'use client';

// A commented lesson section in the Google-Docs-style review view. It wraps a plan
// section (the SMARTT objective box, or one content block) and, when an annotation
// provider is present:
//   • registers its DOM node so the floating card column can measure where the
//     section sits and lay its cards out beside it (see AnnotationPane);
//   • gives a clear hover / selected state — a light-teal fill — so it's obvious
//     which element you're about to click, and so selecting a card lights up its
//     section (the coupling reads both directions);
//   • paints a left-hand teal border when the section carries a card — SOLID teal
//     while any of its cards is open, MUTED once they are all resolved;
//   • toggles the section's card open/closed on a background click (clicks that land
//     on an inner control — the ＋ trigger, inline editors, pills — pass through);
//   • hosts the per-section add-comment ＋ trigger OUT in the right gutter (coordinator
//     only), tying it visually to the card column rather than the block body.
//
// Without a provider (a non-member's plain read-only plan, or the editor's Review
// step) it renders its children in a plain wrapper with the untouched border.

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { isResolvedCard, sectionKeyOf, useOptionalAnnotations } from './context';
import { CommentForm } from './PhaseRow';
import { AddCommentButton } from './AddCommentButton';
import { A } from './tokens';

/** Inner controls whose clicks must NOT toggle the section's card. */
const INTERACTIVE = 'button,a,input,textarea,select,[contenteditable="true"],[role="textbox"],[role="button"]';

export function AnnotatedSection({
  sectionKey,
  className,
  style,
  children,
}: {
  /** The alignment key this section owns — matches {@link sectionKeyOf} (e.g.
   *  'objective' or a block type like 'new_content'). */
  sectionKey: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ctx = useOptionalAnnotations();
  const t = useTranslations('review');
  const ref = useRef<HTMLDivElement>(null);
  const [composing, setComposing] = useState(false);
  // Grab the STABLE registrar (useCallback([]) in the provider) — depending on the
  // whole ctx object here would re-run this effect on every layoutVersion bump and
  // loop, since re-registering bumps layoutVersion again.
  const register = ctx?.registerSection;

  // Register/unregister this section's node for the pane's measurement pass.
  useEffect(() => {
    if (!register) return;
    const el = ref.current;
    register(sectionKey, el);
    return () => register(sectionKey, null);
  }, [register, sectionKey]);

  if (!ctx) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  const cards = ctx.annotations.filter((a) => sectionKeyOf(a) === sectionKey);
  const hasCards = cards.length > 0;
  const anyOpen = cards.some((a) => !isResolvedCard(a));
  const activeHere = cards.some((a) => a.id === ctx.activeId);
  const canAuthor = ctx.role === 'coordinator';

  // Solid teal while a card is open (or its card is the selected one); muted once all
  // of the section's cards are resolved. No cards → the section's own border, untouched.
  const borderStyle: CSSProperties = hasCards
    ? {
        borderInlineStartWidth: 3,
        borderInlineStartColor: anyOpen || activeHere ? A.sectionOpen : A.sectionMuted,
      }
    : {};
  // Selected card → light-teal fill on its section (the same fill hover gives), so the
  // coupling reads both ways. Hover is handled by a class below.
  const selectedBg: CSSProperties = activeHere ? { background: A.sectionHoverBg } : {};

  const toggle = (e: MouseEvent<HTMLDivElement>) => {
    if (!hasCards) return;
    // Let clicks on inner controls (the ＋ trigger, inline editors, pills) do their job.
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    const activeCard = cards.find((a) => a.id === ctx.activeId);
    ctx.setActiveId(activeCard ? null : cards[0].id);
  };

  // Comment create params from the section: the objective box vs a phase/block row.
  const createProps =
    sectionKey === 'objective'
      ? ({ anchorType: 'objective' } as const)
      : ({ anchorType: 'phase', phaseRef: sectionKey } as const);

  return (
    <div
      ref={ref}
      onClick={toggle}
      data-section-key={sectionKey}
      className={`relative ${hasCards ? 'transition-colors hover:bg-[#E7F1EE]' : ''} ${className ?? ''}`}
      style={{
        ...style,
        ...borderStyle,
        ...selectedBg,
        ...(hasCards ? { cursor: 'pointer' } : null),
      }}
    >
      {children}

      {/* Add-comment ＋ in the right gutter (coordinator only, lg+). Absolutely placed
          beside the block — out past the content column's padding into the gutter
          between the plan and the card column — so the block body stays clean. Hidden
          below lg to avoid horizontal overflow when the columns stack. */}
      {canAuthor ? (
        <div className="absolute hidden lg:block" style={{ insetInlineEnd: -44, top: 12 }}>
          <AddCommentButton
            label={t('annotations.addComment')}
            active={composing}
            onClick={() => setComposing((v) => !v)}
          />
        </div>
      ) : null}

      {/* Composer — appears in-section when the gutter ＋ is toggled. */}
      {canAuthor && composing ? (
        <div className="mt-[10px]">
          <CommentForm {...createProps} onClose={() => setComposing(false)} />
        </div>
      ) : null}
    </div>
  );
}
