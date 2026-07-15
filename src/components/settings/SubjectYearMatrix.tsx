'use client';

import { cn } from '@/lib/cn';
import { YEARS, cellKey } from '@/lib/matrix';

export interface MatrixSubject {
  id: string;
  name: string;
}

interface SubjectYearMatrixProps {
  /** Column axis — the canonical subject list. ALL render, in the given order. */
  subjects: MatrixSubject[];
  /** Row axis — the canonical year groups. Defaults to the shared `YEARS`. */
  years?: readonly number[];
  /** Ticked cell keys (`${subjectId}:${year}`, via {@link cellKey}). */
  checked: Set<string>;
  /** Flip one cell. Never fired for unavailable or readonly cells. */
  onToggle: (subjectId: string, year: number) => void;
  /**
   * Cell keys that may be ticked. Omit → every cell is available (the admin
   * Classes tab, where a tick can create a class). On Profile only the
   * (subject, year) pairs that have a real class are available; the rest render
   * as a non-interactive em-dash, because a teacher can't create classes.
   */
  availableCells?: Set<string>;
  /** Render every checkbox static (no toggles). */
  readonly?: boolean;
}

/**
 * The subject × year checkbox matrix, shared verbatim by BOTH settings surfaces
 * — the sole source of truth for the grid's layout. It is purely presentational:
 * it reads/writes the caller's `checked` set (keyed by `${subjectId}:${year}`)
 * and owns no state. Each consumer maps a toggled cell to its own action.
 *
 * `table-layout: fixed` + `width: 100%` is the fit fix: the table can never
 * exceed its container, so all 8 subjects sit inside the card with no horizontal
 * scroll; long subject names wrap inside their fixed-share column. The year
 * column is a fixed ~70px; the subject columns share the remainder evenly.
 */
export function SubjectYearMatrix({
  subjects,
  years = YEARS,
  checked,
  onToggle,
  availableCells,
  readonly,
}: SubjectYearMatrixProps) {
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <caption className="sr-only">
        Rows are year groups; columns are subjects. Tick a cell to select that class.
      </caption>
      <colgroup>
        <col className="w-[70px]" />
        {subjects.map((s) => (
          <col key={s.id} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th
            scope="col"
            className="border-b border-r border-border px-[6px] pb-[10px] pt-[6px] align-bottom text-[11px] font-semibold uppercase tracking-[0.05em] text-text-faint"
          >
            Year
          </th>
          {subjects.map((s) => (
            <th
              key={s.id}
              scope="col"
              dir="auto"
              className="border-b border-border px-[4px] pb-[10px] pt-[6px] text-center align-bottom text-[12.5px] font-semibold leading-[1.2] text-ink [overflow-wrap:anywhere]"
            >
              {s.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {years.map((year, i) => {
          const last = i === years.length - 1;
          return (
            <tr key={year}>
              <th
                scope="row"
                className={cn(
                  'border-r border-border px-[6px] py-[9px] text-left text-[13px] font-semibold text-ink',
                  !last && 'border-b',
                )}
              >
                Year {year}
              </th>
              {subjects.map((s) => {
                const key = cellKey(s.id, year);
                const available = !availableCells || availableCells.has(key);
                return (
                  <td
                    key={s.id}
                    className={cn('px-[4px] py-[9px] text-center', !last && 'border-b border-border')}
                  >
                    {available ? (
                      <MatrixCheckbox
                        checked={checked.has(key)}
                        disabled={readonly}
                        label={`${s.name}, Year ${year}`}
                        onToggle={() => onToggle(s.id, year)}
                      />
                    ) : (
                      <span
                        className="text-[15px] text-neutral-300"
                        aria-label={`No Year ${year} class in ${s.name}`}
                      >
                        —
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The 22px tick control — teal filled + white check when on, neutral outline off. */
function MatrixCheckbox({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={disabled ? undefined : onToggle}
      className={cn(
        'inline-flex size-[22px] items-center justify-center rounded-[6px] border-[1.5px] text-white transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal',
        checked
          ? 'border-teal bg-teal'
          : 'border-border-strong bg-surface hover:border-teal',
        disabled ? 'cursor-default opacity-60' : 'cursor-pointer',
      )}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className={checked ? 'opacity-100' : 'opacity-0'}
      >
        <path
          d="M5 12.5l4.5 4.5L19 7.5"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
