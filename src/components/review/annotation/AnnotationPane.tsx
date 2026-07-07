'use client';

// The review annotation column — a Google-Docs-style floating stack. Every annotation
// (comment, suggestion, whole-plan) is one unified card (see AnnotationCard). The
// SECTION-anchored cards float beside the section they annotate; the WHOLE-PLAN
// (general) cards and the role-aware footer (Return / Approve · Resubmit) form one
// block at the BOTTOM of the column, with the plan-level ＋ that adds a general
// comment. A small "N open · N resolved" line sits at the top.
//
// Layout: on large screens each section's cards are absolutely positioned at the
// section's measured vertical offset, then packed downward so groups never overlap —
// this is what lines a card up beside its section. Below `lg` (and before the first
// measurement, and in the `embedded` editor context where there are no sections to
// measure) the groups stack in normal flow. The measurement re-runs on resize and
// whenever a section or card changes height.
//
// `embedded` renders the pane inside the editor's Review step (its own scroll
// container) rather than the standalone /view page: it drops the page-chrome sticky
// offsets so the column simply scrolls.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/format';
import { decidePlan, submitLessonPlanById } from '@/lib/actions/lesson-plan';
import type { Annotation } from '@/types/annotation';
import { AnnotationCard } from './AnnotationCard';
import { AddCommentButton } from './AddCommentButton';
import { isResolvedCard, sectionKeyOf, useAnnotations } from './context';
import { A } from './tokens';

const GAP = 12; // vertical gap packed between stacked section-card groups (px)

/** A group of cards that share a section. */
interface CardGroup {
  key: string;
  cards: Annotation[];
}

