'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  SMARTT_LETTERS,
  smarttDimensionLabel,
  type ObjectiveCheckResult,
  type SmarttDimensionKey,
  type SmarttLetterAssessment,
} from '@/lib/editor/objective-check';

/** Per-letter assessments resolved so far during a streamed check. */
export type PartialSmarttResult = Partial<Record<SmarttDimensionKey, SmarttLetterAssessment>>;

/** The four-point Aya sparkle, reused for the hint button and the check button. */
function SparkIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" />
    </svg>
  );
}

function SmarttPill({
  label,
  assessment,
  checking,
}: {
  label: string;
  /** The resolved assessment for this letter — streamed mid-check or from the
   *  final result. When absent while `checking`, the pill pulses teal. */
  assessment: SmarttLetterAssessment | undefined;
  checking: boolean;
}) {
  // A resolved assessment always wins: during a streamed check a letter flips from
  // the teal "evaluating" pulse to its real met/unmet treatment the moment its
  // object closes; on completion the validated result fills every pill.
  if (assessment) {
    const strong = assessment.status === 'strong';
    return (
      <span
        title={assessment.note}
        className={
          'cursor-help rounded-full border px-[11px] py-1 text-[11px] font-semibold ' +
          (strong
            ? 'border-[#C9E4D5] bg-[#E2F0E8] text-[#2E7D5B]'
            : 'border-[#E8D6B8] bg-[#F6ECDA] text-[#B0651E]')
        }
      >
        {strong ? '✓' : '~'} {label}
      </span>
    );
  }
  // Still evaluating this letter → teal pulse. Honest: no fabricated progress, the
  // pill resolves only when its own letter lands (or the final result arrives).
  if (checking) {
    return (
      <span
        aria-busy
        className="animate-pulse rounded-full border border-teal-tint-border bg-teal-tint px-[11px] py-1 text-[11px] font-semibold text-teal"
      >
        {label}
      </span>
    );
  }
  // No check yet → neutral guidance pill.
  return (
    <span className="rounded-full border border-border bg-surface px-[11px] py-1 text-[11px] font-semibold text-neutral-600">
      {label}
    </span>
  );
}

/**
 * Step 1 — the full objective editor: the six SMARTT pills (driven by the AI
 * check), the fixed-stem textarea, and the "Check my objective" affordance that
 * reveals a quiet feedback note (suggestions + an improved rewrite).
 */
