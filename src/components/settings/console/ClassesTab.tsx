'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ConsoleClassesData, ConsoleClassRow } from '@/lib/console';
import { saveClassMatrix, type ClassMatrixDiff } from '@/lib/actions/console';
import { YEARS, cellKey } from '@/lib/matrix';
import { SubjectYearMatrix } from '@/components/settings/SubjectYearMatrix';
import { ErrorText, GhostButton, Modal, PrimaryButton, SectionCard } from './ui';

/** A `${schoolId}|${subjectId}|${year}` slot — one matrix cell across all centres. */
const slotKey = (schoolId: string, subjectId: string, year: number) =>
  `${schoolId}|${subjectId}|${year}`;

/** One untick that would archive a class still carrying plans or teachers. */
interface Affected {
  centreName: string;
  subjectName: string;
  year: number;
  planCount: number;
  teacherCount: number;
}

/**
 * The admin Classes tab: one subject × year checkbox matrix per centre. A tick
 * means "a class exists for (centre, subject, year)"; the whole surface is a
 * batched diff of ticks, saved in one pass (mirroring Profile's set_my_classes).
 * Ticking an empty cell creates a class (or restores an archived one); clearing a
 * tick archives it. Archiving a class that still has plans or teachers attached is
 * confirm-gated.
 */