export function AnnotationPane({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations('review');
  const locale = useLocale();
  const ctx = useAnnotations();
  const { annotations, role, activeId, sectionsRef, layoutVersion, openCount, create, pending } = ctx;

  const [addingGeneral, setAddingGeneral] = useState(false);

  // ── group the cards ──────────────────────────────────────────────────────────
  // Section-anchored groups float in the layer; general (whole-plan) cards live in
  // the bottom block with the footer.
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
    return [...bySection].map(([key, cards]) => ({ key, cards }));
  }, [annotations]);

  // ── informational counts (INCLUDES whole-plan cards) ─────────────────────────
  const total = annotations.length;
  const resolved = annotations.filter(isResolvedCard).length;
  const openDisplay = total - resolved;

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
    // Flow mode — clear absolute positioning; groups stack naturally. Used when
    // `embedded` (no sections to measure), below `lg`, when there are no groups, and
    // on first paint until the sections register their nodes (measuring against an
    // empty registry would pile every card at the top for one frame).
    if (embedded || !isLg || groups.length === 0 || sectionsRef.current.size === 0) {
      setPositions(null);
      setLayerHeight(null);
      return;
    }
    const layerTop = layer.getBoundingClientRect().top;

    // Desired top for each group = its section's offset within the cards layer. Sort by
    // that offset so packing preserves the plan's reading order.
    const desired = new Map<string, number>();
    for (const g of groups) {
      const el = sectionsRef.current.get(g.key);
      desired.set(g.key, el ? el.getBoundingClientRect().top - layerTop : 0);
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
  }, [groups, sectionsRef, embedded]);

  const schedule = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      recompute();
    });
  }, [recompute]);

  // Recompute before paint on any change that can move a section or resize a card.
  useLayoutEffect(() => {
    recompute();
  }, [recompute, activeId, layoutVersion]);

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

  return (
    <section aria-label={t('annotations.title')} className="flex flex-col">
      {/* Top line — "N open · N resolved". Pins to the top on the standalone view; its
          solid background covers cards scrolling behind it. */}
      <div
        className={`z-20 mb-[10px] flex items-center gap-[8px] py-[4px] ${
          embedded ? '' : 'bg-surface lg:sticky lg:top-[calc(var(--app-chrome-height,64px)_+_16px)]'
        }`}
      >
        <span className="text-[12px] font-semibold" style={{ color: A.tabIdleFg }}>
          {total > 0
            ? t('annotations.counts', {
                open: formatNumber(openDisplay, locale),
                resolved: formatNumber(resolved, locale),
              })
            : t('annotations.countEmpty')}
        </span>
      </div>

      {/* The floating card layer — SECTION-anchored cards. Given an explicit height
          while floating so the packed absolute cards reserve their space. */}
      <div
        ref={layerRef}
        className="relative"
        style={floating && layerHeight != null ? { height: layerHeight } : undefined}
      >
        {total === 0 && !addingGeneral ? (
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
              className={floating ? 'absolute inset-x-0' : undefined}
              style={floating ? { top: positions?.get(g.key) ?? 0 } : undefined}
            >
              <div ref={setGroupEl(g.key)}>
                <ul className="flex flex-col gap-[9px]">
                  {g.cards.map((a) => (
                    <AnnotationCard key={a.id} annotation={a} />
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom block — whole-plan cards + plan-level ＋ + the role-aware footer, all
          together. Section cards scroll above it; on the standalone view it pins to the
          bottom so the decision buttons stay reachable. */}
      <div
        className={`mt-[14px] flex flex-col gap-[10px] ${embedded ? '' : 'lg:sticky lg:bottom-[14px]'}`}
      >
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
              <GeneralComposer onCreate={create} pending={pending} onClose={() => setAddingGeneral(false)} />
            ) : null}
            {generalCards.length > 0 ? (
              <ul className="flex flex-col gap-[9px]">
                {generalCards.map((a) => (
                  <AnnotationCard key={a.id} annotation={a} />
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* The role-aware footer belongs to the standalone /view. In the EMBEDDED
            editor context the plan's own header SubmitControl already owns Resubmit
            (and it, not the pane, tracks the editor's live status), so the pane omits
            its footer to avoid a duplicate, drift-prone control. */}
        {embedded ? null : (
          <Footer planId={ctx.planId} status={ctx.status} scope={ctx.scope} role={role} openCount={openCount} />
        )}
      </div>
    </section>
  );
}

/** The whole-plan composer (coordinator only), shown in the bottom block when the
 *  plan-level ＋ is pressed. It creates a `general` comment — same as today. */
function GeneralComposer({
  onCreate,
  pending,
  onClose,
}: {
  onCreate: ReturnType<typeof useAnnotations>['create'];
  pending: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('review');
  const [draft, setDraft] = useState('');

  const submit = async () => {
    const note = draft.trim();
    if (!note || pending) return;
    const ok = await onCreate({ kind: 'comment', anchorType: 'general', note });
    if (ok) {
      setDraft('');
      onClose();
    }
  };

  return (
    <div className="rounded-[12px] border bg-white p-[11px]" style={{ borderColor: A.tealBorder }}>
      <textarea
        dir="auto"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        autoFocus
        placeholder={t('annotations.general.placeholder')}
        className="block w-full resize-none rounded-[10px] border bg-white px-[11px] py-[8px] text-[13px] leading-[1.5] text-ink outline-none focus:border-teal"
        style={{ borderColor: A.textareaBorder }}
      />
      <div className="mt-[7px] flex items-center gap-[8px]">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!draft.trim() || pending}
          className="rounded-[9px] px-[13px] py-[7px] text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: A.teal }}
        >
          {t('annotations.general.submit')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-[12.5px] font-medium"
          style={{ color: A.neutralFg }}
        >
          {t('annotations.reply.cancel')}
        </button>
      </div>
    </div>
  );
}

/** Role-aware footer: coordinator decides (decidePlan), teacher resubmits. Unchanged
 *  behaviour — including the Approve-demotes-while-anything-open rule (openCount is
 *  the shared anchored-only open count, so a whole-plan note never blocks approval). */
function Footer({
  planId,
  status,
  scope,
  role,
  openCount,
}: {
  planId: string;
  status: string;
  scope: string;
  role: string;
  openCount: number;
}) {
  const t = useTranslations('review');
  const router = useRouter();
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean }>) => {
    setError(null);
    startBusy(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else setError(t('annotations.footer.error'));
    });
  };

  if (role === 'teacher') {
    if (status !== 'needs_review' || scope !== 'class') return null;
    return (
      <div className="rounded-[14px] border bg-white px-[16px] py-[13px] shadow-[0_18px_50px_-28px_rgba(20,12,8,0.4)]" style={{ borderColor: A.paneBorder }}>
        <p className="mb-[9px] text-[11.5px] leading-[1.4]" style={{ color: A.hint }}>
          {t('annotations.footer.teacherHint')}
        </p>
        <button
          type="button"
          onClick={() => run(() => submitLessonPlanById(planId))}
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-[6px] rounded-[10px] px-[12px] py-[10px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: A.teal }}
        >
          {busy ? t('annotations.footer.working') : t('annotations.footer.resubmit')}
        </button>
        {error ? <p className="mt-[8px] text-[12px] font-medium text-pink">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border bg-white px-[16px] py-[13px] shadow-[0_18px_50px_-28px_rgba(20,12,8,0.4)]" style={{ borderColor: A.paneBorder }}>
      {status === 'submitted' ? (
        (() => {
          const hasOpen = openCount > 0;
          return (
            <>
              <div className="flex gap-[9px]">
                <button
                  type="button"
                  onClick={() => run(() => decidePlan(planId, 'return'))}
                  disabled={busy}
                  className={`inline-flex items-center justify-center gap-[6px] rounded-[10px] px-[12px] py-[10px] text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 ${
                    hasOpen ? 'text-white' : 'border bg-white'
                  }`}
                  style={{
                    flex: hasOpen ? '1.4' : '1',
                    ...(hasOpen
                      ? { background: A.teal }
                      : { color: A.teal, borderColor: A.tealBorder }),
                  }}
                >
                  {t('annotations.footer.return')}
                </button>
                <button
                  type="button"
                  onClick={() => run(() => decidePlan(planId, 'approve'))}
                  disabled={busy}
                  className={`inline-flex items-center justify-center gap-[6px] rounded-[10px] px-[12px] py-[10px] text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 ${
                    hasOpen ? 'border bg-white' : 'text-white'
                  }`}
                  style={{
                    flex: hasOpen ? '1' : '1.4',
                    ...(hasOpen
                      ? { color: A.teal, borderColor: A.tealBorder }
                      : { background: A.teal }),
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {busy ? t('annotations.footer.working') : t('annotations.footer.approve')}
                </button>
              </div>
              {hasOpen ? (
                <p className="mt-[9px] text-[11px] leading-[1.4]" style={{ color: A.hint }}>
                  {t('annotations.footer.resolveBeforeApprove')}
                </p>
              ) : null}
            </>
          );
        })()
      ) : status === 'approved' ? (
        <button
          type="button"
          onClick={() => run(() => decidePlan(planId, 'undo'))}
          disabled={busy}
          className="inline-flex w-full items-center justify-center rounded-[10px] border bg-white px-[12px] py-[10px] text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ color: A.teal, borderColor: A.tealBorder }}
        >
          {busy ? t('annotations.footer.working') : t('annotations.footer.undo')}
        </button>
      ) : status === 'needs_review' ? (
        <button
          type="button"
          onClick={() => run(() => decidePlan(planId, 'reopen'))}
          disabled={busy}
          className="inline-flex w-full items-center justify-center rounded-[10px] border bg-white px-[12px] py-[10px] text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ color: A.teal, borderColor: A.tealBorder }}
        >
          {busy ? t('annotations.footer.working') : t('annotations.footer.reopen')}
        </button>
      ) : null}
      {error ? <p className="mt-[8px] text-end text-[12px] font-medium text-pink">{error}</p> : null}
    </div>
  );
}
