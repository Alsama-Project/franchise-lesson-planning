'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { saveSettings } from '@/lib/actions/onboarding';
import type { Centre, ClassOption, MyClass, SubjectOption } from '@/lib/onboarding';
import type { MembershipRole } from '@/lib/auth';
import { ClassAssignmentGrid } from '@/components/settings/ClassAssignmentGrid';

interface MembershipView {
  id: string;
  schoolId: string;
  subjectId: string;
  schoolName: string | null;
  subjectName: string | null;
  role: MembershipRole;
}

interface SettingsFormProps {
  fullName: string;
  centres: Centre[];
  subjects: SubjectOption[];
  classes: ClassOption[];
  memberships: MembershipView[];
  myClasses: MyClass[];
}

const spaceKey = (schoolId: string, subjectId: string) => `${schoolId}:${subjectId}`;

export function SettingsForm(props: SettingsFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(props.fullName);
  // The FULL set of class ids the teacher wants, across every centre. Seeded
  // from current assignments; the grid edits the active centre's slice while
  // other-centre ticks ride along untouched (set_my_classes is global).
  const assignedClassIds = useMemo(
    () => new Set(props.myClasses.map((c) => c.id)),
    [props.myClasses],
  );
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(assignedClassIds));

  const [activeCentreId, setActiveCentreId] = useState<string | null>(
    props.memberships[0]?.schoolId ?? props.centres[0]?.id ?? null,
  );
  const [centrePickerOpen, setCentrePickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const centreName = (id: string | null) => props.centres.find((c) => c.id === id)?.name ?? '';

  // Class lookup by id — used to map ticked ids back to (centre, subject).
  const classById = useMemo(() => {
    const map = new Map<string, ClassOption>();
    for (const c of props.classes) map.set(c.id, c);
    return map;
  }, [props.classes]);

  function toggleClass(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Dirty when the ticked set diverges from the assigned baseline, or the name
  // changed. Sizes differ → dirty; else every ticked id must already be assigned.
  const classesDirty =
    ticked.size !== assignedClassIds.size || [...ticked].some((id) => !assignedClassIds.has(id));
  const dirty = name.trim() !== props.fullName.trim() || classesDirty;

  // Count shown in the footer: classes selected at the centre currently in view.
  const selectedHere = useMemo(
    () => [...ticked].filter((id) => classById.get(id)?.schoolId === activeCentreId).length,
    [ticked, classById, activeCentreId],
  );

  function onCancel() {
    setName(props.fullName);
    setTicked(new Set(assignedClassIds));
    setError(null);
    setToast(null);
    setCentrePickerOpen(false);
  }

  function onSave() {
    setError(null);
    setToast(null);

    // Derive the membership deltas from the CHANGE in the ticked set, not its
    // absolute value: a teacher belongs to a (centre, subject) space iff they
    // teach ≥1 class in it (decision A). We only join a space whose FIRST class
    // was just ticked, and only leave a space whose LAST class was just unticked
    // — a pre-existing empty membership (joined with no classes) is never
    // disturbed, and a name-only save touches no spaces at all. Only TEACHER
    // rows are considered; coordinator access lives in coordinator_subject and
    // is never written here.
    const spaceOf = (id: string) => {
      const c = classById.get(id);
      return c ? spaceKey(c.schoolId, c.subjectId) : null;
    };
    const baselineSpaces = new Set([...assignedClassIds].map(spaceOf).filter(Boolean) as string[]);
    const desiredSpaces = new Set([...ticked].map(spaceOf).filter(Boolean) as string[]);
    const currentMemberSpaces = new Map<string, MembershipView>();
    for (const m of props.memberships) {
      if (m.role === 'teacher') currentMemberSpaces.set(spaceKey(m.schoolId, m.subjectId), m);
    }

    // Join spaces that just gained their first class and aren't already joined.
    const addSpaces = classesDirty
      ? [...desiredSpaces]
          .filter((k) => !currentMemberSpaces.has(k))
          .map((k) => {
            const [schoolId, subjectId] = k.split(':');
            return { schoolId, subjectId };
          })
      : [];
    // Leave spaces that had classes in the baseline but now have none.
    const removeSpaceIds = classesDirty
      ? [...currentMemberSpaces.entries()]
          .filter(([k]) => baselineSpaces.has(k) && !desiredSpaces.has(k))
          .map(([, m]) => m.id)
      : [];

    // Never force the teacher out of their LAST space. If clearing a subject's
    // last class would drop them to zero memberships, keep one space joined with
    // zero classes instead of tripping the "≥1 space" guard (and erroring the
    // whole save). Retain the earliest membership so the choice is deterministic.
    const remainingAfter = currentMemberSpaces.size - removeSpaceIds.length + addSpaces.length;
    let finalRemoveIds = removeSpaceIds;
    if (remainingAfter < 1 && removeSpaceIds.length > 0) {
      const keep = new Set<string>();
      for (const m of props.memberships) {
        if (keep.size >= 1 - remainingAfter) break;
        if (removeSpaceIds.includes(m.id)) keep.add(m.id);
      }
      finalRemoveIds = removeSpaceIds.filter((id) => !keep.has(id));
    }

    // Optimistic snapshot for rollback on failure.
    const prevTicked = new Set(ticked);
    const prevName = name;
    const classIds = classesDirty ? [...ticked] : undefined;

    startTransition(async () => {
      const res = await saveSettings({
        fullName: name.trim() !== props.fullName.trim() ? name.trim() : undefined,
        addSpaces,
        removeSpaceIds: finalRemoveIds,
        classIds,
      });
      if (!res.ok) {
        // Roll back to the last-saved server state.
        setTicked(prevTicked);
        setName(prevName);
        setError(res.error ?? 'Could not save your changes.');
        return;
      }
      setToast(res.warning ?? 'Changes saved.');
      setError(null);
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
              {centrePickerOpen ? 'Pick the centre whose classes you want to manage' : 'Active centre'}
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
                  onClick={() => setActiveCentreId(c.id)}
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

      {/* Classes — one row per year group, a checkbox in every subject it runs
          under. Ticking joins the subject space; unticking the last class leaves
          it (both derived on Save). */}
      <SectionLabel>Classes you teach</SectionLabel>
      <p className="mb-[11px] -mt-[4px] text-[12.5px] text-text-faint">
        Tick every class you teach at {centreName(activeCentreId) || 'this centre'}. A tick in a
        subject joins its space; clearing a subject’s last tick leaves it.
      </p>
      <div className="mb-[26px]">
        <ClassAssignmentGrid
          classes={props.classes}
          subjects={props.subjects}
          activeCentreId={activeCentreId}
          ticked={ticked}
          onToggle={toggleClass}
        />
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
        <span className="ms-auto text-[12.5px] font-medium text-text-faint">
          {selectedHere} {selectedHere === 1 ? 'class' : 'classes'} selected
        </span>
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
