'use client';

// The review annotation column — reworked into a Google-Docs-style floating stack.
// There is no header note-count, no Open/Resolved tabs and no separate "general
// feedback" section any more; instead EVERY annotation (comment, suggestion, whole-
// plan) is one unified card (see AnnotationCard) and the cards float beside the
// section they annotate. Whole-plan cards have no section, so they stack at the top
// of the column. A small "N open · N resolved" line sits at the top (with the plan-
// level ＋ trigger) and the role-aware footer (Return / Approve · Resubmit) below.
//
// Layout: on large screens each section's cards are absolutely positioned at the
// section's measured vertical offset, then packed downward so groups never overlap —
// this is what lines a card up beside its section. Below `lg` (and before the first
// measurement) the groups simply stack in normal flow. The measurement re-runs on
// resize and whenever a section or card changes height.

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

const GENERAL_KEY = '__general__';
const GAP = 12; // vertical gap packed between stacked card groups (px)

/** A group of cards that share a section (or the whole-plan group). */
interface CardGroup {
  key: string;
  /** The section alignment key, or null for the whole-plan group. */
  sectionKey: string | null;
  cards: Annotation[];
}

export function AnnotationPane() {
  const t = useTranslations('review');
  const locale = useLocale();
  const ctx = useAnnotations();
  const { annotations, role, activeId, sectionsRef, layoutVersion, openCount, create, pending } = ctx;

  const [addingGeneral, setAddingGeneral] = useState(false);

  // ── group the cards ──────────────────────────────────────────────────────────
  const groups = useMemo<CardGroup[]>(() => {
    const general = annotations.filter((a) => sectionKeyOf(a) === null);
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
    const sectionGroups: CardGroup[] = [];
    for (const [key, cards] of bySection) sectionGroups.push({ key, sectionKey: key, cards });
    const out: CardGroup[] = [];
    if (general.length > 0 || addingGeneral) out.push({ key: GENERAL_KEY, sectionKey: null, cards: general });
    out.push(...sectionGroups);
    return out;
  }, [annotations, addingGeneral]);

  // ── informational counts (INCLUDES whole-plan cards) ─────────────────────────
  const total = annotations.length;
  const resolved = annotations.filter(isResolvedCard).length;
  const openDisplay = total - resolved;

  // ── position-aware alignment ─────────────────────────────────────────────────
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
    // Flow mode — clear absolute positioning; groups stack naturally. Used below `lg`
    // and, on first paint, until the sections have registered their nodes (measuring
    // against an empty registry would pile every card at the top for one frame).
    const needsSections = groups.some((g) => g.sectionKey !== null);
    if (!isLg || groups.length === 0 || (needsSections && sectionsRef.current.size === 0)) {
      setPositions(null);
      setLayerHeight(null);
      return;
    }
    const layerTop = layer.getBoundingClientRect().top;

    // Desired top for each group: the general group pins to 0; a section group to its
    // section's offset within the cards layer. Sort section groups by that offset so
    // packing preserves the plan's reading order.
    const desired = new Map<string, number>();
    for (const g of groups) {
      if (g.sectionKey === null) {
        desired.set(g.key, 0);
      } else {
        const el = sectionsRef.current.get(g.sectionKey);
        desired.set(g.key, el ? el.getBoundingClientRect().top - layerTop : 0);
      }
    }
    const ordered = [...groups].sort((a, b) => {
      if (a.sectionKey === null) return -1;
      if (b.sectionKey === null) return 1;
      return (desired.get(a.key) ?? 0) - (desired.get(b.key) ?? 0);
    });

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
  }, [groups, sectionsRef]);

  const schedule = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      recompute();
    });
  }, [recompute]);

  // Recompute before paint on any change that can move a section or resize a card.
  // This is the measure-then-position pattern: it reads live DOM geometry and commits
  // the resulting card tops synchronously so the stack lands correctly on first paint
  // (no flash). The set-state-in-effect lint rule can't model that, so it's disabled
  // here deliberately.
  useLayoutEffect(() => {
    recompute();
  }, [recompute, activeId, layoutVersion, addingGeneral]);

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

  const onAddGeneral = () => {
    setAddingGeneral(true);
    schedule();
  };

  return (
    <section aria-label={t('annotations.title')} className="flex flex-col">
      {/* Top line — "N open · N resolved" + plan-level ＋ (whole-plan comment). It
          pins to the top; its solid background covers cards scrolling behind it. */}
      <div className="z-20 mb-[10px] flex items-center gap-[8px] bg-surface py-[4px] lg:sticky lg:top-[calc(var(--app-chrome-height,64px)_+_16px)]">
        <span className="text-[12px] font-semibold" style={{ color: A.tabIdleFg }}>
          {total > 0
            ? t('annotations.counts', {
                open: formatNumber(openDisplay, locale),
                resolved: formatNumber(resolved, locale),
              })
            : t('annotations.countEmpty')}
        </span>
        {role === 'coordinator' ? (
          <span className="ms-auto">
            <AddCommentButton
              onClick={onAddGeneral}
              active={addingGeneral}
              label={t('annotations.addPlan')}
            />
          </span>
        ) : null}
      </div>

      {/* The floating card layer. Given an explicit height while floating so the
          packed absolute cards reserve their space and the footer flows below. */}
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
            flow mode (mobile / pre-measure) they stack with a gap. */}
        <div className={floating ? undefined : 'flex flex-col gap-[12px]'}>
          {groups.map((g) => (
            <div
              key={g.key}
              className={floating ? 'absolute inset-x-0' : undefined}
              style={floating ? { top: positions?.get(g.key) ?? 0 } : undefined}
            >
              <GroupBox
                group={g}
                setRef={setGroupEl(g.key)}
                onCreate={create}
                pending={pending}
                closeGeneral={() => setAddingGeneral(false)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Role-aware footer, below the stack. */}
      <div className="mt-[14px] lg:sticky lg:bottom-[14px]">
        <Footer planId={ctx.planId} status={ctx.status} scope={ctx.scope} role={role} openCount={openCount} />
      </div>
    </section>
  );
}

/** One positioned group: a whole-plan composer (when open) + its cards. */
function GroupBox({
  group,
  setRef,
  onCreate,
  pending,
  closeGeneral,
}: {
  group: CardGroup;
  setRef: (el: HTMLDivElement | null) => void;
  onCreate: ReturnType<typeof useAnnotations>['create'];
  pending: boolean;
  closeGeneral: () => void;
}) {
  const isGeneral = group.sectionKey === null;
  return (
    <div ref={setRef} className="flex flex-col gap-[9px]">
      {isGeneral ? <GeneralComposer onCreate={onCreate} pending={pending} onClose={closeGeneral} /> : null}
      {group.cards.length > 0 ? (
        <ul className="flex flex-col gap-[9px]">
          {group.cards.map((a) => (
            <AnnotationCard key={a.id} annotation={a} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The whole-plan composer (coordinator only), shown at the top of the stack when
 *  the plan-level ＋ is pressed. It creates a `general` comment — same as today. */
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
      <span
        className="inline-flex rounded-[6px] px-[7px] py-[1px] text-[10.5px] font-semibold"
        style={{ color: A.countFg, background: A.countBg }}
      >
        {t('annotations.anchor.general')}
      </span>
      <textarea
        dir="auto"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        autoFocus
        placeholder={t('annotations.general.placeholder')}
        className="mt-[8px] block w-full resize-none rounded-[10px] border bg-white px-[11px] py-[8px] text-[13px] leading-[1.5] text-ink outline-none focus:border-teal"
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
