'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { CurriculumSubjectStatus } from '@/lib/console';
import { importCurriculumAction } from '@/lib/curriculum/actions';
import { formatNumber } from '@/lib/format';
import { GhostButton, SectionCard } from './ui';
import { Stat, UploadProgressBar, UploadStatusBadge, hhmm, timeAgo } from './upload';

/**
 * Card state for one subject — a discriminated union that renders EXACTLY ONE
 * status indicator (one badge + at most one status element). The standing stats
 * (Lessons / Unresolved / Deactivated / Last synced) keep coming from the run
 * summary and sit outside this union.
 *
 * `idle` / `syncing` / `error` are derived from the persisted latest run
 * (`success`→idle, `running`→syncing, `error`→error). `success` is a transient
 * client-only state, entered only when an in-session upload transitions
 * running→done; on a full reload the latest run reads back as `success` →
 * derives to `idle`.
 *
 * `syncing` carries optional parsed/total ONLY for a future run that exposes
 * them — `curriculum_sync_run` records no such counts today, so they stay
 * undefined and the bar renders indeterminate (never a fabricated %).
 */
type CurriculumSyncState =
  | { kind: 'idle' }
  | { kind: 'syncing'; parsed?: number; total?: number }
  | { kind: 'success'; summary: string }
  | { kind: 'error'; badgeAt: string; message: string };

export function CurriculumTab({ statuses }: { statuses: CurriculumSubjectStatus[] }) {
  const t = useTranslations('settings');
  if (statuses.length === 0) {
    return (
      <SectionCard title={t('curriculum.title')}>
        <div className="px-[18px] py-[34px] text-center text-[13px] text-[#A79E94]">
          {t('curriculum.empty')}
        </div>
      </SectionCard>
    );
  }
  return (
    <div className="space-y-[18px]">
      {statuses.map((s) => (
        <CurriculumCard key={s.subjectId} status={s} />
      ))}
    </div>
  );
}

