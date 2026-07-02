'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { AdminMembersData, CoordSpaceMembers, Person } from '@/lib/console';
import type { MembershipRole } from '@/lib/auth';
import {
  coordPromoteMember,
  coordRemoveMember,
  removeMembership,
  saveMembership,
  setUserImpersonation,
} from '@/lib/actions/console';
import {
  Avatar,
  ConsoleTable,
  EmptyState,
  ErrorText,
  FieldLabel,
  GhostButton,
  Modal,
  PrimaryButton,
  RolePill,
  SectionCard,
  Td,
  Th,
  Toggle,
} from './ui';
import { cn } from '@/lib/cn';

// ── Admin view ────────────────────────────────────────────────────────────────

interface FlatRow {
  person: Person;
  membershipId: string | null;
  role: MembershipRole | null;
  schoolName: string | null;
  subjectName: string | null;
  homeClass: string | null;
}

function flatten(people: Person[]): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const person of people) {
    if (person.memberships.length === 0) {
      rows.push({ person, membershipId: null, role: null, schoolName: null, subjectName: null, homeClass: null });
    } else {
      for (const m of person.memberships) {
        rows.push({
          person,
          membershipId: m.membershipId,
          role: m.role,
          schoolName: m.schoolName,
          subjectName: m.subjectName,
          homeClass: m.homeClass,
        });
      }
    }
  }
  return rows;
}

export function AdminMembersTab({ data }: { data: AdminMembersData }) {
  const router = useRouter();
  const t = useTranslations('settings');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  // Optimistic per-person overrides for test-bar access, keyed by profileId, so a
  // toggle reflects instantly and reverts on a failed write.
  const [impOverrides, setImpOverrides] = useState<Record<string, boolean>>({});

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? t('common.somethingWrong'));
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  const impValue = (p: Person) => impOverrides[p.profileId] ?? p.canImpersonate;

  function toggleImpersonation(p: Person, next: boolean) {
    const prev = impValue(p);
    setError(null);
    setImpOverrides((o) => ({ ...o, [p.profileId]: next }));
    startTransition(async () => {
      const res = await setUserImpersonation({ targetUserId: p.profileId, enabled: next });
      if (!res.ok) {
        setImpOverrides((o) => ({ ...o, [p.profileId]: prev }));
        setError(res.error ?? t('common.somethingWrong'));
        return;
      }
      router.refresh();
    });
  }

  const rows = flatten(data.people);
  const dash = t('common.dash');
  // The test-bar toggle is rendered ONCE per person; the table is flattened per
  // membership, so track which profileIds have already shown their toggle.
  const impSeen = new Set<string>();

  return (
    <div className="space-y-[18px]">
      <SectionCard title={t('members.title')}>
        {rows.length === 0 ? (
          <EmptyState>{t('members.empty')}</EmptyState>
        ) : (
          <ConsoleTable
            head={
              <tr>
                <Th>{t('members.col.person')}</Th>
                <Th>{t('members.col.role')}</Th>
                <Th>{t('members.col.school')}</Th>
                <Th>{t('members.col.subject')}</Th>
                <Th>{t('members.col.class')}</Th>
                <Th>{t('members.col.testBar')}</Th>
                <Th className="text-end">{t('members.col.actions')}</Th>
              </tr>
            }
          >
            {rows.map((r, i) => {
              // Show the per-person test-bar toggle only on this person's first
              // flattened row; later membership rows leave the cell empty.
              const showToggle = !impSeen.has(r.person.profileId);
              if (showToggle) impSeen.add(r.person.profileId);
              const isAdmin = r.person.role === 'admin';
              return (
              <tr key={`${r.person.profileId}:${r.membershipId ?? 'none'}:${i}`}>
                <Td>
                  <div className="flex items-center gap-[10px]">
                    <Avatar name={r.person.name} />
                    <span className="font-semibold text-[#2A2422]" dir="auto">
                      {r.person.name}
                    </span>
                  </div>
                </Td>
                <Td>
                  <RolePill kind={r.role ?? 'no-access'} />
                </Td>
                <Td className="text-[#7A7068]" dir="auto">{r.schoolName ?? dash}</Td>
                <Td className="text-[#7A7068]" dir="auto">{r.subjectName ?? dash}</Td>
                <Td className="text-[#7A7068]" dir="auto">{r.homeClass ?? dash}</Td>
                <Td>
                  {showToggle ? (
                    isAdmin ? (
                      // Admins are always eligible (can_impersonate OR admin), so
                      // the flag is moot — render implied-on, not a false off-state.
                      <Toggle
                        checked
                        readOnly
                        aria-label={t('members.testBar.adminLabel', { name: r.person.name })}
                        title={t('members.testBar.adminHint')}
                      />
                    ) : (
                      <Toggle
                        checked={impValue(r.person)}
                        disabled={pending}
                        onChange={(next) => toggleImpersonation(r.person, next)}
                        aria-label={t('members.testBar.toggleLabel', { name: r.person.name })}
                      />
                    )
                  ) : null}
                </Td>
                <Td className="text-end">
                  {r.membershipId ? (
                    <div className="flex items-center justify-end gap-3">
                      <GhostButton tone="teal" onClick={() => setEditing(r.person)}>
                        {t('members.edit')}
                      </GhostButton>
                      <GhostButton
                        tone="red"
                        disabled={pending}
                        onClick={() => run(() => removeMembership({ membershipId: r.membershipId! }))}
                      >
                        {t('members.remove')}
                      </GhostButton>
                    </div>
                  ) : (
                    <GhostButton tone="teal" onClick={() => setEditing(r.person)}>
                      {t('members.assign')}
                    </GhostButton>
                  )}
                </Td>
              </tr>
              );
            })}
          </ConsoleTable>
        )}
        <div className="px-[18px]">
          <ErrorText>{error}</ErrorText>
        </div>
      </SectionCard>

      {editing ? (
        <AssignModal
          person={editing}
          centres={data.centres}
          subjects={data.subjects}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(input) => run(() => saveMembership(input), () => setEditing(null))}
        />
      ) : null}
    </div>
  );
}

