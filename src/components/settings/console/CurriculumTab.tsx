'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CurriculumSubjectStatus } from '@/lib/console';
import { importCurriculumAction } from '@/lib/curriculum/actions';
import { ErrorText, GhostButton, MonoChip, SectionCard } from './ui';

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Local clock time as HH:MM (for the "Sync failed · {HH:MM}" badge). */
function hhmm(iso: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Card state for one subject. The standing stats (Lessons / Unresolved /
 * Deactivated / Last synced) keep coming from the run summary; this union only
 * carries the state-specific extras.
 *
 * `idle` / `syncing` / `error` are derived from the persisted latest run
 * (`success`→idle, `running`→syncing, `error`→error). `success` is a transient
 * client-only state, entered only when an in-session upload transitions
 * running→done; on a full reload the latest run reads back as `success` →
 * derives to `idle`. (With no in-session trigger, `success` is unreachable.)
 */
type CurriculumSyncState =
  | { kind: 'idle' }
  | { kind: 'syncing'; parsed?: number; total?: number }
  | { kind: 'success'; added: number }
  | { kind: 'error'; at: string; lastGood?: string };

export function CurriculumTab({ statuses }: { statuses: CurriculumSubjectStatus[] }) {
  if (statuses.length === 0) {
    return (
      <SectionCard title="Curriculum">
        <div className="px-[18px] py-[34px] text-center text-[13px] text-[#A79E94]">
          No subjects to sync.
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
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Transient: set true when an in-session upload finishes successfully so the
  // card shows the "Synced just now" success state until the next full reload.
  const [justSynced, setJustSynced] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = status.latestRun;

  // ── Derive the discriminated state ──
  // In-flight upload wins; then the transient in-session success; otherwise map
  // from the persisted latest run. A run that finished hours ago is `idle`.
  const state: CurriculumSyncState = pending
    ? { kind: 'syncing' } // no parsed/total: curriculum_sync_run records only a final result
    : justSynced
      ? // The schema has no rows-added delta column (only rows_upserted = total
        // rows written this run, insert+update indistinguishable), so we carry
        // the count for the union's shape but do not render a fabricated "+added".
        { kind: 'success', added: run?.rowsUpserted ?? 0 }
      : run?.status === 'running'
        ? { kind: 'syncing' }
        : run?.status === 'error'
          ? {
              kind: 'error',
              at: run.finishedAt ?? run.startedAt ?? '',
              lastGood: status.lastGoodAt ?? undefined,
            }
          : { kind: 'idle' };

  const lastSyncedIso = run?.finishedAt ?? run?.startedAt ?? null;
  const unresolved = run?.unresolved ?? 0;

  function onFile(file: File) {
    setMessage(null);
    setError(null);
    setJustSynced(false);
    const fd = new FormData();
    fd.set('subject_code', status.code);
    fd.set('file', file);
    startTransition(async () => {
      const res = await importCurriculumAction(null, fd);
      if (res.ok) {
        setMessage(res.message);
        setJustSynced(true);
      } else {
        setError(res.message);
      }
      router.refresh();
    });
  }

  // No "re-pull from source" trigger exists (sync is n8n folder-watch driven, or
  // a manual file upload). Refresh now / Retry sync are rendered disabled until
  // such a trigger lands — see the curriculum-sync brief, Gate / Phase 0 #4.
  const noTrigger = true;

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          {status.name} <MonoChip>{status.code}</MonoChip>
        </span>
      }
      action={<StateBadge state={state} lastSyncedIso={lastSyncedIso} />}
    >
      <div className="flex flex-wrap items-end justify-between gap-4 px-[18px] py-[16px]">
        <div className="flex flex-wrap gap-x-[28px] gap-y-2 text-[13px]">
          <Stat label="Lessons" value={run?.rowsUpserted ?? '—'} />
          <Stat label="Unresolved" value={run?.unresolved ?? '—'} />
          <Stat label="Deactivated" value={run?.rowsDeactivated ?? '—'} />
          <Stat label="Last synced" value={timeAgo(lastSyncedIso)} />
        </div>
        <div className="flex items-center gap-3">
          {state.kind === 'error' ? (
            <GhostButton tone="teal" disabled={noTrigger}>
              Retry sync
            </GhostButton>
          ) : state.kind === 'syncing' ? (
            <GhostButton tone="teal" disabled>
              Refreshing…
            </GhostButton>
          ) : (
            <GhostButton tone="teal" disabled={noTrigger}>
              Refresh now
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
              Review {unresolved} unresolved
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
          <GhostButton tone="teal" disabled={pending} onClick={() => fileRef.current?.click()}>
            Upload .xlsx
          </GhostButton>
        </div>
      </div>

      {state.kind === 'syncing' ? (
        <div className="px-[18px] pb-[14px]">
          <p className="text-[12.5px] font-medium text-[#186155]">Syncing from source…</p>
          <p className="mt-px text-[12px] text-[#A79E94]">Syncing…</p>
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div className="px-[18px] pb-[14px]">
          <p className="text-[12.5px] font-medium text-[#B23A2E]">
            Couldn&rsquo;t reach the curriculum source. Last good sync was {timeAgo(state.lastGood ?? null)}.
          </p>
        </div>
      ) : null}

      {message ? (
        <div className="px-[18px] pb-[14px]">
          <p className="text-[12.5px] font-medium text-[#186155]">{message}</p>
        </div>
      ) : null}
      {error ? (
        <div className="px-[18px] pb-[14px]">
          <ErrorText>{error}</ErrorText>
        </div>
      ) : null}
    </SectionCard>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#A79E94]">{label}</div>
      <div className="mt-px text-[14px] font-semibold tabular-nums text-[#2A2422]">{value}</div>
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
  const teal = { bg: '#E4F0ED', fg: '#186155' };
  const red = { bg: '#FBF2F5', fg: '#B23A2E' };

  let bg = teal.bg;
  let fg = teal.fg;
  let label: string;
  switch (state.kind) {
    case 'syncing':
      label = 'Syncing…';
      break;
    case 'success':
      label = 'Synced just now';
      break;
    case 'error':
      ({ bg, fg } = red);
      label = `Sync failed · ${hhmm(state.at)}`;
      break;
    case 'idle':
    default:
      label = `Synced ${timeAgo(lastSyncedIso)}`;
      break;
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-[10px] py-[3px] text-[11.5px] font-semibold"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}