function CurriculumCard({ status }: { status: CurriculumSubjectStatus }) {
  const router = useRouter();
  const t = useTranslations('settings');
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  // Transient, in-session only. `success` holds the summary line after an upload
  // succeeds; `clientError` holds an upload/validation failure with the moment it
  // happened (for the "Sync failed · {HH:MM}" badge). Both clear on the next run
  // and neither survives a full reload — the card then re-derives from the run.
  const [success, setSuccess] = useState<string | null>(null);
  const [clientError, setClientError] = useState<{ message: string; at: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = status.latestRun;
  const lastSyncedIso = run?.finishedAt ?? run?.startedAt ?? null;
  const unresolved = run?.unresolved ?? 0;

  // ── Derive the single discriminated state ──
  // Precedence: in-flight upload → transient client result → persisted run. A run
  // that finished hours ago is `idle`, not `success`.
  const state: CurriculumSyncState = pending
    ? { kind: 'syncing' } // no parsed/total in the schema → indeterminate bar
    : clientError
      ? { kind: 'error', badgeAt: clientError.at, message: clientError.message }
      : success
        ? { kind: 'success', summary: success }
        : run?.status === 'running'
          ? { kind: 'syncing' }
          : run?.status === 'error'
            ? {
                kind: 'error',
                badgeAt: run.finishedAt ?? run.startedAt ?? '',
                message: t('curriculum.errorReach', {
                  ago: timeAgo(status.lastGoodAt, t),
                }),
              }
            : { kind: 'idle' };

  function onFile(file: File) {
    setSuccess(null);
    setClientError(null);
    const fd = new FormData();
    fd.set('subject_code', status.code);
    fd.set('file', file);
    startTransition(async () => {
      const res = await importCurriculumAction(null, fd);
      if (res.ok) {
        setSuccess(res.message);
      } else {
        setClientError({ message: res.message, at: new Date().toISOString() });
      }
      router.refresh();
    });
  }

  // No "re-pull from source" trigger exists (sync is n8n folder-watch driven, or
  // a manual file upload). Refresh now / Retry sync are rendered disabled until
  // such a trigger lands — see the curriculum-sync brief, Phase 0 #3.
  const noTrigger = true;

  return (
    <SectionCard
      title={<span dir="auto">{status.name}</span>}
      action={<StateBadge state={state} lastSyncedIso={lastSyncedIso} />}
    >
      <div className="flex flex-wrap items-end justify-between gap-4 px-[18px] py-[16px]">
        <div className="flex flex-wrap gap-x-[28px] gap-y-2 text-[13px]">
          <Stat
            label={t('curriculum.stat.lessons')}
            value={run?.rowsUpserted != null ? formatNumber(run.rowsUpserted, locale) : t('common.dash')}
          />
          <Stat
            label={t('curriculum.stat.unresolved')}
            value={run?.unresolved != null ? formatNumber(run.unresolved, locale) : t('common.dash')}
          />
          <Stat
            label={t('curriculum.stat.deactivated')}
            value={
              run?.rowsDeactivated != null ? formatNumber(run.rowsDeactivated, locale) : t('common.dash')
            }
          />
          <Stat label={t('curriculum.stat.lastSynced')} value={timeAgo(lastSyncedIso, t)} />
        </div>
        <div className="flex items-center gap-3">
          {state.kind === 'syncing' ? (
            // Syncing: the badge + progress bar are the entire status; the only
            // action is the disabled in-flight label.
            <GhostButton tone="teal" disabled>
              {t('curriculum.action.refreshing')}
            </GhostButton>
          ) : (
            <>
              {state.kind === 'error' ? (
                <GhostButton tone="teal" disabled={noTrigger}>
                  {t('curriculum.action.retry')}
                </GhostButton>
              ) : (
                <GhostButton tone="teal" disabled={noTrigger}>
                  {t('curriculum.action.refresh')}
                </GhostButton>
              )}
              {state.kind === 'success' && unresolved > 0 ? (
                <GhostButton
                  tone="teal"
                  onClick={() => {
                    // TODO: no unresolved-review surface exists yet — that's a
                    // separate slice. Wire this to it when it lands.
                  }}
                >
                  {t('curriculum.action.reviewUnresolved', {
                    count: formatNumber(unresolved, locale),
                  })}
                </GhostButton>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = '';
                }}
              />
              <GhostButton tone="teal" onClick={() => fileRef.current?.click()}>
                {t('curriculum.action.upload')}
              </GhostButton>
            </>
          )}
        </div>
      </div>

      {/* Exactly one status element below the stat row, driven by the state. */}
      {state.kind === 'syncing' ? (
        <div className="px-[18px] pb-[16px]">
          <UploadProgressBar
            parsed={state.parsed}
            total={state.total}
            label={t('curriculum.progressAria')}
          />
        </div>
      ) : state.kind === 'success' ? (
        <div className="px-[18px] pb-[14px]">
          <p className="text-[12.5px] font-medium text-[#186155]">{state.summary}</p>
        </div>
      ) : state.kind === 'error' ? (
        <div className="px-[18px] pb-[14px]">
          <p className="text-[12.5px] font-medium text-[#B23A2E]">{state.message}</p>
        </div>
      ) : null}
    </SectionCard>
  );
}

function StateBadge({
  state,
  lastSyncedIso,
}: {
  state: CurriculumSyncState;
  lastSyncedIso: string | null;
}) {
  const t = useTranslations('settings');
  switch (state.kind) {
    case 'syncing':
      return <UploadStatusBadge tone="teal" label={t('curriculum.badge.syncing')} />;
    case 'success':
      return <UploadStatusBadge tone="teal" label={t('curriculum.badge.syncedJustNow')} />;
    case 'error':
      return (
        <UploadStatusBadge tone="red" label={t('curriculum.badge.syncFailed', { time: hhmm(state.badgeAt) })} />
      );
    case 'idle':
    default:
      return (
        <UploadStatusBadge tone="teal" label={t('curriculum.badge.synced', { ago: timeAgo(lastSyncedIso, t) })} />
      );
  }
}
