'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { saveSettings } from '@/lib/actions/onboarding';
import type { Centre, ClassOption, MyClass, SpaceCounts, SubjectOption } from '@/lib/onboarding';
import { CheckIcon, SubjectChip, subjectInitials } from '@/components/onboarding/pieces';

interface MembershipView {
  id: string;
  schoolId: string;
  subjectId: string;
  schoolName: string | null;
  subjectName: string | null;
}

interface SettingsFormProps {
  fullName: string;
  centres: Centre[];
  subjects: SubjectOption[];
  classes: ClassOption[];
  teacherCounts: SpaceCounts;
  classCounts: SpaceCounts;
  memberships: MembershipView[];
  myClasses: MyClass[];
}

const spaceKey = (schoolId: string, subjectId: string) => `${schoolId}:${subjectId}`;

/** A subject space as shown in the list — an existing membership or a staged add. */
interface SpaceRow {
  key: string;
  schoolId: string;
  subjectId: string;
  schoolName: string | null;
  subjectName: string | null;
  membershipId: string | null; // null when this is a staged (not-yet-saved) add
}

export function SettingsForm(props: SettingsFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(props.fullName);
  const [removeSpaceIds, setRemoveSpaceIds] = useState<Set<string>>(new Set());
  const [addSpaces, setAddSpaces] = useState<Array<{ schoolId: string; subjectId: string }>>([]);
  const [removeClassIds, setRemoveClassIds] = useState<Set<string>>(new Set());
  const [addClassIds, setAddClassIds] = useState<Set<string>>(new Set());

  const [activeCentreId, setActiveCentreId] = useState<string | null>(
    props.memberships[0]?.schoolId ?? props.centres[0]?.id ?? null,
  );
  const [centrePickerOpen, setCentrePickerOpen] = useState(false);
  const [addSpaceOpen, setAddSpaceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const centreName = (id: string | null) => props.centres.find((c) => c.id === id)?.name ?? '';
  const subjectName = (id: string) => props.subjects.find((s) => s.id === id)?.name ?? '—';

  // Spaces currently shown: kept memberships + staged adds.
  const spaces: SpaceRow[] = useMemo(() => {
    const kept: SpaceRow[] = props.memberships
      .filter((m) => !removeSpaceIds.has(m.id))
      .map((m) => ({
        key: spaceKey(m.schoolId, m.subjectId),
        schoolId: m.schoolId,
        subjectId: m.subjectId,
        schoolName: m.schoolName,
        subjectName: m.subjectName,
        membershipId: m.id,
      }));
    const added: SpaceRow[] = addSpaces.map((s) => ({
      key: spaceKey(s.schoolId, s.subjectId),
      schoolId: s.schoolId,
      subjectId: s.subjectId,
      schoolName: centreName(s.schoolId),
      subjectName: subjectName(s.subjectId),
      membershipId: null,
    }));
    return [...kept, ...added];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.memberships, removeSpaceIds, addSpaces]);

  const memberSubjectIdsAtActive = useMemo(
    () => new Set(spaces.filter((s) => s.schoolId === activeCentreId).map((s) => s.subjectId)),
    [spaces, activeCentreId],
  );

  // Every class in the user's subject space(s), grouped by Year — the full
  // toggle list. A class never leaves this list; ticking only flips local state.
  const spaceKeySet = useMemo(
    () => new Set(spaces.map((s) => spaceKey(s.schoolId, s.subjectId))),
    [spaces],
  );
  const classGroups = useMemo(() => {
    const inSpaces = props.classes.filter((c) =>
      spaceKeySet.has(spaceKey(c.schoolId, c.subjectId)),
    );
    const byYear = new Map<number, ClassOption[]>();
    for (const c of inSpaces) {
      const list = byYear.get(c.year) ?? [];
      list.push(c);
      byYear.set(c.year, list);
    }
    return [...byYear.entries()].sort(([a], [b]) => a - b).map(([year, list]) => ({ year, list }));
  }, [props.classes, spaceKeySet]);

  // The assigned baseline (existing class_teachers rows), overridden by the
  // unsaved add/remove deltas.
  const assignedClassIds = useMemo(
    () => new Set(props.myClasses.map((c) => c.id)),
    [props.myClasses],
  );
  const isClassTicked = (id: string) =>
    addClassIds.has(id) || (assignedClassIds.has(id) && !removeClassIds.has(id));

  // Subjects available to add at the active centre (not already a space there).
  const addableSubjects = props.subjects.filter((s) => !memberSubjectIdsAtActive.has(s.id));

  const dirty =
    name.trim() !== props.fullName.trim() ||
    removeSpaceIds.size > 0 ||
    addSpaces.length > 0 ||
    removeClassIds.size > 0 ||
    addClassIds.size > 0;

  function leaveSpace(row: SpaceRow) {
    setError(null);
    if (spaces.length <= 1) {
      setError('You must belong to at least one subject space.');
      return;
    }
    if (row.membershipId) {
      setRemoveSpaceIds((prev) => new Set(prev).add(row.membershipId!));
      // Dropping a space also drops its staged class adds.
      setAddClassIds((prev) => {
        const next = new Set(prev);
        for (const c of props.classes) {
          if (next.has(c.id) && c.schoolId === row.schoolId && c.subjectId === row.subjectId)
            next.delete(c.id);
        }
        return next;
      });
    } else {
      setAddSpaces((prev) =>
        prev.filter((s) => !(s.schoolId === row.schoolId && s.subjectId === row.subjectId)),
      );
    }
  }

  function addSpace(subjectId: string) {
    if (!activeCentreId) return;
    setAddSpaces((prev) => [...prev, { schoolId: activeCentreId, subjectId }]);
  }

  // Toggle a class's ticked state — local only; nothing is written until Save.
  // We adjust the add/remove deltas against the assigned baseline so the row
  // stays put and can be re-ticked freely.
  function toggleClass(id: string) {
    const assigned = assignedClassIds.has(id);
    const dropFrom = (setter: typeof setAddClassIds) =>
      setter((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    if (isClassTicked(id)) {
      // Untick: stage a remove for an assigned class, or undo a staged add.
      if (assigned) setRemoveClassIds((prev) => new Set(prev).add(id));
      else dropFrom(setAddClassIds);
    } else {
      // Tick: undo a staged remove for an assigned class, or stage an add.
      if (assigned) dropFrom(setRemoveClassIds);
      else setAddClassIds((prev) => new Set(prev).add(id));
    }
  }

  function onCancel() {
    setName(props.fullName);
    setRemoveSpaceIds(new Set());
    setAddSpaces([]);
    setRemoveClassIds(new Set());
    setAddClassIds(new Set());
    setError(null);
    setToast(null);
    setAddSpaceOpen(false);
    setCentrePickerOpen(false);
  }

  function onSave() {
    setError(null);
    setToast(null);
    startTransition(async () => {
      const res = await saveSettings({
        fullName: name.trim() !== props.fullName.trim() ? name.trim() : undefined,
        addSpaces,
        removeSpaceIds: [...removeSpaceIds],
        addClassIds: [...addClassIds],
        removeClassIds: [...removeClassIds],
      });
      if (!res.ok) {
        setError(res.error ?? 'Could not save your changes.');
        return;
      }
      onCancel();
      setToast(res.warning ?? 'Changes saved.');
      router.refresh();
    });
  }

  return (
    <div>
      {/* Name */}
      <SectionLabel>Your name</SectionLabel>
      <div className="mb-[26px] rounded-[12px] border border-mine-border bg-mine p-[6px]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your full name"
          className="w-full rounded-[8px] border border-mine-field bg-surface px-[13px] py-[11px] text-[14.5px] font-medium text-ink outline-none"
        />
      </div>

      {/* Your centre */}
      <SectionLabel>Your centre</SectionLabel>
      <div className="mb-[26px] rounded-[13px] border border-[#ECE4D7] bg-surface-subtle p-[14px_17px]">
        <div className="flex items-center gap-[14px]">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[11px] border border-[#E4DACB] bg-surface">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#B0651E" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
          </span>
          <div className="flex-1">
            <div className="text-[15px] font-semibold">{centreName(activeCentreId) || '—'}</div>
            <div className="mt-px text-[12px] text-text-faint">
              {centrePickerOpen ? 'Pick the centre to add spaces and classes under' : 'Active centre'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCentrePickerOpen((v) => !v)}
            className="rounded-[9px] border border-teal-tint-border bg-surface px-[13px] py-2 text-[12.5px] font-semibold text-teal hover:bg-surface-subtle"
          >
            {centrePickerOpen ? 'Done' : 'Change centre'}
          </button>
        </div>
        {centrePickerOpen ? (
          <div className="mt-[14px] flex flex-wrap gap-2">
            {props.centres.map((c) => {
              const active = c.id === activeCentreId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setActiveCentreId(c.id);
                    setAddSpaceOpen(false);
                  }}
                  className={cn(
                    'rounded-[10px] border-[1.5px] px-4 py-[9px] text-[13px] transition-colors',
                    active
                      ? 'border-teal bg-teal font-semibold text-white'
                      : 'border-[#E0D6C7] bg-surface font-medium text-neutral-900 hover:bg-surface-subtle',
                  )}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Subject spaces */}
      <SectionLabel>Subject spaces</SectionLabel>
      <div className="mb-[11px] overflow-hidden rounded-[13px] border border-border">
        {spaces.length === 0 ? (
          <div className="p-[14px_16px] text-[13px] text-text-faint">No subject spaces yet.</div>
        ) : (
          spaces.map((row, i) => {
            const teachers = props.teacherCounts[row.key] ?? (row.membershipId ? 1 : 0);
            const classCount = props.classCounts[row.key] ?? 0;
            return (
              <div key={row.key}>
                {i > 0 ? <div className="h-px bg-[#F0EAE1]" /> : null}
                <div className="flex items-center gap-[13px] p-[14px_16px]">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-teal-tint text-[13px] font-bold text-teal-deep">
                    {subjectInitials(row.subjectName ?? '?')}
                  </span>
                  <div className="flex-1">
                    <div className="text-[14.5px] font-semibold">
                      {row.subjectName} at {row.schoolName}
                      {row.membershipId ? null : (
                        <span className="ml-2 text-[10.5px] font-semibold text-teal">New</span>
                      )}
                    </div>
                    <div className="mt-px text-[12px] text-text-faint">
                      {teachers} {teachers === 1 ? 'teacher' : 'teachers'} · {classCount}{' '}
                      {classCount === 1 ? 'class' : 'classes'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => leaveSpace(row)}
                    className="cursor-pointer text-[12.5px] font-semibold text-[#9A8C7B] hover:text-pink"
                  >
                    Leave space
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button
        type="button"
        onClick={() => setAddSpaceOpen((v) => !v)}
        className="mb-[26px] w-full rounded-[11px] border border-dashed border-[#BBD9D0] bg-surface p-3 text-[13px] font-semibold text-teal hover:bg-surface-subtle"
      >
        ＋ Add a subject space
      </button>
      {addSpaceOpen ? (
        <div className="-mt-[14px] mb-[26px] rounded-[12px] border border-border p-[14px]">
          <div className="mb-2 text-[11px] text-text-faint">
            Add a subject at {centreName(activeCentreId) || 'your centre'}
          </div>
          {addableSubjects.length === 0 ? (
            <div className="text-[12.5px] text-text-faint">
              You already have every subject at this centre.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {addableSubjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    addSpace(s.id);
                    setAddSpaceOpen(false);
                  }}
                  className="flex items-center gap-3 rounded-[11px] border border-border bg-surface px-[13px] py-[11px] text-left hover:bg-surface-subtle"
                >
                  <span className="size-[21px] shrink-0 rounded-[6px] border-[1.5px] border-[#D8CFC2] bg-surface" />
                  <span className="flex-1 text-[14px] font-semibold">{s.name}</span>
                  <span className="text-[12px] font-semibold text-teal">Add</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* My classes — every class in your subject spaces; tick the ones you teach. */}
      <SectionLabel>My classes</SectionLabel>
      <div className="mb-[26px] rounded-[13px] border border-border p-[16px_17px]">
        {classGroups.length === 0 ? (
          <div className="text-[12.5px] text-text-faint">
            No classes in your subject spaces yet.
          </div>
        ) : (
          <div className="flex flex-col gap-[14px]">
            {classGroups.map(({ year, list }) => (
              <div key={year}>
                <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.05em] text-text-faint">
                  Year {year}
                </div>
                {list.map((c) => {
                  const ticked = isClassTicked(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="checkbox"
                      aria-checked={ticked}
                      onClick={() => toggleClass(c.id)}
                      className="flex w-full items-center gap-[11px] py-1 text-left"
                    >
                      {ticked ? (
                        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-teal">
                          <CheckIcon size={11} />
                        </span>
                      ) : (
                        <span className="size-5 shrink-0 rounded-[6px] border-[1.5px] border-[#D8CFC2] bg-surface" />
                      )}
                      <span className="flex-1 text-[13.5px] font-semibold">
                        Year {c.year} · {c.groupLabel}
                      </span>
                      <SubjectChip>{c.subjectName ?? '—'}</SubjectChip>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {error ? <p className="mb-3 text-[12.5px] font-medium text-pink">{error}</p> : null}
      {toast ? <p className="mb-3 text-[12.5px] font-medium text-teal-deep">{toast}</p> : null}
      <div className="flex items-center gap-3 border-t border-[#F0EAE1] pt-5">
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !dirty}
          className="rounded-[11px] bg-teal px-[22px] py-3 text-[14px] font-semibold text-white transition-colors hover:bg-[#1a6a5d] disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending || !dirty}
          className="text-[13.5px] font-medium text-neutral-700 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[11px] text-[11.5px] font-bold uppercase tracking-[0.05em] text-text-faint">
      {children}
    </div>
  );
}
