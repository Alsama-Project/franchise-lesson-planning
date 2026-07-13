'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import type { ClassOption, SubjectOption } from '@/lib/onboarding';
import { CheckIcon, subjectInitials } from '@/components/onboarding/pieces';

/** A `${subjectId}:${year}` key → the single class that fills that cell. */
const cellKey = (subjectId: string, year: number) => `${subjectId}:${year}`;

interface ClassAssignmentGridProps {
  /** Every non-archived class in the org (already centre-agnostic). */
  classes: ClassOption[];
  /** The global subject list, for column names + ordering. */
  subjects: SubjectOption[];
  /** The centre the grid is scoped to. */
  activeCentreId: string | null;
  /** The full set of class ids the teacher has ticked (across all centres). */
  ticked: Set<string>;
  /** Flip a single class's ticked state. */
  onToggle: (classId: string) => void;
}

/**
 * The subject × year-group assignment grid for one centre. Columns are the
 * subjects that actually have a class at the centre; rows are the union of year
 * groups present in any column. A cell is a real checkbox only where a class
 * exists for that (subject, year); everywhere else it's a muted em-dash.
 *
 * A class is `(school_id, subject_id, year)` and — since migration 0018 — unique
 * per active tuple, so each cell maps to at most one class. The whole point of
 * the grid is that a year group appears ONCE, with a checkbox in each subject it
 * runs under (the old "My classes" list showed "Year 1 · Arabic" and
 * "Year 1 · English" as two separate rows).
 *
 * Presentational: it reads/writes the caller's `ticked` set and owns no state.
 */
export function ClassAssignmentGrid({
  classes,
  subjects,
  activeCentreId,
  ticked,
  onToggle,
}: ClassAssignmentGridProps) {
  // Classes at this centre only.
  const centreClasses = useMemo(
    () => classes.filter((c) => c.schoolId === activeCentreId),
    [classes, activeCentreId],
  );

  // Columns: subjects that have ≥1 class at the centre, in the global subject
  // order (alphabetical, from getOnboardingData).
  const columns = useMemo(() => {
    const present = new Set(centreClasses.map((c) => c.subjectId));
    return subjects.filter((s) => present.has(s.id));
  }, [centreClasses, subjects]);

  // Rows: the union of year groups with a class in ANY column, Year 0 first.
  const years = useMemo(
    () => [...new Set(centreClasses.map((c) => c.year))].sort((a, b) => a - b),
    [centreClasses],
  );

  // (subject, year) → class, so a cell can resolve its class id in O(1).
  const cellClass = useMemo(() => {
    const map = new Map<string, ClassOption>();
    for (const c of centreClasses) map.set(cellKey(c.subjectId, c.year), c);
    return map;
  }, [centreClasses]);

  if (columns.length === 0 || years.length === 0) {
    return (
      <div className="rounded-[13px] border border-border p-[22px] text-center text-[13px] text-text-faint">
        No subjects or classes at this centre yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[13px] border border-border">
      {/* border-separate + a shared bg lets the sticky header/first-column sit
          opaque over scrolling cells without a seam. */}
      <table className="w-full border-separate border-spacing-0 bg-surface text-left">
        <caption className="sr-only">
          Tick the classes you teach at this centre. Rows are year groups; columns are subjects.
        </caption>
        <thead>
          <tr>
            {/* Corner: sticky in both axes. */}
            <th
              scope="col"
              className="sticky left-0 top-0 z-30 border-b border-border bg-surface-subtle px-[16px] py-[12px] text-[11px] font-bold uppercase tracking-[0.05em] text-text-faint"
            >
              Year
            </th>
            {columns.map((s) => (
              <th
                key={s.id}
                scope="col"
                className="sticky top-0 z-20 border-b border-l border-[#F0EAE1] bg-surface-subtle px-[14px] py-[10px]"
              >
                <span className="flex items-center gap-[8px]">
                  <span
                    className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-[8px] bg-teal-tint text-[11px] font-bold text-teal-deep"
                    aria-hidden
                  >
                    {subjectInitials(s.name)}
                  </span>
                  <span className="whitespace-nowrap text-[13px] font-semibold text-ink">
                    {s.name}
                  </span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((year, i) => (
            <tr key={year}>
              <th
                scope="row"
                className={cn(
                  'sticky left-0 z-10 whitespace-nowrap bg-surface px-[16px] py-[11px] text-[13.5px] font-semibold text-ink',
                  i > 0 && 'border-t border-[#F0EAE1]',
                )}
              >
                Year {year}
              </th>
              {columns.map((s) => {
                const cls = cellClass.get(cellKey(s.id, year));
                const borders = cn('border-l border-[#F0EAE1]', i > 0 && 'border-t');
                if (!cls) {
                  return (
                    <td
                      key={s.id}
                      className={cn(
                        'px-[14px] py-[11px] text-center text-[15px] text-neutral-300',
                        borders,
                      )}
                      aria-label={`No Year ${year} class in ${s.name}`}
                    >
                      —
                    </td>
                  );
                }
                const isTicked = ticked.has(cls.id);
                return (
                  <td key={s.id} className={cn('px-[14px] py-[9px]', borders)}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isTicked}
                      aria-label={`Year ${year}, ${s.name}`}
                      onClick={() => onToggle(cls.id)}
                      className="mx-auto flex size-[30px] items-center justify-center rounded-[7px] transition-colors hover:bg-surface-subtle"
                    >
                      {isTicked ? (
                        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-teal">
                          <CheckIcon size={11} />
                        </span>
                      ) : (
                        <span className="size-5 shrink-0 rounded-[6px] border-[1.5px] border-[#D8CFC2] bg-surface" />
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
