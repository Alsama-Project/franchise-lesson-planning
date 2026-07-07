'use client';

// The header row of a content block on the review view, woven into ReadOnlyPlan.
// Without an annotation provider (a non-member's plain read-only view) it renders
// EXACTLY the original markup — grouping badge · title · "{n} min". With a provider
// it adds: a count badge (clicks focus the phase's first card), a teal from→to pill
// in the duration / grouping cell for a live suggestion (green once accepted), and a
// per-row Comment affordance (coordinator).
//
// PART B: authoring duration/grouping is DIRECT INLINE EDITING (the old "Suggest a
// time" / "Suggest a grouping" buttons are gone). There is no mode — for a coordinator
// clicking the `{n} min` value opens a stepper in the cell and clicking the grouping
// tag opens a picker; committing creates / updates / withdraws the same dur / enum
// suggestion the pills and accept/reject already use. Comments stay available too.

import { useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/format';
import type { TeachingPhase } from '@/types/lesson';
import { useOptionalAnnotations } from './context';
import { pendingSuggestion } from './finders';
import { A } from './tokens';

const PHASE_LABEL: Record<TeachingPhase, string> = { i_do: 'I do', we_do: 'We do', you_do: 'You do' };
const PHASE_ORDER: TeachingPhase[] = ['i_do', 'we_do', 'you_do'];

export function PhaseRow({
  type,
  title,
  phase,
  minutes,
}: {
  type: string;
  title: string;
  phase: TeachingPhase | null;
  minutes: number;
}) {
  const ctx = useOptionalAnnotations();
  const t = useTranslations('review');
  const locale = useLocale();
  const [editing, setEditing] = useState<null | 'dur' | 'enum'>(null);

  const durSug = ctx?.suggestionFor(type, 'dur'); // non-rejected → pill / green
  const enumSug = ctx?.suggestionFor(type, 'enum');
  const phaseCards = ctx?.forPhase(type) ?? [];
  const isCoordinator = ctx?.role === 'coordinator';
  // No mode: a coordinator edits duration/grouping in place at all times.
  const canEdit = !!isCoordinator;

  const pendingDur = ctx
    ? pendingSuggestion(ctx.annotations, { shape: 'dur', anchorType: 'phase_duration', phaseRef: type })
    : undefined;
  const pendingEnum = ctx
    ? pendingSuggestion(ctx.annotations, { shape: 'enum', anchorType: 'phase_enum', phaseRef: type })
    : undefined;

  const focus = (id?: string) => {
    if (id && ctx) ctx.setActiveId(id);
  };

  // ── commits (never touch the plan — only the suggestion) ─────────────────────
  const commitDur = async (val: number) => {
    setEditing(null);
    if (!ctx) return;
    if (pendingDur) {
      if (val === Number(pendingDur.fromValue)) await ctx.remove(pendingDur.id);
      else if (val === Number(pendingDur.toValue)) return;
      else await ctx.update(pendingDur.id, String(val));
    } else {
      if (val === minutes) return;
      await ctx.create({
        kind: 'suggestion',
        suggestionShape: 'dur',
        anchorType: 'phase_duration',
        phaseRef: type,
        fromValue: String(minutes),
        toValue: String(val),
        note: t('annotations.author.durNoteDefault', { from: minutes, to: val }),
      });
    }
  };

  const commitEnum = async (p: TeachingPhase) => {
    setEditing(null);
    if (!ctx || !phase) return;
    if (pendingEnum) {
      if (p === pendingEnum.fromValue) await ctx.remove(pendingEnum.id);
      else if (p === pendingEnum.toValue) return;
      else await ctx.update(pendingEnum.id, p);
    } else {
      if (p === phase) return;
      await ctx.create({
        kind: 'suggestion',
        suggestionShape: 'enum',
        anchorType: 'phase_enum',
        phaseRef: type,
        fromValue: phase,
        toValue: p,
        note: t('annotations.author.enumNoteDefault', { from: PHASE_LABEL[phase], to: PHASE_LABEL[p] }),
      });
    }
  };

  // ── grouping cell ────────────────────────────────────────────────────────────
  const groupingCell = (() => {
    if (editing === 'enum' && phase) {
      return (
        <EnumInline
          seed={(pendingEnum?.toValue as TeachingPhase) ?? phase}
          onCommit={(p) => void commitEnum(p)}
          onCancel={() => setEditing(null)}
        />
      );
    }
    if (enumSug && enumSug.status === 'pending') {
      return (
        <Clickable onClick={canEdit ? () => setEditing('enum') : () => focus(enumSug.id)}>
          <FromToPill
            from={PHASE_LABEL[enumSug.fromValue as TeachingPhase] ?? enumSug.fromValue ?? ''}
            to={PHASE_LABEL[enumSug.toValue as TeachingPhase] ?? enumSug.toValue ?? ''}
          />
        </Clickable>
      );
    }
    if (enumSug && enumSug.status === 'accepted' && phase) {
      return (
        <Clickable onClick={canEdit ? () => setEditing('enum') : undefined}>
          <GreenTag label={PHASE_LABEL[phase]} />
        </Clickable>
      );
    }
    if (phase) {
      return (
        <Clickable onClick={canEdit ? () => setEditing('enum') : undefined}>
          <span className="rounded-badge bg-surface-subtle px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[0.03em] text-neutral-600">
            {PHASE_LABEL[phase]}
          </span>
        </Clickable>
      );
    }
    return null;
  })();

  // ── duration cell ────────────────────────────────────────────────────────────
  const minutesLabel = t('annotations.pill.minutes', { n: formatNumber(minutes, locale) });
  const durationCell = (() => {
    if (editing === 'dur') {
      return (
        <span className="ml-auto">
          <DurInline
            seed={pendingDur ? Number(pendingDur.toValue) : minutes}
            onCommit={(v) => void commitDur(v)}
            onCancel={() => setEditing(null)}
            locale={locale}
          />
        </span>
      );
    }
    if (durSug && durSug.status === 'pending') {
      return (
        <Clickable
          className="ml-auto"
          onClick={canEdit ? () => setEditing('dur') : () => focus(durSug.id)}
        >
          <FromToPill from={`${durSug.fromValue}`} to={`${durSug.toValue}`} />
        </Clickable>
      );
    }
    if (durSug && durSug.status === 'accepted') {
      return (
        <Clickable className="ml-auto" onClick={canEdit ? () => setEditing('dur') : undefined}>
          <span className="text-[12.5px] font-semibold" style={{ color: A.pillGreenFg }}>
            {minutesLabel}
          </span>
        </Clickable>
      );
    }
    return (
      <Clickable className="ml-auto" onClick={canEdit ? () => setEditing('dur') : undefined}>
        <span className="text-[12.5px] font-semibold text-text-faint">{minutesLabel}</span>
      </Clickable>
    );
  })();

  return (
    <>
      <div className="flex items-center gap-[8px]">
        {groupingCell}
        <span className="text-[14px] font-semibold text-ink">{title}</span>
        {ctx && phaseCards.length > 0 ? (
          <CountBadge count={phaseCards.length} onClick={() => focus(phaseCards[0]?.id)} locale={locale} />
        ) : null}
        {durationCell}
      </div>

      {/* The add-comment ＋ now lives in the right gutter (AnnotatedSection), so the
          block body stays clean — nothing rendered here. */}
    </>
  );
}

// ── shared bits ────────────────────────────────────────────────────────────────

/** A cell that is a button when it has an action, else a plain span (so a
 *  non-interactive tag doesn't render as a button). */
function Clickable({
  onClick,
  className,
  children,
}: {
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  if (!onClick) return <span className={className}>{children}</span>;
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

export function FromToPill({ from, to }: { from: string; to: string }) {
  return (
    <span
      className="inline-flex items-center gap-[5px] rounded-badge border px-[8px] py-[2px] text-[11px] font-bold"
      style={{ background: A.pillTealBg, borderColor: A.pillTealBorder, color: A.pillTealFg }}
    >
      <span className="line-through opacity-70">{from}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100" aria-hidden>
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </svg>
      <span>{to}</span>
    </span>
  );
}

function GreenTag({ label }: { label: string }) {
  return (
    <span
      className="rounded-badge px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[0.03em]"
      style={{ background: A.acceptedBg, color: A.pillGreenFg }}
    >
      {label}
    </span>
  );
}

export function CountBadge({
  count,
  onClick,
  locale,
}: {
  count: number;
  onClick: () => void;
  locale: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-[3px] rounded-full border px-[6px] py-[1px] text-[10.5px] font-bold transition-opacity hover:opacity-80"
      style={{ background: A.countBg, borderColor: A.countBorder, color: A.countFg }}
      aria-label="annotations"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {formatNumber(count, locale)}
    </button>
  );
}

export function CommentForm({
  anchorType,
  phaseRef,
  blockRef,
  onClose,
}: {
  anchorType: 'objective' | 'phase' | 'worksheet_block';
  phaseRef?: string;
  blockRef?: string;
  onClose: () => void;
}) {
  const ctx = useOptionalAnnotations();
  const t = useTranslations('review');
  const [note, setNote] = useState('');

  if (!ctx) return null;
  const submit = async () => {
    const body = note.trim();
    if (!body || ctx.pending) return;
    const ok = await ctx.create({
      kind: 'comment',
      anchorType,
      phaseRef: phaseRef ?? null,
      blockRef: blockRef ?? null,
      note: body,
    });
    if (ok) onClose();
  };

  return (
    <AuthoringShell>
      <AuthoringNote value={note} onChange={setNote} placeholder={t('annotations.author.commentPlaceholder')} autoFocus />
      <AuthoringActions onSubmit={() => void submit()} onCancel={onClose} submitLabel={t('annotations.author.comment')} disabled={!note.trim() || ctx.pending} />
    </AuthoringShell>
  );
}

/** Compact inline duration editor — the stepper sits in the duration cell itself
 *  (no box below), committing on ✓ / cancelling on ✕. */
function DurInline({
  seed,
  onCommit,
  onCancel,
  locale,
}: {
  seed: number;
  onCommit: (v: number) => void;
  onCancel: () => void;
  locale: string;
}) {
  const [value, setValue] = useState(seed);
  return (
    <span className="inline-flex items-center gap-[6px]">
      <Stepper value={value} onChange={setValue} min={1} max={60} locale={locale} />
      <IconButton onClick={() => onCommit(value)} />
      <CancelLink onClick={onCancel} />
    </span>
  );
}

/** Compact inline grouping editor — the three tags sit in the grouping cell itself;
 *  picking one commits immediately. */
function EnumInline({
  seed,
  onCommit,
  onCancel,
}: {
  seed: TeachingPhase;
  onCommit: (p: TeachingPhase) => void;
  onCancel: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-[5px]">
      {PHASE_ORDER.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onCommit(p)}
          className="rounded-[7px] border px-[8px] py-[3px] text-[11px] font-semibold transition-colors"
          style={
            seed === p
              ? { background: A.suggestionBg, color: A.suggestionFg, borderColor: A.pillTealBorder }
              : { background: 'transparent', color: A.tabIdleFg, borderColor: A.tabBorder }
          }
        >
          {PHASE_LABEL[p]}
        </button>
      ))}
      <CancelLink onClick={onCancel} />
    </span>
  );
}

function IconButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-white transition-opacity hover:opacity-90"
      style={{ background: A.teal }}
      aria-label="save"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </button>
  );
}

function CancelLink({ onClick }: { onClick: () => void }) {
  const t = useTranslations('review');
  return (
    <button type="button" onClick={onClick} className="text-[12px] font-medium" style={{ color: A.neutralFg }}>
      {t('annotations.author.cancel')}
    </button>
  );
}

function AuthoringShell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[10px] border bg-white p-[11px]" style={{ borderColor: A.pillTealBorder }}>
      <div className="flex flex-col gap-[9px]">{children}</div>
    </div>
  );
}

function AuthoringNote({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <textarea
      dir="auto"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      autoFocus={autoFocus}
      placeholder={placeholder}
      className="block w-full resize-none rounded-[9px] border bg-white px-[10px] py-[7px] text-[12.5px] leading-[1.5] text-ink outline-none focus:border-teal"
      style={{ borderColor: A.textareaBorder }}
    />
  );
}

function AuthoringActions({
  onSubmit,
  onCancel,
  submitLabel,
  disabled,
}: {
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  disabled: boolean;
}) {
  const t = useTranslations('review');
  return (
    <div className="flex items-center gap-[8px]">
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className="rounded-[8px] px-[12px] py-[6px] text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        style={{ background: A.teal }}
      >
        {submitLabel}
      </button>
      <button type="button" onClick={onCancel} className="text-[12px] font-medium" style={{ color: A.neutralFg }}>
        {t('annotations.author.cancel')}
      </button>
    </div>
  );
}

function Stepper({
  value,
  onChange,
  min,
  max,
  locale,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  locale: string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="inline-flex items-center gap-[8px] rounded-[9px] border px-[8px] py-[5px]" style={{ borderColor: A.tabBorder }}>
      <StepBtn label="−" onClick={() => onChange(clamp(value - 1))} />
      <span className="min-w-[42px] text-center text-[13px] font-bold text-ink">
        {formatNumber(value, locale)} <span className="text-[11px] font-medium" style={{ color: A.hint }}>min</span>
      </span>
      <StepBtn label="+" onClick={() => onChange(clamp(value + 1))} />
    </div>
  );
}

function StepBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[6px] text-[15px] font-bold leading-none transition-colors"
      style={{ background: A.countBg, color: A.countFg }}
    >
      {label}
    </button>
  );
}
