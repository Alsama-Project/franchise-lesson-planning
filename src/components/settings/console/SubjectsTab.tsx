'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SubjectRow } from '@/lib/console';
import {
  archiveSubject,
  createSubject,
  restoreSubject,
  updateSubject,
} from '@/lib/actions/console';
import {
  ConsoleTable,
  EmptyState,
  ErrorText,
  GhostButton,
  Modal,
  MonoChip,
  PinkField,
  PrimaryButton,
  SectionCard,
  StatusBadge,
  Td,
  Th,
} from './ui';

export function SubjectsTab({ subjects }: { subjects: SubjectRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const [archiveTarget, setArchiveTarget] = useState<SubjectRow | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? 'Something went wrong.');
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  const active = subjects.filter((s) => !s.archivedAt);
  const archived = subjects.filter((s) => s.archivedAt);

  return (
    <div className="space-y-[18px]">
      <SectionCard
        title="Subjects"
        action={
          <PrimaryButton onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close' : '＋ New subject'}
          </PrimaryButton>
        }
      >
        {adding ? (
          <div className="border-b border-[#F0EAE1] bg-[#FBF8F3] px-[18px] py-[16px]">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-[200px] flex-1">
                <PinkField
                  value={newName}
                  onChange={setNewName}
                  placeholder="Subject name"
                  aria-label="Subject name"
                  autoFocus
                />
              </div>
              <PrimaryButton
                disabled={pending || !newName.trim()}
                onClick={() =>
                  run(() => createSubject({ name: newName }), () => {
                    setNewName('');
                    setAdding(false);
                  })
                }
              >
                Create
              </PrimaryButton>
              <GhostButton onClick={() => setAdding(false)}>Cancel</GhostButton>
            </div>
            <p className="mt-[10px] text-[12px] text-[#A79E94]">
              A matching curriculum code is assigned automatically.
            </p>
          </div>
        ) : null}

        {subjects.length === 0 ? (
          <EmptyState>No subjects yet. Create the first one above.</EmptyState>
        ) : (
          <ConsoleTable
            head={
              <tr>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th className="text-right">Classes</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            }
          >
            {[...active, ...archived].map((s) => {
              const isArchived = !!s.archivedAt;
              const editing = editId === s.id;
              return (
                <tr key={s.id} className={isArchived ? 'opacity-55' : undefined}>
                  <Td className="font-semibold text-[#2A2422]">
                    {editing ? (
                      <div className="max-w-[240px]">
                        <PinkField
                          value={editName}
                          onChange={setEditName}
                          aria-label="Subject name"
                          autoFocus
                        />
                      </div>
                    ) : (
                      s.name
                    )}
                  </Td>
                  <Td>
                    <MonoChip>{s.code}</MonoChip>
                  </Td>
                  <Td className="text-right tabular-nums text-[#7A7068]">{s.activeClassCount}</Td>
                  <Td>
                    <StatusBadge archived={isArchived} />
                  </Td>
                  <Td className="text-right">
                    {editing ? (
                      <div className="flex items-center justify-end gap-3">
                        <GhostButton
                          tone="teal"
                          disabled={pending || !editName.trim()}
                          onClick={() =>
                            run(
                              () => updateSubject({ id: s.id, name: editName }),
                              () => setEditId(null),
                            )
                          }
                        >
                          Save
                        </GhostButton>
                        <GhostButton onClick={() => setEditId(null)}>Cancel</GhostButton>
                      </div>
                    ) : isArchived ? (
                      <GhostButton
                        tone="teal"
                        disabled={pending}
                        onClick={() => run(() => restoreSubject({ id: s.id }))}
                      >
                        Restore
                      </GhostButton>
                    ) : (
                      <div className="flex items-center justify-end gap-3">
                        <GhostButton
                          tone="teal"
                          onClick={() => {
                            setEditId(s.id);
                            setEditName(s.name);
                          }}
                        >
                          Edit
                        </GhostButton>
                        <GhostButton tone="amber" onClick={() => setArchiveTarget(s)}>
                          Archive
                        </GhostButton>
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </ConsoleTable>
        )}
        <ErrorText>{error}</ErrorText>
      </SectionCard>

      <Modal
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title={`Archive ${archiveTarget?.name ?? 'subject'}?`}
      >
        {archiveTarget && archiveTarget.activeClassCount > 0 ? (
          <>
            <p className="text-[13.5px] leading-relaxed text-[#7A7068]">
              {archiveTarget.activeClassCount}{' '}
              {archiveTarget.activeClassCount === 1 ? 'class' : 'classes'} still reference this
              subject. Reassign or archive those classes first.
            </p>
            <div className="mt-[18px] flex items-center justify-end gap-3">
              <GhostButton onClick={() => setArchiveTarget(null)}>Close</GhostButton>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-[9px] bg-[#E7DECF] px-[15px] py-[8px] text-[13px] font-semibold text-[#A79E94]"
              >
                Archive
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[13.5px] leading-relaxed text-[#7A7068]">
              This subject will be hidden from planning. You can restore it at any time.
            </p>
            <div className="mt-[18px] flex items-center justify-end gap-3">
              <GhostButton onClick={() => setArchiveTarget(null)}>Cancel</GhostButton>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => archiveSubject({ id: archiveTarget!.id }), () => setArchiveTarget(null))
                }
                className="rounded-[9px] px-[15px] py-[8px] text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ background: '#B0651E' }}
              >
                Archive subject
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
