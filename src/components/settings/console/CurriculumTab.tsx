'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { CurriculumSubjectStatus } from '@/lib/console';
import {
  importCurriculumAction,
  publishCurriculumVersionAction,
  listUnresolvedCurriculumRows,
} from '@/lib/curriculum/actions';
import type { UnresolvedCurriculumRow } from '@/lib/curriculum/types';
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

export function CurriculumTab({
  statuses,
  isAdmin,
}: {
  statuses: CurriculumSubjectStatus[];
  isAdmin: boolean;
}) {
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
        <CurriculumCard key={s.subjectId} status={s} isAdmin={isAdmin} />
      ))}
    </div>
  );
}

function CurriculumCard({ status, isAdmin }: { status: CurriculumSubjectStatus; isAdmin: boolean }) {
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
  const publishRef = useRef<HTMLInputElement>(null);

  const run = status.latestRun;
  const lastSyncedIso = run?.finishedAt ?? run?.startedAt ?? null;
  // LIVE count (active rows with no daily outcome), not the stored run count which can
  // drift — drives both the "Unresolved" stat and the persistent Review button.
  const unresolved = status.unresolvedLive;
  const [reviewOpen, setReviewOpen] = useState(false);

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

  // Publish a NEW curriculum version (admin-only, distinct from the reconcile upload
  // above): the parsed workbook becomes a fresh active version, and every existing plan
  // stays pinned to its previous version. Confirmed before running — it is not undoable
  // from the UI.
  function onPublishFile(file: File) {
    if (
      !window.confirm(
        t('curriculum.publishConfirm', { subject: status.name }),
      )
    ) {
      return;
    }
    setSuccess(null);
    setClientError(null);
    const fd = new FormData();
    fd.set('subject_code', status.code);
    fd.set('file', file);
    startTransition(async () => {
      const res = await publishCurriculumVersionAction(null, fd);
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
    <>
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
            value={formatNumber(unresolved, locale)}
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
              {/* Admin-only entry to the per-subject Curriculum Gaps reconcile page.
                  This is the wire-up the whole reconcile task hinges on: the standing
                  affordance that turns the sync result into an actionable review of
                  every gap/placeholder/guard row for this subject. */}
              {isAdmin ? (
                <Link
                  href={`/settings/curriculum/${encodeURIComponent(status.code)}`}
                  className="inline-flex items-center gap-[6px] rounded-[8px] border border-[#CFE6E0] bg-[#E4F0ED] px-[12px] py-[7px] text-[12.5px] font-semibold text-[#186155] hover:bg-[#d9ebe6]"
                >
                  {t('curriculum.action.reviewGaps')}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100" aria-hidden>
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              ) : null}
              {/* Persistent whenever the LIVE unresolved count > 0 (not just the
                  transient post-upload success state). Opens the inspector list. */}
              {unresolved > 0 ? (
                <GhostButton tone="teal" onClick={() => setReviewOpen(true)}>
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
              {/* Admin-only: publish the uploaded workbook as a NEW curriculum version
                  (distinct from the reconcile upload above). Existing plans stay pinned
                  to their previous version. */}
              {isAdmin ? (
                <>
                  <input
                    ref={publishRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onPublishFile(f);
                      e.target.value = '';
                    }}
                  />
                  <GhostButton tone="teal" onClick={() => publishRef.current?.click()}>
                    {t('curriculum.action.publishVersion')}
                  </GhostButton>
                </>
              ) : null}
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
      {reviewOpen ? (
        <UnresolvedReviewModal
          subjectCode={status.code}
          subjectName={status.name}
          count={unresolved}
          onClose={() => setReviewOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * The "Review N unresolved" inspector — a read-only modal listing a subject's active
 * rows with no daily outcome (lesson_key / year / week / period). Loads the live list
 * on open via the server action; mutates nothing.
 */
function UnresolvedReviewModal({
  subjectCode,
  subjectName,
  count,
  onClose,
}: {
  subjectCode: string;
  subjectName: string;
  count: number;
  onClose: () => void;
}) {
  const t = useTranslations('settings');
  const locale = useLocale();
  const [rows, setRows] = useState<UnresolvedCurriculumRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    listUnresolvedCurriculumRows(subjectCode)
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch(() => {
        if (alive) setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [subjectCode]);

  // Close on Escape; backdrop click also closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[14px] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#EDE7E0] px-[20px] py-[16px]">
          <h2 className="text-[15px] font-semibold text-[#2C2621]" dir="auto">
            {t('curriculum.reviewModal.title', { subject: subjectName })}
          </h2>
          <p className="mt-1 text-[12.5px] text-[#A79E94]">
            {t('curriculum.reviewModal.subtitle', { count: formatNumber(count, locale) })}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-[20px] py-[12px]">
          {rows === null ? (
            <p className="py-6 text-center text-[13px] text-[#A79E94]">
              {t('curriculum.reviewModal.loading')}
            </p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[#A79E94]">
              {t('curriculum.reviewModal.empty')}
            </p>
          ) : (
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="text-left text-[#A79E94]">
                  <th className="py-1 pr-3 font-medium">{t('curriculum.reviewModal.colKey')}</th>
                  <th className="py-1 pr-3 font-medium">{t('curriculum.reviewModal.colYear')}</th>
                  <th className="py-1 pr-3 font-medium">{t('curriculum.reviewModal.colWeek')}</th>
                  <th className="py-1 font-medium">{t('curriculum.reviewModal.colPeriod')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.lessonKey} className="border-t border-[#F1ECE6] text-[#4A433C]">
                    <td className="py-1 pr-3 font-mono text-[11.5px] break-all">{r.lessonKey}</td>
                    <td className="py-1 pr-3">{formatNumber(r.year, locale)}</td>
                    <td className="py-1 pr-3">{formatNumber(r.week, locale)}</td>
                    <td className="py-1">
                      {r.period != null
                        ? formatNumber(r.period, locale)
                        : t('curriculum.reviewModal.weekly')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="border-t border-[#EDE7E0] px-[20px] py-[12px] text-right">
          <GhostButton tone="teal" onClick={onClose}>
            {t('curriculum.reviewModal.close')}
          </GhostButton>
        </div>
      </div>
    </div>
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
