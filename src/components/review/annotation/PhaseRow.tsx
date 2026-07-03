'use client';

// The header row of a content block on the review view, woven into ReadOnlyPlan.
// Without an annotation provider (a non-member's plain read-only view) it renders
// EXACTLY the original markup — grouping badge · title · "{n} min". With a provider
// it adds: a count badge (clicks focus the phase's first card), a teal from→to pill
// in the duration / grouping cell for a live suggestion (green once accepted), and —
// for a coordinator — inline authoring (suggest a time, suggest a grouping, comment).

import { useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/format';
import type { TeachingPhase } from '@/types/lesson';
import { useOptionalAnnotations } from './context';
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
  const [authoring, setAuthoring] = useState<null | 'dur' | 'enum' | 'comment'>(null);

  const durSug = ctx?.suggestionFor(type, 'dur');
  const enumSug = ctx?.suggestionFor(type, 'enum');
  const phaseCards = ctx?.forPhase(type) ?? [];
  const isCoordinator = ctx?.role === 'coordinator';

  const focus = (id?: string) => {
    if (id && ctx) ctx.setActiveId(id);
  };

  // ── grouping cell ────────────────────────────────────────────────────────────
  const groupingCell = (() => {
    if (enumSug && enumSug.status === 'pending') {
      return (
        <button type="button" onClick={() => focus(enumSug.id)}>
          <FromToPill
            from={PHASE_LABEL[enumSug.fromValue as TeachingPhase] ?? enumSug.fromValue ?? ''}
            to={PHASE_LABEL[enumSug.toValue as TeachingPhase] ?? enumSug.toValue ?? ''}
          />
        </button>
      );
    }
    if (enumSug && enumSug.status === 'accepted' && phase) {
      return <GreenTag label={PHASE_LABEL[phase]} />;
    }
    if (phase) {
      return (
        <span className="rounded-badge bg-surface-subtle px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[0.03em] text-neutral-600">
          {PHASE_LABEL[phase]}
        </span>
      );
    }
    return null;
  })();

  // ── duration cell ────────────────────────────────────────────────────────────
  const durationCell = (() => {
    if (durSug && durSug.status === 'pending') {
      return (
        <button type="button" onClick={() => focus(durSug.id)} className="ml-auto">
          <FromToPill from={`${durSug.fromValue}`} to={`${durSug.toValue}`} />
        </button>
      );
    }
    if (durSug && durSug.status === 'accepted') {
      return (
        <span className="ml-auto text-[12.5px] font-semibold" style={{ color: A.pillGreenFg }}>
          {t('annotations.pill.minutes', { n: formatNumber(minutes, locale) })}
        </span>
      );
    }
    return (
      <span className="ml-auto text-[12.5px] font-semibold text-text-faint">
        {t('annotations.pill.minutes', { n: formatNumber(minutes, locale) })}
      </span>
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

      {/* Coordinator authoring toolbar + inline forms. */}
      {isCoordinator ? (
        <div className="mt-[8px] flex flex-wrap items-center gap-[7px]">
          <AuthorButton
            label={t('annotations.author.time')}
            active={authoring === 'dur'}
            onClick={() => setAuthoring(authoring === 'dur' ? null : 'dur')}
          />
          {phase ? (
            <AuthorButton
              label={t('annotations.author.grouping')}
              active={authoring === 'enum'}
              onClick={() => setAuthoring(authoring === 'enum' ? null : 'enum')}
            />
          ) : null}
          <AuthorButton
            label={t('annotations.author.comment')}
            active={authoring === 'comment'}
            onClick={() => setAuthoring(authoring === 'comment' ? null : 'comment')}
          />
        </div>
      ) : null}

      {isCoordinator && authoring === 'dur' ? (
        <DurationForm
          type={type}
          current={minutes}
          onClose={() => setAuthoring(null)}
        />
      ) : null}
      {isCoordinator && authoring === 'enum' && phase ? (
        <GroupingForm type={type} current={phase} onClose={() => setAuthoring(null)} />
      ) : null}
      {isCoordinator && authoring === 'comment' ? (
        <CommentForm anchorType="phase" phaseRef={type} onClose={() => setAuthoring(null)} />
      ) : null}
    </>
  );
}

// ── shared bits ────────────────────────────────────────────────────────────────

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

function AuthorButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[8px] border px-[9px] py-[4px] text-[11.5px] font-semibold transition-colors"
      style={
        active
          ? { background: A.suggestionBg, color: A.suggestionFg, borderColor: A.pillTealBorder }
          : { background: 'transparent', color: A.tabIdleFg, borderColor: A.tabBorder }
      }
    >
      {label}
    </button>
  );
}

