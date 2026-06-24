'use client';

import { OBJECTIVE_STEM } from '@/lib/editor/objective';
import {
  SMARTT_LETTERS,
  type ObjectiveCheckResult,
} from '@/lib/editor/objective-check';
import { Spinner } from '@/components/ui/Spinner';

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
  result,
}: {
  label: string;
  result: ObjectiveCheckResult[keyof ObjectiveCheckResult] | undefined;
}) {
  // No check yet → neutral guidance pill.
  if (!result || typeof result === 'string' || Array.isArray(result)) {
    return (
      <span className="rounded-full border border-border bg-surface px-[11px] py-1 text-[11px] font-semibold text-neutral-600">
        {label}
      </span>
    );
  }
  const strong = result.status === 'strong';
  return (
    <span
      title={result.note}
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

/**
 * Step 1 — the full objective editor: the six SMARTT pills (driven by the AI
 * check), the fixed-stem textarea, and the "Check my objective" affordance that
 * reveals a quiet feedback note (suggestions + an improved rewrite).
 */
export function ObjectiveStep({
  remainder,
  onChange,
  checkResult,
  checking,
  checkError,
  onCheck,
}: {
  remainder: string;
  onChange: (next: string) => void;
  checkResult: ObjectiveCheckResult | null;
  checking: boolean;
  checkError: string | null;
  onCheck: () => void;
}) {
  const checkDisabled = checking || remainder.trim().length === 0;

  return (
    <div className="mt-1.5">
      <div className="text-[22px] font-semibold">Write the lesson objective</div>

      <div className="mt-[18px] flex flex-wrap gap-1.5">
        {SMARTT_LETTERS.map((l) => (
          <SmarttPill key={l.key} label={l.label} result={checkResult?.[l.key]} />
        ))}
      </div>

      {/* "Yours" — a pink block holding a white field. The stem is baked in and
          non-editable; the teacher writes only the remainder. */}
      <div className="mt-4 rounded-[14px] border border-mine-border bg-mine p-[15px]">
        <div className="relative rounded-[11px] border border-mine-field bg-surface px-[15px] py-[14px]">
          <button
            type="button"
            onClick={onCheck}
            disabled={checkDisabled}
            aria-label="Ask Aya about your objective"
            title="Ask Aya for help with your objective"
            className="absolute right-[11px] top-[11px] inline-flex size-[30px] items-center justify-center rounded-full bg-teal text-white shadow-[0_1px_3px_rgba(31,122,108,0.35)] hover:bg-[#1a6a5d] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SparkIcon size={15} />
          </button>
          <div className="pr-[34px] text-[16px] leading-[1.55]">
            <span className="text-stem">{OBJECTIVE_STEM} </span>
            <textarea
              rows={2}
              value={remainder}
              onChange={(e) => onChange(e.target.value)}
              aria-label="SMARTT objective"
              placeholder="read five short sentences about a family and identify the family words."
              className="mt-[6px] block w-full resize-y border-0 bg-transparent p-0 font-sans text-[16px] leading-[1.5] text-neutral-900 outline-none placeholder:text-neutral-400"
            />
          </div>
        </div>
        <div className="mt-[13px] flex justify-end">
          <button
            type="button"
            onClick={onCheck}
            disabled={checkDisabled}
            aria-busy={checking || undefined}
            className="inline-flex shrink-0 items-center gap-[7px] rounded-[9px] bg-teal px-[15px] py-[9px] text-[13px] font-semibold text-white hover:bg-[#1a6a5d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checking ? <Spinner size={14} /> : <SparkIcon size={14} />}
            {checking ? 'Checking…' : 'Check my objective'}
          </button>
        </div>
      </div>

      {checkError ? (
        <div className="mt-3 rounded-[12px] border border-status-review-border bg-status-review-bg px-4 py-3 text-[13px] text-pink">
          {checkError}
        </div>
      ) : null}

      {checkResult ? (
        <div className="mt-3 rounded-[12px] border border-dashed border-[#CFE6E0] bg-surface px-4 py-[15px]">
          <div className="mb-[9px] flex items-center gap-[7px] text-[11px] font-bold uppercase tracking-[0.06em] text-[#186155]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#1F7A6C">
              <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" />
            </svg>
            Quiet check — feedback, not a chat
          </div>
          {checkResult.suggestions.length > 0 ? (
            <ul className="ml-[18px] list-disc text-[13px] leading-[1.55] text-neutral-900">
              {checkResult.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-[11px] rounded-[10px] border border-border bg-surface-subtle px-3 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-600">
              Suggested rewrite
            </div>
            <div className="mt-1 text-[13.5px] leading-[1.5] text-neutral-900">
              {checkResult.improved_objective}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
