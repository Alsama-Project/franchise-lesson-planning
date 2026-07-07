'use client';

// A commented lesson section in the Google-Docs-style review view. It wraps a plan
// section (the SMARTT objective box, or one content block) and does three things
// when an annotation provider is present:
//   • registers its DOM node so the floating card column can measure where the
//     section sits and lay its cards out beside it (see AnnotationPane);
//   • paints a left-hand teal border when the section carries a card — SOLID teal
//     while any of its cards is open, MUTED once they are all resolved;
//   • toggles the section's card open/closed on a background click (clicks that land
//     on an inner control — a button, link, field, inline editor — pass through).
//
// Without a provider (a non-member's plain read-only plan, or the editor's Review
// step) it renders its children in a plain wrapper with the untouched border, so the
// read-only plan looks exactly as before.

import { useEffect, useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { isResolvedCard, sectionKeyOf, useOptionalAnnotations } from './context';
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

  // Solid teal while a card is open (or its card is the selected one); muted once all
  // of the section's cards are resolved. No cards → the section's own border, untouched.
  const borderStyle: CSSProperties = hasCards
    ? {
        borderInlineStartWidth: 3,
        borderInlineStartColor: anyOpen || activeHere ? A.sectionOpen : A.sectionMuted,
      }
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
      className={className}
      style={{ ...style, ...borderStyle, ...(hasCards ? { cursor: 'pointer' } : null) }}
    >
      {children}
    </div>
  );
}
