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
//     only), tying it visually to the card column rather than the block body. Pressing
//     it opens a "New comment" card in the RIGHT MARGIN beside this section (the pane
//     renders it, keyed on `composingKey`) — never an inline box in the block body.
//
// Without a provider (a non-member's plain read-only plan, or the editor's Review
// step) it renders its children in a plain wrapper with the untouched border.

import { useEffect, useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { isResolvedCard, sectionKeyOf, useOptionalAnnotations } from './context';
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
  const composingHere = ctx.composingKey === sectionKey;
  // A section reads as "active" (selected card OR its ＋ composer open) — it gets the
  // full teal treatment; a section that merely carries a card is coupled but calmer.
  const active = activeHere || composingHere;

  // Left border marks a commented (or composing) section: SOLID teal while it is active
  // or any card is open, MUTED once all its cards are resolved. A composing-but-empty
  // section (＋ open, no cards yet) gets the solid teal too. No cards + not composing →
  // the section's own border, untouched.
  const marked = hasCards || composingHere;
  const borderStyle: CSSProperties = marked
    ? {
        borderInlineStartWidth: 3,
        borderInlineStartColor: anyOpen || active ? A.sectionOpen : A.sectionMuted,
      }
    : {};
  // Active → light-teal fill (mock #F0F7F4); a resolved-only commented section gets the
  // fainter wash (mock #FBFDFC). Hover is handled by a class below.
  const fillBg: CSSProperties = active
    ? { background: A.sectionActiveBg }
    : hasCards && !anyOpen
      ? { background: A.sectionHoverMuted }
      : {};

  const toggle = (e: MouseEvent<HTMLDivElement>) => {
    if (!hasCards) return;
    // Let clicks on inner controls (the ＋ trigger, inline editors, pills) do their job.
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    const activeCard = cards.find((a) => a.id === ctx.activeId);
    ctx.setActiveId(activeCard ? null : cards[0].id);
  };

  return (
    <div
      ref={ref}
      onClick={toggle}
      data-section-key={sectionKey}
      className={`group relative ${hasCards ? 'transition-colors hover:bg-[#E7F1EE]' : ''} ${className ?? ''}`}
      style={{
        ...style,
        ...borderStyle,
        ...fillBg,
        ...(hasCards ? { cursor: 'pointer' } : null),
      }}
    >
      {children}

      {/* Add-comment ＋ at the section's top-right (coordinator only, lg+). The plan body
          is full-width and the comment cards overlay the right margin, so there is no
          gutter — the ＋ reveals on hover (or when this section is active/composing) and
          sits ABOVE the cards (z-30). The cards are packed with a top clearance so they
          open below it, never on it. Pressing it opens a "New comment" card in the right
          margin (pane, keyed on composingKey). */}
      {canAuthor ? (
        <div
          className={`absolute z-30 hidden transition-opacity lg:block ${
            composingHere || activeHere ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ insetInlineEnd: 8, top: 8 }}
        >
          <AddCommentButton
            label={t('annotations.addComment')}
            active={composingHere}
            onClick={() => ctx.setComposingKey(composingHere ? null : sectionKey)}
          />
        </div>
      ) : null}
    </div>
  );
}