export function ObjectiveStep({
  remainder,
  onChange,
  checkResult,
  checkApplies = true,
  checking,
  partial,
  checkError,
  onCheck,
  locked = false,
}: {
  remainder: string;
  onChange: (next: string) => void;
  checkResult: ObjectiveCheckResult | null;
  /** Whether `checkResult` still describes the CURRENT objective text. When false
   *  (the teacher edited the objective since the last check, or a stored result no
   *  longer matches), the six SMARTT pills fall back to their idle state — the
   *  result no longer applies, so it must not read as a live pass/fail verdict. The
   *  feedback disclosure still shows the last check's notes as advisory context. */
  checkApplies?: boolean;
  checking: boolean;
  /** Letters resolved so far during a streamed check; drives the progressive
   *  pill reveal while `checking`. Ignored once the final result lands. */
  partial?: PartialSmarttResult;
  checkError: string | null;
  onCheck: () => void;
  /** When true the plan is submitted/approved: the objective is read-only and the
   *  AI check is disabled. The contentEditable region is not a form control, so it
   *  is gated here directly rather than via the disabled fieldset. */
  locked?: boolean;
}) {
  const t = useTranslations('wizard.objective');
  const checkDisabled = checking || locked || remainder.trim().length === 0;

  // Feedback bullets, minus any whose SMARTT letter already ticks strong. A pill
  // shows ✓ exactly when `checkResult[letter].status === 'strong'` (see SmarttPill),
  // so a suggestion tagged with that same letter would contradict its own tick —
  // drop it. This is the exact negation of the pill's tick predicate. A suggestion
  // with an unmapped/undefined dimension has no `strong` letter to match, so
  // `checkResult[undefined]?.status !== 'strong'` is true and it is KEPT.
  const visibleSuggestions =
    checkResult?.suggestions.filter((s) => checkResult[s.dimension]?.status !== 'strong') ?? [];

  // The remainder is an inline, flowing editable region (so the teacher's text
  // continues on the same line as the fixed stem and wraps as one paragraph). It is
  // UNCONTROLLED after an initial seed: the DOM node owns the text and reports it up
  // via `onInput`, mirroring the worksheet editor's seed-once model. React never
  // rewrites the node on re-render, so the caret is immune to background re-syncs.
  const editableRef = useRef<HTMLSpanElement>(null);
  const [focused, setFocused] = useState(false);

  // The check feedback is a "+ FEEDBACK" disclosure. It defaults closed (before any
  // check has run), then auto-expands whenever a check returns results so the
  // teacher sees the outcome without an extra click.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // Auto-expand when a fresh result arrives — derived from the `checkResult` prop
  // during render (React's "adjust state on a prop change" pattern) rather than an
  // effect, so the disclosure opens in the same commit the result lands, with no
  // extra render pass and no setState-in-effect.
  const [seenCheckResult, setSeenCheckResult] = useState(checkResult);
  if (checkResult !== seenCheckResult) {
    setSeenCheckResult(checkResult);
    if (checkResult) setFeedbackOpen(true);
  }

  // Seed the editable node's text ONCE on mount from the initial `remainder`. After
  // that, the DOM is the source of truth and only the teacher's `onInput` changes it.
  // We deliberately do NOT re-run on `[remainder]`: writing into a contentEditable
  // resets the caret to position 0, so re-seeding on any background re-render was
  // exactly the idle-caret-jump / lost-text bug. Re-initialisation happens only by
  // remounting — a different plan remounts the whole editor (`key={plan.id}`), and
  // returning to this step remounts ObjectiveStep — so this seed always runs against
  // the correct current value.
  useEffect(() => {
    const el = editableRef.current;
    if (el && el.textContent !== remainder) el.textContent = remainder;
    // Seed-once by design — re-running on `[remainder]` is the caret-reset bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus the editable region and drop the caret at the END of any existing text.
  // Used when the teacher clicks the fixed stem or the padding around the field —
  // a click anywhere on the objective line lands the caret in the editable part.
  function focusEditableAtEnd() {
    const el = editableRef.current;
    if (!el) return;
    el.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // The placeholder is shown only when the field is BOTH empty AND not focused, so
  // it clears the moment the field receives focus and returns on blur-while-empty.
  const showPlaceholder = remainder.trim() === '' && !focused;

  return (
    <div className="mt-1.5">
      <div className="text-[18px] font-bold">{t('heading')}</div>

      <div className="mt-[14px] flex flex-wrap gap-1.5">
        {SMARTT_LETTERS.map((l) => (
          <SmarttPill
            key={l.key}
            label={l.label}
            // While checking, resolve from the streamed `partial` letters (each
            // pops as it lands). Otherwise show the final result — but only while it
            // still applies to the current objective (`checkApplies`); a stale result
            // falls back to the idle pill. The pills are the sole progress indicator.
            assessment={
              checking ? partial?.[l.key] : checkApplies ? checkResult?.[l.key] : undefined
            }
            checking={checking}
          />
        ))}
      </div>

      {/* "Yours" — a pink block holding a white field. The stem is baked in and
          non-editable; the teacher writes only the remainder. */}
      <div className="mt-3 rounded-[14px] border border-mine-border bg-mine p-[13px]">
        {/* A click anywhere on this field (the stem, the padding) drops the caret
            into the editable region — except clicks already inside the editable
            (which position the caret naturally) and clicks on the Aya button. When
            focused, the pink field gets a stronger pink border + ring so "I've
            clicked in" is unmistakable. */}
        <div
          onMouseDown={(e) => {
            if (locked) return;
            const el = editableRef.current;
            const target = e.target as HTMLElement;
            if (el && (target === el || el.contains(target))) return;
            if (target.closest('button')) return;
            e.preventDefault();
            focusEditableAtEnd();
          }}
          className={
            'relative rounded-[11px] border bg-surface px-[15px] py-[14px] transition-colors ' +
            (locked
              ? 'cursor-default border-mine-field'
              : 'cursor-text ' +
                (focused ? 'border-pink ring-2 ring-pink/30' : 'border-mine-field'))
          }
        >
          {/* Stem + remainder render as ONE wrapping paragraph: the teacher's
              text continues inline after the fixed stem rather than dropping to a
              second line. The remainder is a flowing contentEditable span (a
              replaced <textarea> cannot wrap inline with preceding text). The stem
              stays muted (text-stem) so it reads as a fixed label; the teacher's
              text renders in body ink (text-ink), clearly distinct from the stem. */}
          <p className="text-[16px] leading-[1.55]">
            {/* One word-space between the fixed stem and the editable, via a LOGICAL
                margin so it falls on the inner side in both LTR and RTL. Not a literal
                space/&nbsp; inside the editable — onInput reads the editable's
                textContent as the saved remainder, so whitespace there would leak a
                leading space into stored data. */}
            <span className="text-stem me-[4px]">{t('stem')}</span>
            <span
              ref={editableRef}
              role="textbox"
              dir="auto"
              aria-multiline="true"
              aria-label={t('fieldAria')}
              suppressContentEditableWarning
              data-placeholder={t('placeholder')}
              data-empty={showPlaceholder ? 'true' : 'false'}
              contentEditable={!locked}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onInput={(e) => onChange(e.currentTarget.textContent ?? '')}
              className="whitespace-pre-wrap break-words font-sans text-[16px] text-ink caret-ink outline-none data-[empty=true]:before:pointer-events-none data-[empty=true]:before:text-neutral-400 data-[empty=true]:before:content-[attr(data-placeholder)]"
            />
          </p>
        </div>
        <div className="mt-[13px] flex justify-end">
          <button
            type="button"
            onClick={onCheck}
            disabled={checkDisabled}
            aria-busy={checking || undefined}
            className="inline-flex shrink-0 items-center gap-[7px] rounded-[9px] bg-teal px-[15px] py-[9px] text-[13px] font-semibold text-white hover:bg-[#1a6a5d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SparkIcon size={14} />
            {checking ? t('checking') : t('check')}
          </button>
        </div>

        {/* Feedback lives INSIDE the pink (teacher-editable) box, beneath "Check
            my objective": a "+ Feedback" disclosure that surfaces once a check has
            returned a result and auto-expands to show it. Each bullet opens with the
            SMARTT dimension it addresses in bold. */}
        {checkResult ? (
          <div className="mt-[14px]">
            <button
              type="button"
              onClick={() => setFeedbackOpen((open) => !open)}
              aria-expanded={feedbackOpen}
              className="inline-flex items-center gap-[7px] text-[11px] font-bold uppercase tracking-[0.06em] text-[#186155]"
            >
              <span
                aria-hidden
                className="inline-flex size-[16px] items-center justify-center rounded-full border border-[#CFE6E0] text-[13px] leading-none"
              >
                {feedbackOpen ? '−' : '+'}
              </span>
              {t('feedback')}
            </button>

            {feedbackOpen ? (
              <div dir="auto" className="mt-3 rounded-[12px] border border-dashed border-[#CFE6E0] bg-surface px-4 py-[15px]">
                {visibleSuggestions.length > 0 ? (
                  <ul dir="auto" className="flex flex-col gap-[7px] text-[13px] leading-[1.55] text-neutral-900">
                    {visibleSuggestions.map((s, i) => (
                      <li key={i}>
                        <span className="font-bold text-ink">{smarttDimensionLabel(s.dimension)}</span>
                        {' — '}
                        {s.note}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p dir="auto" className="text-[13px] leading-[1.55] text-[#2E7D5B]">
                    {t('allStrong')}
                  </p>
                )}
                <div className="mt-[11px] rounded-[10px] border border-border bg-surface-subtle px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-600">
                    {t('suggestedRewrite')}
                  </div>
                  <div dir="auto" className="mt-1 text-[13.5px] leading-[1.5] text-neutral-900">
                    {checkResult.improved_objective}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {checkError ? (
        <div className="mt-3 rounded-[12px] border border-status-review-border bg-status-review-bg px-4 py-3 text-[13px] text-pink">
          {checkError}
        </div>
      ) : null}
    </div>
  );
}
