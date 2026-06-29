'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { SubjectRow } from '@/lib/console';
import { formatNumber } from '@/lib/format';
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
  PinkField,
  PrimaryButton,
  SectionCard,
  StatusBadge,
  Td,
  Th,
} from './ui';

export function SubjectsTab({ subjects }: { subjects: SubjectRow[] }) {
  const router = useRouter();
  const t = useTranslations('settings');
  const locale = useLocale();
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
        setError(res.error ?? t('common.somethingWrong'));
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
        title={t('subjects.title')}
        action={
          <PrimaryButton onClick={() => setAdding((v) => !v)}>
            {adding ? t('subjects.close') : t('subjects.new')}
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
                  placeholder={t('subjects.namePlaceholder')}
                  aria-label={t('subjects.nameLabel')}
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
                {t('subjects.create')}
              </PrimaryButton>
              <GhostButton onClick={() => setAdding(false)}>{t('subjects.cancel')}</GhostButton>
            </div>
            <p className="mt-[10px] text-[12px] text-[#A79E94]">
              {t('subjects.autoCodeHint')}
            </p>
          </div>
        ) : null}

        {subjects.length === 0 ? (
          <EmptyState>{t('subjects.empty')}</EmptyState>
        ) : (
          <ConsoleTable
            head={
              <tr>
                <Th>{t('subjects.col.name')}</Th>
                <Th className="text-end">{t('subjects.col.classes')}</Th>
                <Th>{t('subjects.col.status')}</Th>
                <Th className="text-end">{t('subjects.col.actions')}</Th>
              </tr>
            }
          >
            {[...active, ...archived].map((s) => {
              const isArchived = !!s.archivedAt;
              const editing = editId === s.id;
              return (
                <tr key={s.id} className={isArchived ? 'opacity-55' : undefined}>
                  <Td className="font-semibold text-[#2A2422]" dir="auto">
                    {editing ? (
                      <div className="max-w-[240px]">
                        <PinkField
                          value={editName}
                          onChange={setEditName}
                          aria-label={t('subjects.nameLabel')}
                          autoFocus
                        />
                      </div>
                    ) : (
                      s.name
                    )}
                  </Td>
                  <Td className="text-end tabular-nums text-[#7A7068]">
                    {formatNumber(s.activeClassCount, locale)}
                  </Td>
                  <Td>
                    <StatusBadge archived={isArchived} />
                  </Td>
                  <Td className="text-end">
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
                          {t('subjects.save')}
                        </GhostButton>
                        <GhostButton onClick={() => setEditId(null)}>{t('subjects.cancel')}</GhostButton>
                      </div>
                    ) : isArchived ? (
                      <GhostButton
                        tone="teal"
                        disabled={pending}
                        onClick={() => run(() => restoreSubject({ id: s.id }))}
                      >
                        {t('subjects.restore')}
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
                          {t('subjects.edit')}
                        </GhostButton>
                        <GhostButton tone="amber" onClick={() => setArchiveTarget(s)}>
                          {t('subjects.archive')}
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
        title={t('subjects.archiveTitle', {
          name: archiveTarget?.name ?? t('subjects.archiveFallbackName'),
        })}
      >
        {archiveTarget && archiveTarget.activeClassCount > 0 ? (
          <>
            <p className="text-[13.5px] leading-relaxed text-[#7A7068]">
              {t('subjects.blocked', { count: archiveTarget.activeClassCount })}
            </p>
            <div className="mt-[18px] flex items-center justify-end gap-3">
              <GhostButton onClick={() => setArchiveTarget(null)}>{t('subjects.close')}</GhostButton>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-[9px] bg-[#E7DECF] px-[15px] py-[8px] text-[13px] font-semibold text-[#A79E94]"
              >
                {t('subjects.archive')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[13.5px] leading-relaxed text-[#7A7068]">
              {t('subjects.archiveConfirm')}
            </p>
            <div className="mt-[18px] flex items-center justify-end gap-3">
              <GhostButton onClick={() => setArchiveTarget(null)}>{t('subjects.cancel')}</GhostButton>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => archiveSubject({ id: archiveTarget!.id }), () => setArchiveTarget(null))
                }
                className="rounded-[9px] px-[15px] py-[8px] text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ background: '#B0651E' }}
              >
                {t('subjects.archiveAction')}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
