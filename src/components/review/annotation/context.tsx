'use client';

// Shared client state for the inline coordinator-review annotation layer. One
// provider wraps the whole review view (the read-only lesson on the left, the
// annotation pane on the right), so the read-side affordances woven into
// ReadOnlyPlan (badges, from→to pills, authoring controls) and the pane's cards
// speak to the same source of truth and can cross-highlight.
//
// Mutations refresh the server route (force-dynamic) rather than hand-maintaining
// optimistic arrays — router.refresh() re-runs the server load and preserves this
// client state (active card, tab, filter), so the list stays correct across every
// interaction type without a web of optimistic reconciliation.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { Annotation, AnchorType, AnnotationRole } from '@/types/annotation';
import type { PlanStatus } from '@/types/lesson';
import {
  createAnnotation,
  addAnnotationReply,
  setAnnotationResolved,
  decideSuggestion,
  updateSuggestion,
  deleteSuggestion,
  type CreateAnnotationInput,
} from '@/lib/actions/annotations';

export type ReviewTab = 'lesson' | 'worksheet';
export type AnnotationFilter = 'open' | 'resolved';

interface AnnotationContextValue {
  planId: string;
  status: PlanStatus;
  /** The viewer's role on this plan — drives authoring vs responding affordances. */
  role: AnnotationRole;
  viewerName: string;
  /** Whether the plan is editable (suggestions can be accepted): needs_review / in_progress. */
  editable: boolean;
  annotations: Annotation[];
  /** block.type → display title, so a phase anchor can label its card. */
  phaseTitles: Record<string, string>;

  // ── cross-highlight + navigation ───────────────────────────────────────────
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  tab: ReviewTab;
  setTab: (tab: ReviewTab) => void;
  filter: AnnotationFilter;
  setFilter: (f: AnnotationFilter) => void;
  /** Client-side "Unlock for editing" — coordinator suggesting mode. NOT a real
   *  unlock: it never changes plan status or writes the plan; inline edits become
   *  suggestions. Meaningful only for a coordinator. */
  suggesting: boolean;
  setSuggesting: (v: boolean) => void;

  // ── mutations (each refreshes the route) ─────────────────────────────────────
  pending: boolean;
  create: (input: CreateAnnotationInput) => Promise<boolean>;
  reply: (annotationId: string, body: string) => Promise<boolean>;
  resolve: (annotationId: string, resolved: boolean) => Promise<boolean>;
  decide: (annotationId: string, decision: 'accepted' | 'rejected') => Promise<boolean>;
  /** Revise a still-pending suggestion's proposed value (inline re-edit). */
  update: (annotationId: string, toValue: string) => Promise<boolean>;
  /** Withdraw a still-pending suggestion (inline edit reverted to the original). */
  remove: (annotationId: string) => Promise<boolean>;

  // ── selectors ────────────────────────────────────────────────────────────────
  /** Annotations anchored to a given phase (block type), any anchor_type. */
  forPhase: (phaseRef: string) => Annotation[];
  /** Annotations anchored to the objective. */
  forObjective: () => Annotation[];
  /** Annotations anchored to the worksheet (block level in Part A). */
  forWorksheet: () => Annotation[];
  /** The single pending-or-accepted structured suggestion of a shape on a phase. */
  suggestionFor: (phaseRef: string, shape: 'dur' | 'enum') => Annotation | undefined;
}

const Ctx = createContext<AnnotationContextValue | null>(null);

export function useAnnotations(): AnnotationContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAnnotations must be used within <AnnotationProvider>');
  return v;
}

/** Context or null — for read-side affordances that render on BOTH the member review
 *  view (provider present) and, unchanged, the plain read-only view a non-member
 *  sees (no provider). Returns null instead of throwing when unwrapped. */
export function useOptionalAnnotations(): AnnotationContextValue | null {
  return useContext(Ctx);
}

/** The label a phase/objective/worksheet anchor shows on its card. Titles are the
 *  block titles from ReadOnlyPlan; passed in so this stays free of lesson data. */
export interface AnnotationProviderProps {
  planId: string;
  status: PlanStatus;
  role: AnnotationRole;
  viewerName: string;
  annotations: Annotation[];
  phaseTitles: Record<string, string>;
  children: ReactNode;
}

export function AnnotationProvider({
  planId,
  status,
  role,
  viewerName,
  annotations,
  phaseTitles,
  children,
}: AnnotationProviderProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<ReviewTab>('lesson');
  const [filter, setFilter] = useState<AnnotationFilter>('open');
  const [suggesting, setSuggesting] = useState(false);

  const editable = status === 'needs_review' || status === 'in_progress';

  const runAndRefresh = (fn: () => Promise<{ ok: boolean }>): Promise<boolean> =>
    new Promise((resolve) => {
      startTransition(async () => {
        const res = await fn();
        if (res.ok) router.refresh();
        resolve(res.ok);
      });
    });

  const value = useMemo<AnnotationContextValue>(() => {
    const anchored = (t: AnchorType) => annotations.filter((a) => a.anchorType === t);

    return {
      planId,
      status,
      role,
      viewerName,
      editable,
      annotations,
      phaseTitles,
      activeId,
      setActiveId,
      tab,
      setTab,
      filter,
      setFilter,
      suggesting,
      setSuggesting,
      pending,
      create: (input) => runAndRefresh(() => createAnnotation(planId, input)),
      reply: (annotationId, body) => runAndRefresh(() => addAnnotationReply(annotationId, body)),
      resolve: (annotationId, resolved) =>
        runAndRefresh(() => setAnnotationResolved(annotationId, resolved)),
      decide: (annotationId, decision) =>
        runAndRefresh(() => decideSuggestion(annotationId, decision)),
      update: (annotationId, toValue) => runAndRefresh(() => updateSuggestion(annotationId, toValue)),
      remove: (annotationId) => runAndRefresh(() => deleteSuggestion(annotationId)),
      forPhase: (phaseRef) =>
        annotations.filter(
          (a) =>
            a.phaseRef === phaseRef &&
            (a.anchorType === 'phase' ||
              a.anchorType === 'phase_description' ||
              a.anchorType === 'phase_duration' ||
              a.anchorType === 'phase_enum'),
        ),
      forObjective: () => anchored('objective'),
      forWorksheet: () => anchored('worksheet_block'),
      suggestionFor: (phaseRef, shape) => {
        // Prefer a still-PENDING suggestion (its live pill) over an older accepted one
        // (its settled green), so a re-suggest after an accept shows the new proposal.
        const matches = annotations.filter(
          (a) =>
            a.kind === 'suggestion' &&
            a.suggestionShape === shape &&
            a.phaseRef === phaseRef &&
            a.status !== 'rejected',
        );
        return matches.find((a) => a.status === 'pending') ?? matches[matches.length - 1];
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, status, role, viewerName, editable, annotations, phaseTitles, activeId, tab, filter, suggesting, pending]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