function DurationForm({
  type,
  current,
  onClose,
}: {
  type: string;
  current: number;
  onClose: () => void;
}) {
  const ctx = useOptionalAnnotations();
  const t = useTranslations('review');
  const locale = useLocale();
  const [value, setValue] = useState(current);
  const [note, setNote] = useState('');

  if (!ctx) return null;
  const submit = async () => {
    if (ctx.pending || value === current) return;
    const ok = await ctx.create({
      kind: 'suggestion',
      anchorType: 'phase_duration',
      phaseRef: type,
      suggestionShape: 'dur',
      fromValue: `${current}`,
      toValue: `${value}`,
      note: note.trim() || t('annotations.author.durNoteDefault', { from: current, to: value }),
    });
    if (ok) onClose();
  };

  return (
    <AuthoringShell>
      <div className="flex items-center gap-[9px]">
        <Stepper value={value} onChange={setValue} min={1} max={60} locale={locale} />
        <span className="text-[12px]" style={{ color: A.hint }}>
          {t('annotations.author.durFrom', { n: formatNumber(current, locale) })}
        </span>
      </div>
      <AuthoringNote value={note} onChange={setNote} placeholder={t('annotations.author.notePlaceholder')} />
      <AuthoringActions onSubmit={() => void submit()} onCancel={onClose} submitLabel={t('annotations.author.suggest')} disabled={ctx.pending || value === current} />
    </AuthoringShell>
  );
}

function GroupingForm({
  type,
  current,
  onClose,
}: {
  type: string;
  current: TeachingPhase;
  onClose: () => void;
}) {
  const ctx = useOptionalAnnotations();
  const t = useTranslations('review');
  const [value, setValue] = useState<TeachingPhase>(current);
  const [note, setNote] = useState('');

  if (!ctx) return null;
  const submit = async () => {
    if (ctx.pending || value === current) return;
    const ok = await ctx.create({
      kind: 'suggestion',
      anchorType: 'phase_enum',
      phaseRef: type,
      suggestionShape: 'enum',
      fromValue: current,
      toValue: value,
      note: note.trim() || t('annotations.author.enumNoteDefault', { from: PHASE_LABEL[current], to: PHASE_LABEL[value] }),
    });
    if (ok) onClose();
  };

  return (
    <AuthoringShell>
      <div className="flex flex-wrap gap-[6px]">
        {PHASE_ORDER.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setValue(p)}
            className="rounded-[8px] border px-[10px] py-[5px] text-[12px] font-semibold transition-colors"
            style={
              value === p
                ? { background: A.suggestionBg, color: A.suggestionFg, borderColor: A.pillTealBorder }
                : { background: 'transparent', color: A.tabIdleFg, borderColor: A.tabBorder }
            }
          >
            {PHASE_LABEL[p]}
          </button>
        ))}
      </div>
      <AuthoringNote value={note} onChange={setNote} placeholder={t('annotations.author.notePlaceholder')} />
      <AuthoringActions onSubmit={() => void submit()} onCancel={onClose} submitLabel={t('annotations.author.suggest')} disabled={ctx.pending || value === current} />
    </AuthoringShell>
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

function AuthoringShell({ children }: { children: ReactNode }) {
  return (
    <div className="mt-[8px] rounded-[10px] border bg-white p-[11px]" style={{ borderColor: A.pillTealBorder }}>
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
