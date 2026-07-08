'use client';

// The review annotation column — a Google-Docs-style floating stack. Every annotation
// (comment, suggestion, whole-plan) is one unified card (see AnnotationCard). There is
// NO comments pane and NO decision footer here anymore: the decision buttons live in
// the plan header (PlanDecisionButtons) and the cards FLOAT in the right margin, each
// beside the section it annotates. The "N open · N resolved" line and the WHOLE-PLAN
// (general) cards + the plan-level ＋ form one block at the TOP of the column; the
// SECTION-anchored cards float BELOW it, each beside its section, and scroll beneath.
//
// Layout: on large screens each section's cards are absolutely positioned at the
// section's measured vertical offset, then packed downward so groups never overlap —
// this is what lines a card up beside its section. Below `lg` (and before the first
// measurement, and when there are no sections to measure) the groups stack in normal
// flow. The measurement re-runs on resize and whenever a section or card changes height.
//
// The in-margin composer: pressing a section's ＋ (in the gutter, AnnotatedSection) sets
// `composingKey`; the pane then floats a "New comment" card beside that section — typing
// happens on the RIGHT, where the comment will land, never inline in the lesson body.
//
// `embedded` renders the pane inside the editor's Review step rather than the
// standalone /view page. Both surfaces render the SAME section-anchored plan body
// (ReadOnlyPlan), so both float; `embedded` only drops the page-chrome sticky offsets
// (the editor supplies its own scroll container).

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslations } from 'next-intl';
import { initialsOf } from '@/components/weekly-overview/avatar';
import type { Annotation } from '@/types/annotation';
import { AnnotationCard } from './AnnotationCard';
import { AddCommentButton } from './AddCommentButton';
import { sectionKeyOf, useAnnotations } from './context';
import { A } from './tokens';

const GAP = 12; // vertical gap packed between stacked section-card groups (px)

/** A group of cards that share a section. */
interface CardGroup {
  key: string;
  cards: Annotation[];
}