export function ClassesTab({ data }: { data: ConsoleClassesData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ diff: ClassMatrixDiff; affected: Affected[] } | null>(
    null,
  );

  const centreName = (id: string) => data.centres.find((c) => c.id === id)?.name ?? '';
  const subjectName = (id: string) => data.subjects.find((s) => s.id === id)?.name ?? '';

  // Active/archived class lookups + per-class usage, all keyed by slot.
  const { activeBySlot, archivedBySlot, baseline } = useMemo(() => {
    const active = new Map<string, ConsoleClassRow>();
    const archived = new Map<string, ConsoleClassRow>();
    for (const c of data.classes) {
      const k = slotKey(c.schoolId, c.subjectId, c.year);
      if (c.archivedAt) {
        if (!archived.has(k)) archived.set(k, c);
      } else {
        active.set(k, c);
      }
    }
    return { activeBySlot: active, archivedBySlot: archived, baseline: new Set(active.keys()) };
  }, [data.classes]);

  // Ticked slots — seeded from the active baseline, edited locally until Save.
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(baseline));

  function toggleCentreCell(schoolId: string, subjectId: string, year: number) {
    const k = slotKey(schoolId, subjectId, year);
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  // Dirty when ticked diverges from baseline.
  const dirty =
    ticked.size !== baseline.size || [...ticked].some((k) => !baseline.has(k));

  // Per-centre checked cell sets for each matrix.
  const checkedByCentre = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const centre of data.centres) map.set(centre.id, new Set());
    for (const k of ticked) {
      const [schoolId, subjectId, year] = k.split('|');
      map.get(schoolId)?.add(cellKey(subjectId, Number(year)));
    }
    return map;
  }, [ticked, data.centres]);

  const totalSelected = ticked.size;

  // Resolve the ticked/baseline delta into create / restore / archive ops, and
  // flag any archive that would touch a class with plans or teachers.
  function buildDiff(): { diff: ClassMatrixDiff; affected: Affected[] } {
    const create: ClassMatrixDiff['create'] = [];
    const restore: string[] = [];
    const archive: string[] = [];
    const affected: Affected[] = [];

    for (const k of ticked) {
      if (baseline.has(k)) continue; // unchanged tick.
      const archivedClass = archivedBySlot.get(k);
      if (archivedClass) {
        restore.push(archivedClass.id);
      } else {
        const [schoolId, subjectId, year] = k.split('|');
        create.push({ schoolId, subjectId, year: Number(year) });
      }
    }

    for (const k of baseline) {
      if (ticked.has(k)) continue; // still ticked.
      const activeClass = activeBySlot.get(k);
      if (!activeClass) continue;
      archive.push(activeClass.id);
      if (activeClass.activePlanCount > 0 || activeClass.teacherCount > 0) {
        affected.push({
          centreName: centreName(activeClass.schoolId),
          subjectName: subjectName(activeClass.subjectId),
          year: activeClass.year,
          planCount: activeClass.activePlanCount,
          teacherCount: activeClass.teacherCount,
        });
      }
    }

    return { diff: { create, restore, archive }, affected };
  }

  function runSave(diff: ClassMatrixDiff) {
    setError(null);
    startTransition(async () => {
      const res = await saveClassMatrix(diff);
      if (!res.ok) {
        setError(res.error ?? 'Something went wrong.');
        return;
      }
      setConfirm(null);
      router.refresh();
    });
  }

  function onSave() {
    const { diff, affected } = buildDiff();
    if (affected.length > 0) {
      setConfirm({ diff, affected });
      return;
    }
    runSave(diff);
  }

  function onCancel() {
    setTicked(new Set(baseline));
    setError(null);
    setConfirm(null);
  }

  return (
    <>
      <SectionCard title="Classes">
        <div className="space-y-[26px] px-[18px] py-[20px]">
          {data.centres.map((centre) => {
            const checked = checkedByCentre.get(centre.id) ?? new Set<string>();
            const n = checked.size;
            return (
              <section key={centre.id}>
                <div className="mb-[10px] flex items-baseline gap-[12px]">
                  <h3 className="text-[16px] font-semibold text-[#2A2422]" dir="auto">
                    {centre.name}
                  </h3>
                  <span className="text-[13px] text-[#8A827A]">
                    {n} {n === 1 ? 'class' : 'classes'}
                  </span>
                </div>
                <SubjectYearMatrix
                  subjects={data.subjects}
                  years={YEARS}
                  checked={checked}
                  onToggle={(subjectId, year) => toggleCentreCell(centre.id, subjectId, year)}
                />
              </section>
            );
          })}
        </div>

        <div className="flex items-center gap-[14px] border-t border-[#F0EAE1] px-[18px] py-[14px]">
          <PrimaryButton onClick={onSave} disabled={pending || !dirty}>
            {pending ? 'Saving…' : 'Save changes'}
          </PrimaryButton>
          <GhostButton onClick={onCancel} disabled={pending || !dirty}>
            Cancel
          </GhostButton>
          <span className="ms-auto text-[13px] text-[#8A827A]">
            {totalSelected} {totalSelected === 1 ? 'class' : 'classes'}
          </span>
        </div>
        <div className="px-[18px] pb-[4px]">
          <ErrorText>{error}</ErrorText>
        </div>
      </SectionCard>

      {/* Destructive-untick confirm — archiving classes that still have plans/teachers. */}
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm && confirm.affected.length === 1 ? 'Archive this class?' : 'Archive these classes?'}
      >
        {confirm ? (
          <>
            <p className="text-[13.5px] leading-relaxed text-[#7A7068]">
              Clearing {confirm.affected.length === 1 ? 'this tick archives a class' : 'these ticks archives classes'} that
              still {confirm.affected.length === 1 ? 'has' : 'have'} work attached. Archiving is
              reversible and leaves lesson plans intact — re-ticking restores the class.
            </p>
            <ul className="mt-[14px] space-y-[8px]">
              {confirm.affected.map((a, i) => (
                <li
                  key={i}
                  className="rounded-[9px] border border-[#F2D6CE] bg-[#FBECE8] px-[12px] py-[9px] text-[13px] text-[#2A2422]"
                  dir="auto"
                >
                  <span className="font-semibold">
                    {a.centreName} · {a.subjectName} · Year {a.year}
                  </span>
                  <span className="text-[#8A827A]">
                    {' — '}
                    {a.planCount} {a.planCount === 1 ? 'plan' : 'plans'}, {a.teacherCount}{' '}
                    {a.teacherCount === 1 ? 'teacher' : 'teachers'}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-[18px] flex items-center justify-end gap-3">
              <GhostButton onClick={() => setConfirm(null)}>Cancel</GhostButton>
              <button
                type="button"
                disabled={pending}
                onClick={() => runSave(confirm.diff)}
                className="rounded-[9px] bg-danger px-[15px] py-[8px] text-[13px] font-semibold text-white transition-colors hover:brightness-105 disabled:opacity-50"
              >
                {pending ? 'Saving…' : 'Archive and save'}
              </button>
            </div>
            <ErrorText>{error}</ErrorText>
          </>
        ) : null}
      </Modal>
    </>
  );
}