function AssignModal({
  person,
  centres,
  subjects,
  pending,
  onClose,
  onSave,
}: {
  person: Person;
  centres: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
  pending: boolean;
  onClose: () => void;
  onSave: (input: {
    profileId: string;
    role: MembershipRole;
    schoolIds: string[];
    subjectIds: string[];
  }) => void;
}) {
  const t = useTranslations('settings');
  const seededRole: MembershipRole = person.memberships.some((m) => m.role === 'coordinator')
    ? 'coordinator'
    : 'teacher';
  const [role, setRole] = useState<MembershipRole>(seededRole);
  const [schoolIds, setSchoolIds] = useState<Set<string>>(
    new Set(person.memberships.map((m) => m.schoolId)),
  );
  const [subjectIds, setSubjectIds] = useState<Set<string>>(
    new Set(person.memberships.map((m) => m.subjectId)),
  );

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  const valid = schoolIds.size > 0 && subjectIds.size > 0;

  return (
    <Modal open onClose={onClose} title={t('members.modal.title', { name: person.name })} width={500}>
      <p className="-mt-[8px] mb-[16px] text-[12.5px] text-[#7A7068]">
        {t('members.modal.intro')}
      </p>

      <FieldLabel>{t('members.modal.role')}</FieldLabel>
      <div className="mb-[18px] inline-flex rounded-[9px] border border-[#DDD4C8] p-[3px]">
        {(['teacher', 'coordinator'] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={cn(
              'rounded-[7px] px-[14px] py-[6px] text-[12.5px] font-semibold capitalize transition-colors',
              role === r ? 'bg-[#E4F0ED] text-[#186155]' : 'text-[#7A7068]',
            )}
          >
            {t(`members.modal.roleOption.${r}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel>{t('members.modal.centres')}</FieldLabel>
          <div className="space-y-[6px]">
            {centres.length === 0 ? (
              <p className="text-[12.5px] text-[#A79E94]">{t('members.modal.noActiveCentres')}</p>
            ) : (
              centres.map((c) => (
                <CheckboxRow
                  key={c.id}
                  checked={schoolIds.has(c.id)}
                  label={c.name}
                  onToggle={() => toggle(schoolIds, setSchoolIds, c.id)}
                />
              ))
            )}
          </div>
        </div>
        <div>
          <FieldLabel>{t('members.modal.subjects')}</FieldLabel>
          <div className="space-y-[6px]">
            {subjects.length === 0 ? (
              <p className="text-[12.5px] text-[#A79E94]">{t('members.modal.noActiveSubjects')}</p>
            ) : (
              subjects.map((s) => (
                <CheckboxRow
                  key={s.id}
                  checked={subjectIds.has(s.id)}
                  label={s.name}
                  onToggle={() => toggle(subjectIds, setSubjectIds, s.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-[20px] flex items-center justify-end gap-3">
        <GhostButton onClick={onClose}>{t('members.modal.cancel')}</GhostButton>
        <PrimaryButton
          disabled={pending || !valid}
          onClick={() =>
            onSave({
              profileId: person.profileId,
              role,
              schoolIds: [...schoolIds],
              subjectIds: [...subjectIds],
            })
          }
        >
          {t('members.modal.save')}
        </PrimaryButton>
      </div>
    </Modal>
  );
}

function CheckboxRow({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-[10px] rounded-[8px] px-[8px] py-[6px] text-start hover:bg-[#FBF8F3]"
    >
      <span
        className={cn(
          'inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px]',
          checked ? 'border-[#1F7A6C] bg-[#1F7A6C]' : 'border-[#D8CFC2] bg-white',
        )}
      >
        {checked ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : null}
      </span>
      <span className="text-[13.5px] font-medium text-[#2A2422]" dir="auto">{label}</span>
    </button>
  );
}

// ── Coordinator view ──────────────────────────────────────────────────────────

export function CoordinatorMembersTab({ spaces }: { spaces: CoordSpaceMembers[] }) {
  const router = useRouter();
  const t = useTranslations('settings');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? t('common.somethingWrong'));
        return;
      }
      router.refresh();
    });
  }

  if (spaces.length === 0) {
    return (
      <SectionCard title={t('members.coordinator.title')}>
        <EmptyState>{t('members.coordinator.empty')}</EmptyState>
      </SectionCard>
    );
  }

  const dash = t('common.dash');

  return (
    <div className="space-y-[18px]">
      {spaces.map((space) => (
        <SectionCard
          key={`${space.schoolId}:${space.subjectId}`}
          title={
            <span dir="auto">
              {t('members.coordinator.spaceTitle', {
                subject: space.subjectName ?? '',
                school: space.schoolName ?? '',
              })}
              <span className="ms-2 text-[12.5px] font-medium text-[#A79E94]">
                {t('members.coordinator.spaceMeta', { count: space.members.length })}
              </span>
            </span>
          }
        >
          <ConsoleTable
            head={
              <tr>
                <Th>{t('members.col.person')}</Th>
                <Th>{t('members.col.role')}</Th>
                <Th>{t('members.col.class')}</Th>
                <Th className="text-end">{t('members.col.actions')}</Th>
              </tr>
            }
          >
            {space.members.map((m) => (
              <tr key={m.membershipId}>
                <Td>
                  <div className="flex items-center gap-[10px]">
                    <Avatar name={m.name} />
                    <span className="font-semibold text-[#2A2422]" dir="auto">
                      {m.name}
                      {m.isSelf ? (
                        <span className="ms-2 text-[11.5px] font-semibold text-[#A79E94]">
                          {t('members.you')}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </Td>
                <Td>
                  <RolePill kind={m.role} />
                </Td>
                <Td className="text-[#7A7068]" dir="auto">{m.homeClass ?? dash}</Td>
                <Td className="text-end">
                  {m.isSelf ? (
                    <span className="text-[12.5px] text-[#A79E94]">{dash}</span>
                  ) : (
                    <div className="flex items-center justify-end gap-3">
                      {m.role === 'teacher' ? (
                        <GhostButton
                          tone="teal"
                          disabled={pending}
                          onClick={() => run(() => coordPromoteMember({ membershipId: m.membershipId }))}
                        >
                          {t('members.coordinator.promote')}
                        </GhostButton>
                      ) : null}
                      <GhostButton
                        tone="red"
                        disabled={pending}
                        onClick={() => run(() => coordRemoveMember({ membershipId: m.membershipId }))}
                      >
                        {t('members.coordinator.remove')}
                      </GhostButton>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </ConsoleTable>
        </SectionCard>
      ))}
      <ErrorText>{error}</ErrorText>
      <p className="text-[12px] leading-relaxed text-[#A79E94]">
        {t('members.coordinator.footnote')}
      </p>
    </div>
  );
}