export function AnnotationPane() {
  const t = useTranslations('review');
  const ctx = useAnnotations();
  const {
    annotations,
    role,
    activeId,
    sectionsRef,
    layoutVersion,
    composingKey,
    setComposingKey,
    phaseTitles,
    viewerName,
    create,
    pending,
  } = ctx;

  const [addingGeneral, setAddingGeneral] = useState(false);

  // ── numbering (1-based, reading order across ALL cards) ──────────────────────
  // The map is over the whole annotation list (already ordered oldest→newest by the
  // loader), so a card's badge number is stable regardless of which group renders it.
  const numberById = useMemo(() => {
    const m = new Map<string, number>();
    annotations.forEach((a, i) => m.set(a.id, i + 1));
    return m;
  }, [annotations]);

  // ── group the cards ──────────────────────────────────────────────────────────
  // Section-anchored groups float in the layer; general (whole-plan) cards live in
  // the top block with the counts.
  const generalCards = useMemo(
    () => annotations.filter((a) => sectionKeyOf(a) === null),
    [annotations],
  );
  const groups = useMemo<CardGroup[]>(() => {
    const bySection = new Map<string, Annotation[]>();
    for (const a of annotations) {
      const key = sectionKeyOf(a);
      if (key === null) continue;
      let arr = bySection.get(key);
      if (!arr) {
        arr = [];
        bySection.set(key, arr);
      }
      arr.push(a);
    }
    const list = [...bySection].map(([key, cards]) => ({ key, cards }));
    // A section whose ＋ is open but which has no cards yet still needs a slot in the
    // margin so its "New comment" card floats beside it (composing on the objective or
    // a phase — general composing lives in the top block, not here).
    if (composingKey !== null && composingKey !== '__general__' && !bySection.has(composingKey)) {
      list.push({ key: composingKey, cards: [] });
    }
    return list;
  }, [annotations, composingKey]);

  // Whether any card exists at all — drives the empty-state note.
  const total = annotations.length;

  // ── position-aware alignment (section groups only) ───────────────────────────
  const layerRef = useRef<HTMLDivElement>(null);
  const groupEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const [positions, setPositions] = useState<Map<string, number> | null>(null);
  const [layerHeight, setLayerHeight] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const setGroupEl = useCallback((key: string) => (el: HTMLDivElement | null) => {
    if (el) groupEls.current.set(key, el);
    else groupEls.current.delete(key);
  }, []);

  const recompute = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const isLg = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
    // Flow mode — clear absolute positioning; groups stack naturally. Used below `lg`,
    // when there are no groups, and on first paint until the sections register their
    // nodes (measuring against an empty registry would pile every card at the top for
    // one frame). The `embedded` editor Review step renders the SAME section-anchored
    // plan body as /view, so it floats too — gated only by the section-registry check.
    if (!isLg || groups.length === 0 || sectionsRef.current.size === 0) {
      setPositions(null);
      setLayerHeight(null);
      return;
    }
    const layerTop = layer.getBoundingClientRect().top;

    // Desired top for each group = its section's offset within the cards layer, PLUS a
    // clearance so the first card never sits on the section's ＋ (which floats at the
    // section's top-right). Only the coordinator sees the ＋, so only they need it. Sort
    // by offset so packing preserves the plan's reading order.
    const CLEAR = role === 'coordinator' ? 44 : 0;
    const desired = new Map<string, number>();
    for (const g of groups) {
      const el = sectionsRef.current.get(g.key);
      desired.set(g.key, (el ? el.getBoundingClientRect().top - layerTop : 0) + CLEAR);
    }
    const ordered = [...groups].sort((a, b) => (desired.get(a.key) ?? 0) - (desired.get(b.key) ?? 0));

    // Pack downward: each group sits at max(its desired top, the running cursor).
    const next = new Map<string, number>();
    let cursor = 0;
    for (const g of ordered) {
      const h = groupEls.current.get(g.key)?.offsetHeight ?? 0;
      const top = Math.max(desired.get(g.key) ?? 0, cursor);
      next.set(g.key, top);
      cursor = top + h + GAP;
    }
    setPositions(next);
    setLayerHeight(cursor);
  }, [groups, sectionsRef, role]);

  const schedule = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      recompute();
    });
  }, [recompute]);

  // Recompute before paint on any change that can move a section or resize a card
  // (selecting a card, opening a composer, a section mount/unmount).
  useLayoutEffect(() => {
    recompute();
  }, [recompute, activeId, composingKey, layoutVersion]);

  // Observe section + group sizes and the window so the stack self-heals on resize
  // (inline edits, card expand/collapse, viewport changes). Re-attached whenever the
  // set of sections or groups changes.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => schedule());
    for (const el of sectionsRef.current.values()) ro.observe(el);
    for (const el of groupEls.current.values()) ro.observe(el);
    window.addEventListener('resize', schedule);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [schedule, sectionsRef, layoutVersion, groups]);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  const floating = positions !== null;
  const canAuthorGeneral = role === 'coordinator';

  const sectionLabel = (key: string) =>
    key === 'objective' ? t('annotations.anchor.objective') : phaseTitles[key] ?? t('annotations.anchor.phase');

  return (
    <section aria-label={t('annotations.title')} className="flex flex-col">
      {/* TOP block — the whole-plan (general) cards + the plan-level ＋, floated at the
          top of the right margin. There is NO "N open · N resolved" line here: the count
          lives solely as the "N open" pill on the Approve button (its single source). The
          section-anchored cards float BELOW and scroll beneath this block. */}
      <div className="pointer-events-auto mb-[14px] flex flex-col gap-[10px]">
        {generalCards.length > 0 || canAuthorGeneral ? (
          <div className="flex flex-col gap-[9px]">
            {canAuthorGeneral ? (
              <div className="flex items-center gap-[8px]">
                <span
                  className="text-[11px] font-bold uppercase tracking-[0.05em]"
                  style={{ color: A.tabIdleFg }}
                >
                  {t('annotations.anchor.general')}
                </span>
                <span className="ms-auto">
                  <AddCommentButton
                    label={t('annotations.addPlan')}
                    active={addingGeneral}
                    onClick={() => setAddingGeneral((v) => !v)}
                  />
                </span>
              </div>
            ) : null}
            {addingGeneral ? (
              <MarginComposer
                tagLabel={t('annotations.compose.newComment')}
                sectionLabel={t('annotations.anchor.general')}
                viewerName={viewerName}
                roleLabel={t('activity.role.coordinator')}
                placeholder={t('annotations.general.placeholder')}
                submitLabel={t('annotations.compose.submit')}
                cancelLabel={t('annotations.reply.cancel')}
                pending={pending}
                onSubmit={(note) => create({ kind: 'comment', anchorType: 'general', note })}
                onClose={() => setAddingGeneral(false)}
              />
            ) : null}
            {generalCards.length > 0 ? (
              <ul className="flex flex-col gap-[9px]">
                {generalCards.map((a) => (
                  <AnnotationCard key={a.id} annotation={a} number={numberById.get(a.id) ?? 0} />
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* The floating card layer — SECTION-anchored cards, scrolling BELOW the top
          block. Given an explicit height while floating so the packed absolute cards
          reserve their space. */}
      <div
        ref={layerRef}
        className="relative"
        style={floating && layerHeight != null ? { height: layerHeight } : undefined}
      >
        {total === 0 && !addingGeneral && composingKey === null ? (
          <p className="py-[6px] text-[12.5px] leading-[1.5]" style={{ color: A.emptyBody }}>
            {t('annotations.empty.body')}
          </p>
        ) : null}

        {/* One stable structure across flow/floating so groups never remount: in
            floating mode each wrapper is absolutely positioned at its packed top; in
            flow mode they stack with a gap. */}
        <div className={floating ? undefined : 'flex flex-col gap-[12px]'}>
          {groups.map((g) => (
            <div
              key={g.key}
              className={floating ? 'pointer-events-auto absolute inset-x-0' : 'pointer-events-auto'}
              style={floating ? { top: positions?.get(g.key) ?? 0 } : undefined}
            >
              <div ref={setGroupEl(g.key)}>
                <ul className="flex flex-col gap-[9px]">
                  {g.cards.map((a) => (
                    <AnnotationCard key={a.id} annotation={a} number={numberById.get(a.id) ?? 0} />
                  ))}
                  {composingKey === g.key ? (
                    <li>
                      <MarginComposer
                        lifted
                        tagLabel={t('annotations.compose.newComment')}
                        sectionLabel={sectionLabel(g.key)}
                        viewerName={viewerName}
                        roleLabel={t('activity.role.coordinator')}
                        placeholder={t('annotations.author.commentPlaceholder')}
                        submitLabel={t('annotations.compose.submit')}
                        cancelLabel={t('annotations.reply.cancel')}
                        pending={pending}
                        onSubmit={(note) =>
                          create(
                            g.key === 'objective'
                              ? { kind: 'comment', anchorType: 'objective', note }
                              : { kind: 'comment', anchorType: 'phase', phaseRef: g.key, note },
                          )
                        }
                        onClose={() => setComposingKey(null)}
                      />
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** A "New comment" card that opens in the RIGHT MARGIN beside the section it belongs
 *  to (or, for a whole-plan note, in the top block). Matches the mock: a header (tag +
 *  section name), the author row, a textarea styled as the input, and Comment + Cancel.
 *  When `lifted` it wears the selected-card chrome (teal ring, shifted toward the plan).
 *  Typing happens here on the right — never inline in the lesson body on the left. */
function MarginComposer({
  tagLabel,
  sectionLabel,
  viewerName,
  roleLabel,
  placeholder,
  submitLabel,
  cancelLabel,
  pending,
  onSubmit,
  onClose,
  lifted = false,
}: {
  tagLabel: string;
  sectionLabel: string;
  viewerName: string;
  roleLabel: string;
  placeholder: string;
  submitLabel: string;
  cancelLabel: string;
  pending: boolean;
  onSubmit: (note: string) => Promise<boolean>;
  onClose: () => void;
  lifted?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the field WITHOUT scrolling: the compose card is absolutely positioned and,
  // on the first paint of a brand-new section group, briefly sits at top 0 before the
  // layout pass places it — a plain autofocus there would yank the page to the top.
  // `preventScroll` keeps the page exactly where the coordinator clicked the ＋.
  useEffect(() => {
    areaRef.current?.focus({ preventScroll: true });
  }, []);

  const submit = async () => {
    const note = draft.trim();
    if (!note || pending) return;
    const ok = await onSubmit(note);
    if (ok) {
      setDraft('');
      onClose();
    }
  };

  return (
    <div
      className={`overflow-hidden rounded-[13px] border bg-white ${
        lifted ? '-translate-x-[10px] rtl:translate-x-[10px]' : ''
      }`}
      style={{
        borderColor: A.teal,
        boxShadow: lifted
          ? `0 0 0 3px ${A.suggestionBg}, 0 26px 52px -22px rgba(20,40,36,0.55)`
          : '0 10px 28px -18px rgba(20,40,36,0.45)',
      }}
    >
      <div
        className="flex items-center gap-[8px] border-b px-[13px] py-[11px]"
        style={{ borderColor: A.cardBorder }}
      >
        <span
          className="flex-shrink-0 rounded-[4px] px-[7px] py-[2px] text-[9px] font-bold uppercase tracking-[0.05em]"
          style={{ color: A.openTagFg, background: A.openTagBg }}
        >
          {tagLabel}
        </span>
        <span dir="auto" className="min-w-0 flex-1 truncate text-[11px]" style={{ color: A.tabIdleFg }}>
          {sectionLabel}
        </span>
      </div>
      <div className="px-[13px] pb-[13px] pt-[12px]">
        <div className="mb-[9px] flex items-start gap-[9px]">
          <span
            aria-hidden
            className="mt-[1px] inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ background: A.avCoord }}
          >
            {initialsOf(viewerName)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-[6px]">
              <span dir="auto" className="text-[12.5px] font-semibold text-ink">
                {viewerName}
              </span>
              <span
                className="rounded-[4px] px-[5px] py-[1px] text-[9px] font-bold uppercase tracking-[0.04em]"
                style={{ color: A.badgeCoordFg, background: A.badgeCoordBg }}
              >
                {roleLabel}
              </span>
            </div>
          </div>
        </div>
        <textarea
          ref={areaRef}
          dir="auto"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder={placeholder}
          className="block w-full resize-none rounded-[9px] border bg-white px-[11px] py-[9px] text-[12.5px] leading-[1.5] text-ink outline-none"
          style={{ borderColor: A.teal, boxShadow: '0 0 0 3px rgba(31,122,108,0.12)' }}
        />
        <div className="mt-[10px] flex items-center gap-[8px]">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!draft.trim() || pending}
            className="inline-flex items-center gap-[6px] rounded-[8px] px-[15px] py-[8px] text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: A.teal }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {submitLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-[4px] py-[8px] text-[12px] font-medium"
            style={{ color: A.neutralFg }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
