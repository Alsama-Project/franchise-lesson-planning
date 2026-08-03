'use client';

// The admin "AI instructions" board — the layered instruction stack that drives
// every AI feature. Ported from ai-instructions-v3.html: three screens (board,
// tool/subject expanded inside its column, document popup). Layers ascend in
// authority left→right (1 Alsama · 2 academic · 3 subject · 4 tool); below them
// sits the built-in, non-editable safeguarding floor. Admins upload and manage
// the documents in layers 1–4 here.
//
// Colour semantics are preserved: cream = locked (floor), teal = tools/actions/
// chrome, red = destructive (Archive). Pink is the wordmark only (in the shell)
// and does not appear on this surface.

import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  AI_CONTEXT_TOOLS,
  type AiContextBoard,
  type AiContextDocView,
  type AiContextLayer,
  type AiContextTool,
} from '@/types/ai-context';
import { ErrorText } from '../ui';
import { UploadProgressBar } from '../upload';
import { fullDate, shortDate, filenameStem, findDoc } from './helpers';
import { useDocUpload, useFilePicker } from './useDocUpload';
import { DocumentPopup } from './DocumentPopup';
import { ArchiveConfirmDialog } from './ArchiveConfirmDialog';

export function AiInstructionsTab({ board }: { board: AiContextBoard }) {
  const t = useTranslations('settings');
  const locale = useLocale();
  const router = useRouter();

  // Single expansion across the board (`sub:<id>` | `tool:<tool>`), matching the
  // mockup which opens one group at a time. Popup + archive target are held by id
  // so they re-derive from fresh props after router.refresh().
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [archiveDocId, setArchiveDocId] = useState<string | null>(null);
  // The read-only "Output contract" viewer, keyed by the tool whose contract is open.
  const [contractTool, setContractTool] = useState<AiContextTool | null>(null);

  const openDoc = openDocId ? findDoc(board, openDocId) : null;
  const archiveDoc = archiveDocId ? findDoc(board, archiveDocId) : null;

  const [archiving, startArchive] = useTransition();
  const [archiveError, setArchiveError] = useState<string | null>(null);

  function confirmArchive(id: string) {
    setArchiveError(null);
    startArchive(async () => {
      try {
        const res = await fetch(`/api/admin/context-docs/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ is_archived: true }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setArchiveError(data?.error ?? t('aiInstructions.upload.failed'));
          return;
        }
        setArchiveDocId(null);
        setOpenDocId(null);
        router.refresh();
      } catch {
        setArchiveError(t('aiInstructions.upload.failed'));
      }
    });
  }

  // Header summary line, computed from real data (the mockup's numbers are
  // illustrative). Name is omitted gracefully when unresolved.
  const summary: string = (() => {
    const parts = [t('aiInstructions.header.documents', { count: board.totalDocs })];
    if (board.lastChange) {
      parts.push(t('aiInstructions.header.lastChange', { date: fullDate(board.lastChange.at, locale) }));
      if (board.lastChange.uploaderName) parts.push(board.lastChange.uploaderName);
    }
    return parts.join(' · ');
  })();

  const subjectName = (subjectId: string | null): string | null =>
    subjectId ? (board.subjects.find((s) => s.subjectId === subjectId)?.name ?? null) : null;

  const layerLabelFor = (doc: AiContextDocView): string => t(`aiInstructions.layers.${doc.layer}`);
  const groupLabelFor = (doc: AiContextDocView): string | null => {
    if (doc.layer === 'subject') {
      return subjectName(doc.subjectId);
    }
    if ((doc.layer === 'tool' || doc.layer === 'safeguarding') && doc.tool) {
      const toolLabel = t(`aiInstructions.tools.${doc.tool}`);
      // A per-subject tool override reads as "Worksheet builder · English" so the
      // popup header distinguishes it from the global tool document.
      const subj = doc.layer === 'tool' ? subjectName(doc.subjectId) : null;
      return subj ? `${toolLabel} · ${subj}` : toolLabel;
    }
    return null;
  };

  return (
    <div>
      {/* Heading */}
      <div className="mb-[30px] flex flex-wrap items-center gap-[18px]">
        <h1 className="text-[25px] font-semibold tracking-[-0.01em] text-ink">
          {t('aiInstructions.title')}
        </h1>
        <span dir="auto" className="text-[12.5px] text-text-faint">
          {summary}
        </span>
        {/* Archived view is not drawn in the mockup — rendered as drawn but left
            inert (like the floor "Read"), pending a specified archived screen. */}
        <button
          type="button"
          title={t('aiInstructions.archivedTodo')}
          className="ml-auto cursor-not-allowed rounded-[10px] border border-border-strong bg-surface px-[14px] py-[10px] text-[13px] font-semibold text-neutral-700 opacity-60"
          aria-disabled="true"
        >
          {t('aiInstructions.archived')}
        </button>
      </div>

      {/* Authority ramp */}
      <div className="mb-[14px] flex items-center gap-[14px]">
        <span className="text-[12px] font-semibold text-neutral-700">
          {t('aiInstructions.ramp.start')}
        </span>
        <span
          className="h-[2px] flex-1 rounded-[2px]"
          style={{
            background:
              'linear-gradient(90deg, var(--color-teal-tint), var(--color-authority-academic) 45%, var(--color-teal))',
          }}
        />
        <span className="text-[12px] font-semibold text-teal-deepest">
          {t('aiInstructions.ramp.end')}
        </span>
      </div>

      {/* Four layers */}
      <div className="mb-[18px] grid grid-cols-1 items-start gap-[16px] md:grid-cols-2 xl:grid-cols-4">
        <LayerColumn
          rank={1}
          layer="org"
          title={t('aiInstructions.layers.org')}
          docs={board.org}
          count={board.org.length}
          onOpen={setOpenDocId}
        />
        <LayerColumn
          rank={2}
          layer="academic"
          title={t('aiInstructions.layers.academic')}
          docs={board.academic}
          count={board.academic.length}
          onOpen={setOpenDocId}
        />

        {/* Layer 3 — one row per subject; heading count is the number of groups. */}
        <Column
          rank={3}
          layer="subject"
          title={t('aiInstructions.layers.subject')}
          count={board.subjects.length}
        >
          {board.subjects.map((s) => (
            <GroupRow
              key={s.subjectId}
              label={s.name}
              count={s.docs.length}
              docs={s.docs}
              expanded={expandedKey === `sub:${s.subjectId}`}
              onToggle={() =>
                setExpandedKey((k) => (k === `sub:${s.subjectId}` ? null : `sub:${s.subjectId}`))
              }
              tone="subject"
              addFields={{ layer: 'subject', subject_id: s.subjectId }}
              onOpen={setOpenDocId}
            />
          ))}
        </Column>

        {/* Layer 4 — one row per tool; heading count is the number of groups. */}
        <Column
          rank={4}
          layer="tool"
          title={t('aiInstructions.layers.tool')}
          count={board.tools.length}
        >
          {board.tools.map((g) => (
            <GroupRow
              key={g.tool}
              label={t(`aiInstructions.tools.${g.tool}`)}
              count={g.docs.length}
              docs={g.docs}
              expanded={expandedKey === `tool:${g.tool}`}
              onToggle={() =>
                setExpandedKey((k) => (k === `tool:${g.tool}` ? null : `tool:${g.tool}`))
              }
              tone="tool"
              addFields={{ layer: 'tool', tool: g.tool }}
              subjects={board.subjects.map((s) => ({ subjectId: s.subjectId, name: s.name }))}
              tool={g.tool}
              onOpen={setOpenDocId}
            />
          ))}
        </Column>
      </div>

      {/* The floor, split in two full-width rows: the editable safeguarding half and
          the code-locked output-contract half. */}
      <SafeguardingRow docs={board.safeguarding} onOpen={setOpenDocId} />
      <OutputContractRow onRead={setContractTool} />

      {openDoc ? (
        <DocumentPopup
          doc={openDoc}
          layerLabel={layerLabelFor(openDoc)}
          groupLabel={groupLabelFor(openDoc)}
          onClose={() => setOpenDocId(null)}
          onArchive={() => setArchiveDocId(openDoc.id)}
        />
      ) : null}

      {archiveDoc ? (
        <ArchiveConfirmDialog
          docName={archiveDoc.name}
          pending={archiving}
          error={archiveError}
          onConfirm={() => confirmArchive(archiveDoc.id)}
          onCancel={() => {
            setArchiveDocId(null);
            setArchiveError(null);
          }}
        />
      ) : null}

      {contractTool ? (
        <OutputContractPopup
          tool={contractTool}
          toolLabel={t(`aiInstructions.tools.${contractTool}`)}
          onClose={() => setContractTool(null)}
        />
      ) : null}
    </div>
  );
}

// ── Column shell (border-top authority tint + heading) ────────────────────────

// The 3px authority-tint top edge, as a single arbitrary `border-top` so it
// cleanly overrides the 1px all-round `border-border` (token vars, not raw hex).
const AUTHORITY_TOP: Record<number, string> = {
  1: '[border-top:3px_solid_var(--color-authority-org)]',
  2: '[border-top:3px_solid_var(--color-authority-academic)]',
  3: '[border-top:3px_solid_var(--color-authority-subject)]',
  4: '[border-top:3px_solid_var(--color-teal)]',
};

function Column({
  rank,
  layer,
  title,
  count,
  children,
}: {
  rank: number;
  layer: AiContextLayer;
  title: string;
  count: number;
  children: ReactNode;
}) {
  const isTool = layer === 'tool';
  return (
    <div
      className={`flex min-h-[300px] flex-col gap-[9px] rounded-[12px] border border-border ${AUTHORITY_TOP[rank]} px-[15px] pt-[16px] pb-[15px] ${
        isTool ? 'bg-surface-warm' : ''
      }`}
    >
      <div className="mb-[3px] flex items-center gap-[9px]">
        <RankBadge rank={rank} />
        <span
          className={`flex-1 text-[14px] font-semibold ${isTool ? 'font-bold text-teal-deepest' : 'text-ink'}`}
        >
          {title}
        </span>
        <span className={`text-[11.5px] ${isTool ? 'font-semibold text-teal' : 'text-text-faint'}`}>
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Layers 1–2: documents render directly in the column, with an Add-document
 *  affordance at the foot. Heading count is the number of documents. */
function LayerColumn({
  rank,
  layer,
  title,
  docs,
  count,
  onOpen,
}: {
  rank: number;
  layer: Extract<AiContextLayer, 'org' | 'academic'>;
  title: string;
  docs: AiContextDocView[];
  count: number;
  onOpen: (id: string) => void;
}) {
  return (
    <Column rank={rank} layer={layer} title={title} count={count}>
      {docs.map((doc) => (
        <DocCard key={doc.id} doc={doc} onOpen={onOpen} />
      ))}
      <div className="mt-auto">
        <AddDocument fields={{ layer }} />
      </div>
    </Column>
  );
}

// ── Rank badge (ascending-authority circle) ───────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1
      ? 'bg-surface border-authority-org text-teal'
      : rank === 2
        ? 'bg-surface border-authority-academic text-teal'
        : rank === 3
          ? 'bg-teal-tint border-authority-subject text-teal-deep'
          : 'bg-teal border-teal text-white';
  return (
    <span
      className={`inline-flex size-[21px] items-center justify-center rounded-full border-[1.5px] text-[10.5px] font-bold ${cls}`}
    >
      {rank}
    </span>
  );
}

// ── A document card (layers 1–2, and inside an expanded group) ────────────────

function DocCard({
  doc,
  onOpen,
  showUploader,
  subjectName,
}: {
  doc: AiContextDocView;
  onOpen: (id: string) => void;
  /** Group cards show the uploader; layer 1–2 cards show version + date only. */
  showUploader?: boolean;
  /** Set for a per-subject tool override → shows a scope badge that distinguishes
   *  it from the tool's global document. Null/absent for a global doc. */
  subjectName?: string | null;
}) {
  const t = useTranslations('settings');
  const locale = useLocale();
  const meta = [
    `v${doc.activeVersion}`,
    showUploader ? doc.uploaderName : null,
    shortDate(doc.updatedAt, locale),
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={() => onOpen(doc.id)}
      className={`rounded-[9px] border border-neutral-100 px-[12px] py-[11px] text-start transition-colors hover:border-teal-tint-border ${
        showUploader ? 'bg-surface' : 'bg-surface-raised'
      }`}
    >
      <div className="flex items-start gap-[7px]">
        <div dir="auto" className="min-w-0 flex-1 text-[12.5px] font-semibold leading-[1.35] text-ink">
          {doc.name}
        </div>
        {subjectName ? (
          <span
            dir="auto"
            title={t('aiInstructions.subjectScope', { subject: subjectName })}
            className="shrink-0 rounded-full bg-teal-tint px-[8px] py-[2px] text-[10.5px] font-semibold text-teal-deep"
          >
            {subjectName}
          </span>
        ) : null}
      </div>
      <div dir="auto" className="mt-[5px] text-[11px] text-text-faint">
        {meta.join(' · ')}
      </div>
    </button>
  );
}

// ── A subject / tool group row (collapsed → expands inside the column) ─────────

function GroupRow({
  label,
  count,
  docs,
  expanded,
  onToggle,
  tone,
  addFields,
  subjects,
  tool,
  onOpen,
}: {
  label: string;
  count: number;
  docs: AiContextDocView[];
  expanded: boolean;
  onToggle: () => void;
  tone: 'subject' | 'tool';
  addFields: Record<string, string>;
  /** Subjects available for a per-subject override (tool column only). */
  subjects?: { subjectId: string; name: string }[];
  /** The tool this row is for (tool column only) — drives the per-subject add path. */
  tool?: AiContextTool;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('settings');
  const isEmpty = count === 0;
  const subjectNameOf = (subjectId: string | null): string | null =>
    subjectId ? (subjects?.find((s) => s.subjectId === subjectId)?.name ?? null) : null;

  if (expanded) {
    return (
      <div className="overflow-hidden rounded-[10px] border border-teal bg-surface">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center gap-[9px] bg-teal-tint px-[11px] py-[11px] text-start"
        >
          <span
            dir="auto"
            title={label}
            className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-teal-deepest"
          >
            {label}
          </span>
          <span className="shrink-0 text-[11.5px] text-teal">{count}</span>
          <ChevronUp className="shrink-0 text-teal" />
        </button>
        <div className="flex flex-col gap-[7px] px-[10px] pt-[9px] pb-[11px]">
          {docs.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              onOpen={onOpen}
              showUploader
              subjectName={tone === 'tool' ? subjectNameOf(doc.subjectId) : null}
            />
          ))}
          <AddDocument fields={addFields} />
          {/* Tool column only: a per-subject override of this tool's instructions. */}
          {tone === 'tool' && tool && subjects && subjects.length > 0 ? (
            <AddSubjectDocument tool={tool} subjects={subjects} />
          ) : null}
        </div>
      </div>
    );
  }

  // Collapsed. An empty group keeps the mockup's dashed "None" treatment (a normal
  // state, not an error) but still expands to add its first document.
  return (
    <button
      type="button"
      onClick={onToggle}
      className={
        isEmpty
          ? 'flex items-center gap-[9px] rounded-[9px] border border-dashed border-border-strong bg-surface-warm px-[11px] py-[9px] text-start'
          : tone === 'tool'
            ? 'flex items-center gap-[9px] rounded-[9px] border border-teal-tint-border bg-surface px-[11px] py-[10px] text-start'
            : 'flex items-center gap-[9px] rounded-[9px] border border-neutral-100 px-[11px] py-[9px] text-start'
      }
    >
      <span
        dir="auto"
        title={label}
        className={`min-w-0 flex-1 truncate text-[12.5px] font-semibold ${isEmpty ? 'text-neutral-700' : 'text-ink'}`}
      >
        {label}
      </span>
      {isEmpty ? (
        <span className="shrink-0 text-[11.5px] text-text-faint">{t('aiInstructions.none')}</span>
      ) : (
        <>
          <span className="shrink-0 text-[11.5px] text-neutral-700">{count}</span>
          <ChevronDown
            className={`shrink-0 ${tone === 'tool' ? 'text-teal-muted' : 'text-neutral-300'}`}
          />
        </>
      )}
    </button>
  );
}

// ── Add document (dashed affordance → file picker → create) ────────────────────

function AddDocument({ fields }: { fields: Record<string, string> }) {
  const t = useTranslations('settings');
  const { pending, error, upload } = useDocUpload();
  const { input, open } = useFilePicker((file) =>
    // The mockup draws no name field; default the name to the file's stem.
    upload('/api/admin/context-docs', file, { ...fields, name: filenameStem(file.name) }),
  );
  return (
    <div className="flex flex-col gap-[8px]">
      {input}
      <button
        type="button"
        onClick={open}
        disabled={pending}
        className="rounded-[9px] border border-dashed border-teal-dashed bg-surface py-[9px] text-[12px] font-semibold text-teal transition-colors hover:bg-teal-tint disabled:opacity-50"
      >
        {pending ? t('aiInstructions.upload.uploading') : `＋ ${t('aiInstructions.addDocument')}`}
      </button>
      {pending ? <UploadProgressBar label={t('aiInstructions.upload.uploading')} /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </div>
  );
}

/**
 * Add a PER-SUBJECT override of a tool's instructions: pick a subject, then a file,
 * and the document is created with `layer='tool'`, this `tool`, and the chosen
 * `subject_id` (validated by the same route + DB scope check as the global add). The
 * scaffold document `compileWorksheet` reads for worksheet_builder is created here.
 */
function AddSubjectDocument({
  tool,
  subjects,
}: {
  tool: AiContextTool;
  subjects: { subjectId: string; name: string }[];
}) {
  const t = useTranslations('settings');
  const [subjectId, setSubjectId] = useState('');
  const { pending, error, upload } = useDocUpload();
  const { input, open } = useFilePicker((file) =>
    upload('/api/admin/context-docs', file, {
      layer: 'tool',
      tool,
      subject_id: subjectId,
      name: filenameStem(file.name),
    }),
  );
  return (
    <div className="flex flex-col gap-[8px]">
      {input}
      <div className="flex items-center gap-[7px]">
        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          aria-label={t('aiInstructions.addForSubject.choose')}
          className="min-w-0 flex-1 rounded-[9px] border border-teal-tint-border bg-surface px-[10px] py-[8px] text-[12px] text-ink"
        >
          <option value="">{t('aiInstructions.addForSubject.choose')}</option>
          {subjects.map((s) => (
            <option key={s.subjectId} value={s.subjectId}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={open}
          disabled={pending || !subjectId}
          className="shrink-0 rounded-[9px] border border-dashed border-teal-dashed bg-surface px-[12px] py-[8px] text-[12px] font-semibold text-teal transition-colors hover:bg-teal-tint disabled:opacity-50"
        >
          {pending ? t('aiInstructions.upload.uploading') : `＋ ${t('aiInstructions.addForSubject.label')}`}
        </button>
      </div>
      {pending ? <UploadProgressBar label={t('aiInstructions.upload.uploading')} /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </div>
  );
}

// ── The floor, split: editable safeguarding row + locked output-contract row ───

/** A padlock glyph, sized to fit the leading chip. */
function LockGlyph({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/**
 * Full-width "Safeguarding rules" row — the editable half of the floor. One entry
 * per tool (`smartt_checker` has none), each an ordinary document opening the same
 * `DocumentPopup` (edit / replace / version history) as every other document.
 */
function SafeguardingRow({
  docs,
  onOpen,
}: {
  docs: AiContextDocView[];
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('settings');
  return (
    <div className="mb-[16px] rounded-[12px] border border-border [border-top:3px_solid_var(--color-teal)] px-[18px] pt-[16px] pb-[16px]">
      <div className="mb-[4px] flex items-center gap-[10px]">
        <span className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-[8px] bg-teal-tint text-teal-deep">
          <LockGlyph />
        </span>
        <span className="flex-1 text-[14.5px] font-semibold text-ink">
          {t('aiInstructions.safeguarding.title')}
        </span>
        <span className="text-[11.5px] text-text-faint">{docs.length}</span>
      </div>
      <p dir="auto" className="mb-[13px] ps-[40px] text-[12px] text-text-faint">
        {t('aiInstructions.safeguarding.subtitle')}
      </p>
      <div className="grid grid-cols-1 gap-[9px] md:grid-cols-2 xl:grid-cols-3">
        {docs.map((doc) => (
          <DocCard key={doc.id} doc={doc} onOpen={onOpen} showUploader />
        ))}
      </div>
    </div>
  );
}

/**
 * Full-width "Output contract" row — the locked half of the floor (cream/lock,
 * mirroring the previous floor card). One read-only entry per tool; the lock is an
 * explanation (defined in code, nothing to edit), not a withheld permission.
 */
function OutputContractRow({ onRead }: { onRead: (tool: AiContextTool) => void }) {
  const t = useTranslations('settings');
  return (
    <div className="rounded-[12px] border border-cream-border bg-cream px-[18px] pt-[15px] pb-[16px]">
      <div className="mb-[6px] flex flex-wrap items-center gap-[13px]">
        <span className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-[8px] bg-cream-chip text-cream-ink-muted">
          <LockGlyph />
        </span>
        <span className="flex-1 text-[14.5px] font-semibold text-cream-ink">
          {t('aiInstructions.outputContract.title')}
        </span>
        <span className="rounded-[5px] bg-cream-chip px-[9px] py-[4px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-cream-ink-muted">
          {t('aiInstructions.outputContract.badge')}
        </span>
      </div>
      <p dir="auto" className="mb-[13px] ps-[43px] text-[12px] text-cream-ink-muted">
        {t('aiInstructions.outputContract.note')}
      </p>
      <div className="grid grid-cols-1 gap-[9px] md:grid-cols-2 xl:grid-cols-4">
        {AI_CONTEXT_TOOLS.map((tool) => (
          <div
            key={tool}
            className="flex items-center gap-[9px] rounded-[9px] border border-cream-btn-border bg-cream-btn-bg px-[12px] py-[10px]"
          >
            <span dir="auto" className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-cream-ink">
              {t(`aiInstructions.tools.${tool}`)}
            </span>
            <button
              type="button"
              onClick={() => onRead(tool)}
              className="shrink-0 rounded-[8px] border border-cream-btn-border bg-surface px-[11px] py-[6px] text-[11.5px] font-semibold text-cream-btn-text transition-colors hover:bg-cream-chip"
            >
              {t('aiInstructions.outputContract.read')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Read-only viewer for a tool's output contract. Fetches the code text from the
 * admin-gated route and renders it verbatim, with a note stating it is defined in
 * code and has nothing to edit. No edit / replace / archive / version controls.
 */
function OutputContractPopup({
  tool,
  toolLabel,
  onClose,
}: {
  tool: AiContextTool;
  toolLabel: string;
  onClose: () => void;
}) {
  const t = useTranslations('settings');
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/context-docs/output-contract?tool=${encodeURIComponent(tool)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('failed');
        const data = (await res.json()) as { text: string };
        if (live) setText(data.text);
      })
      .catch(() => {
        if (live) setError(t('aiInstructions.loadError'));
      });
    return () => {
      live = false;
    };
  }, [tool, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={toolLabel}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 py-[34px]"
      style={{ background: 'rgba(42,36,34,0.45)' }}
    >
      <div className="w-full max-w-[760px] overflow-hidden rounded-[14px] border border-cream-border bg-surface shadow-[0_22px_44px_-18px_rgba(42,30,22,0.45)]">
        {/* Header: identity + lock + close */}
        <div className="flex items-start gap-[14px] border-b border-border-subtle bg-cream px-[22px] pt-[20px] pb-[16px]">
          <div className="min-w-0 flex-1">
            <div className="mb-[7px] flex items-center gap-[9px]">
              <span className="inline-flex size-[20px] items-center justify-center rounded-full bg-cream-chip text-cream-ink-muted">
                <LockGlyph size={11} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-cream-ink-muted">
                {`${t('aiInstructions.outputContract.title')} · ${toolLabel}`}
              </span>
            </div>
            <div dir="auto" className="text-[13px] text-cream-ink-muted">
              {t('aiInstructions.outputContract.note')}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('aiInstructions.popup.close')}
            className="inline-flex size-[32px] items-center justify-center rounded-[9px] border border-border text-neutral-700 transition-colors hover:bg-surface-warm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Body: the contract text, verbatim */}
        {error ? (
          <p className="mx-[22px] my-[18px] rounded-[10px] border border-danger-border bg-danger-bg px-[12px] py-[8px] text-[12.5px] font-medium text-danger">
            {error}
          </p>
        ) : (
          <div
            dir="auto"
            className="max-h-[460px] overflow-auto whitespace-pre-wrap px-[22px] pt-[18px] pb-[24px] font-mono text-[12px] leading-[1.8] text-neutral-900"
          >
            {text ?? `${t('aiInstructions.outputContract.read')}…`}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Chevrons ──────────────────────────────────────────────────────────────────

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ChevronUp({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}
