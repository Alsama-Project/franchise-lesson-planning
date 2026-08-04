'use client';

// The admin "AI instructions" board — the layered instruction stack that drives
// every AI feature. Four layer columns, ascending in authority left→right
// (1 Alsama · 2 academic · 3 subject · 4 tool). All instruction content — house
// style, pedagogy, language, safeguarding, tool restrictions — lives in these
// uploaded documents; the machine response contract stays in code and has no UI.
//
// Colour semantics: teal = tools/actions/chrome, red = destructive (Archive).
// Pink is the wordmark only (in the shell) and does not appear on this surface.

import { useState, useTransition, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  type AiContextBoard,
  type AiContextDocView,
  type AiContextFrameView,
  type AiContextLayer,
  type AiContextSubjectGroup,
  type AiContextTool,
} from '@/types/ai-context';
import { ErrorText } from '../ui';
import { UploadProgressBar, UploadStatusBadge } from '../upload';
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
    if (doc.layer === 'tool' && doc.tool) {
      const toolLabel = t(`aiInstructions.tools.${doc.tool}`);
      // A per-subject tool override reads as "Worksheet builder · English" so the
      // popup header distinguishes it from the global tool document.
      const subj = subjectName(doc.subjectId);
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

      {/* Worksheet page frames — a full-width row below the four instruction
          columns. Not part of the instruction stack: the frame is printed page
          furniture (HTML), never composed into a prompt. */}
      <WorksheetFrameRow subjects={board.subjects} frames={board.frames} />

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

// ── Worksheet page frames (full-width row below the columns) ───────────────────

/**
 * Full-width "Worksheet page frames" row. One entry per subject: the uploaded
 * frame's filename with a Replace button, or "Using the built-in page" with an
 * Upload button. Upload REPLACES (no history, no preview, no revert, no confirm).
 * The frame is printed page furniture, not an instruction: it never reaches the AI
 * composer.
 */
function WorksheetFrameRow({
  subjects,
  frames,
}: {
  subjects: AiContextSubjectGroup[];
  frames: AiContextFrameView[];
}) {
  const t = useTranslations('settings');
  const frameBySubject = new Map(frames.map((f) => [f.subjectId, f]));
  return (
    <div className="mt-[16px] rounded-[12px] border border-border [border-top:3px_solid_var(--color-teal)] px-[18px] pt-[16px] pb-[16px]">
      <div className="mb-[4px] flex items-center gap-[10px]">
        <span className="flex-1 text-[14.5px] font-semibold text-ink">
          {t('aiInstructions.worksheetFrame.title')}
        </span>
        <span className="text-[11.5px] text-text-faint">{frames.length}</span>
      </div>
      <p dir="auto" className="mb-[13px] text-[12px] text-text-faint">
        {t('aiInstructions.worksheetFrame.subtitle')}
      </p>
      <div className="grid grid-cols-1 gap-[9px] md:grid-cols-2 xl:grid-cols-3">
        {subjects.map((s) => (
          <FrameCard key={s.subjectId} subject={s} frame={frameBySubject.get(s.subjectId) ?? null} />
        ))}
      </div>
    </div>
  );
}

/**
 * One subject's frame slot: filename + Replace when a frame is uploaded, or the
 * built-in-page note + Upload when not. Owns its own upload transition so each card
 * fails independently. `.html` only, posted to the admin-gated upsert route.
 */
function FrameCard({
  subject,
  frame,
}: {
  subject: AiContextSubjectGroup;
  frame: AiContextFrameView | null;
}) {
  const t = useTranslations('settings');
  const { pending, error, upload } = useDocUpload();
  const { input, open } = useFilePicker(
    (file) => upload('/api/admin/worksheet-frame', file, { subject_id: subject.subjectId }),
    '.html,text/html',
  );
  return (
    <div className="flex flex-col gap-[8px] rounded-[9px] border border-border bg-surface px-[12px] py-[10px]">
      {input}
      <div className="flex items-center gap-[9px]">
        <span dir="auto" className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">
          {subject.name}
        </span>
        {frame ? (
          <UploadStatusBadge tone="teal" label={t('aiInstructions.worksheetFrame.uploaded')} />
        ) : null}
      </div>
      <div className="flex items-center gap-[9px]">
        <span
          dir="auto"
          className={`min-w-0 flex-1 truncate text-[11.5px] ${frame ? 'text-neutral-700' : 'text-text-faint'}`}
          title={frame?.originalFilename ?? undefined}
        >
          {frame
            ? frame.originalFilename ?? t('aiInstructions.worksheetFrame.uploaded')
            : t('aiInstructions.worksheetFrame.builtIn')}
        </span>
        <button
          type="button"
          onClick={open}
          disabled={pending}
          className="shrink-0 rounded-[8px] border border-dashed border-teal-dashed bg-surface px-[11px] py-[6px] text-[11.5px] font-semibold text-teal transition-colors hover:bg-teal-tint disabled:opacity-50"
        >
          {pending
            ? t('aiInstructions.upload.uploading')
            : frame
              ? t('aiInstructions.worksheetFrame.replace')
              : t('aiInstructions.worksheetFrame.upload')}
        </button>
      </div>
      {pending ? <UploadProgressBar label={t('aiInstructions.upload.uploading')} /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </div>
  );
}
