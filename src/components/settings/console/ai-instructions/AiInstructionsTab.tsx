'use client';

// The admin "AI instructions" board — the layered instruction stack that drives
// every AI feature. Four layer columns, ascending in authority left→right
// (1 Alsama · 2 academic · 3 subject · 4 tool). All instruction content — house
// style, pedagogy, language, safeguarding, tool restrictions — lives in these
// uploaded documents; the machine response contract stays in code and has no UI.
//
// Colour semantics: teal = tools/actions/chrome, red = destructive (Archive).
// Pink is the wordmark only (in the shell) and does not appear on this surface.

import { useRef, useState, useTransition, type ReactNode } from 'react';
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
import { UploadProgressBar } from '../upload';
import { fullDate, shortDate, filenameStem, findDoc } from './helpers';
import { useDocUpload, useFilePicker } from './useDocUpload';
import { DocumentPopup } from './DocumentPopup';
import { ArchiveConfirmDialog } from './ArchiveConfirmDialog';
import { ComposedPromptPreview } from './ComposedPromptPreview';

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
  const [previewOpen, setPreviewOpen] = useState(false);

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
        {/* Read-only: preview the fully composed system prompt each tool receives. */}
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="ml-auto rounded-[10px] border border-teal-tint-border bg-surface px-[14px] py-[10px] text-[13px] font-semibold text-teal transition-colors hover:bg-teal-tint"
        >
          {t('aiInstructions.preview.open')}
        </button>
        {/* Archived view is not drawn in the mockup — rendered as drawn but left
            inert (like the floor "Read"), pending a specified archived screen. */}
        <button
          type="button"
          title={t('aiInstructions.archivedTodo')}
          className="cursor-not-allowed rounded-[10px] border border-border-strong bg-surface px-[14px] py-[10px] text-[13px] font-semibold text-neutral-700 opacity-60"
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

      {/* A structural break marking the Page design section as a different kind of
          thing from the instruction board above — not a fifth layer of the stack. */}
      <hr className="my-[32px] border-t border-border-subtle" />

      {/* Page design — a full-width row below the four instruction columns. Not
          part of the instruction stack: the page design is printed page furniture
          (HTML), never composed into a prompt. */}
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

      {previewOpen ? (
        <ComposedPromptPreview
          subjects={board.subjects.map((s) => ({ subjectId: s.subjectId, name: s.name }))}
          onClose={() => setPreviewOpen(false)}
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
        <div
          dir="auto"
          title={doc.name}
          className="min-w-0 flex-1 text-[12.5px] font-semibold leading-[1.35] text-ink [overflow-wrap:anywhere] line-clamp-2"
        >
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
      {/* Stacked, not a shared row: inside the layer-4 column the row is too narrow
          to hold the select and the button side by side (the select collapsed to
          ~40px, rendering "Ch…"). Full-width select on its own line, button beneath. */}
      <div className="flex flex-col gap-[7px]">
        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          aria-label={t('aiInstructions.addForSubject.choose')}
          className="w-full min-w-0 truncate rounded-[9px] border border-teal-tint-border bg-surface px-[10px] py-[8px] text-[12px] text-ink"
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
          className="w-full rounded-[9px] border border-dashed border-teal-dashed bg-surface px-[12px] py-[8px] text-[12px] font-semibold text-teal transition-colors hover:bg-teal-tint disabled:opacity-50"
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

// ── Page design (full-width row below the columns) ─────────────────────────────

/**
 * Full-width "Page design" row. One cell per subject in a two-column grid that
 * collapses to a single column at ≤900px. Each cell shows the subject's page-design
 * state and one action: the built-in page + Upload, an uploaded filename + Replace,
 * an in-flight upload (filename + indeterminate bar + Cancel), or a rejection notice
 * + Choose file. Subject order is the board's (alphabetical), so a cell never changes
 * column when its state changes. Upload REPLACES (no history, preview, revert, or
 * confirm). The page design is printed page furniture, not an instruction: it never
 * reaches the AI composer.
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
  const count = subjects.length;
  return (
    <section className="mt-[16px] overflow-hidden rounded-[12px] border border-border">
      <h2 className="px-[16px] pt-[14px] pb-[5px] text-[14px] font-semibold text-ink">
        {t('aiInstructions.worksheetFrame.title')}
      </h2>
      <p dir="auto" className="px-[16px] pb-[13px] text-[12.5px] leading-[1.45] text-text-faint">
        {t('aiInstructions.worksheetFrame.lead')}
      </p>
      <div className="grid grid-cols-1 border-t border-border-subtle min-[901px]:grid-cols-2">
        {subjects.map((s, i) => (
          <FrameCard
            key={s.subjectId}
            subject={s}
            frame={frameBySubject.get(s.subjectId) ?? null}
            index={i}
            count={count}
          />
        ))}
      </div>
    </section>
  );
}

/** A card's ephemeral upload state. `idle` derives its look from the `frame` prop
 *  (uploaded vs built-in); `uploading`/`rejected`/`error` are local to the attempt. */
type FrameCardStatus =
  | { kind: 'idle' }
  | { kind: 'uploading'; filename: string }
  | { kind: 'rejected'; filename: string; missingMarker: boolean; scriptLines: number[] }
  | { kind: 'error'; message: string };

/**
 * One subject's page-design cell. Owns bespoke upload state (not the shared
 * `useDocUpload`) so it can drive an `AbortController` for Cancel and parse the
 * route's structured rejection ({@link FrameCardStatus}). `.html` only, posted to the
 * admin-gated upsert route; on success the server data is refreshed and the cell
 * settles back to the uploaded look.
 */
function FrameCard({
  subject,
  frame,
  index,
  count,
}: {
  subject: AiContextSubjectGroup;
  frame: AiContextFrameView | null;
  index: number;
  count: number;
}) {
  const t = useTranslations('settings');
  const locale = useLocale();
  const router = useRouter();
  const [status, setStatus] = useState<FrameCardStatus>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  async function startUpload(file: File) {
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: 'uploading', filename: file.name });
    const fd = new FormData();
    fd.set('file', file);
    fd.set('subject_id', subject.subjectId);
    try {
      const res = await fetch('/api/admin/worksheet-frame', {
        method: 'POST',
        body: fd,
        signal: controller.signal,
      });
      if (res.ok) {
        setStatus({ kind: 'idle' });
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { filename?: string; missingMarker?: boolean; scriptLines?: number[]; error?: string }
        | null;
      // A structured rejection carries the validation verdict; anything else (bad
      // type, too large, network) surfaces as a single error line.
      if (data && (typeof data.missingMarker === 'boolean' || Array.isArray(data.scriptLines))) {
        setStatus({
          kind: 'rejected',
          filename: data.filename ?? file.name,
          missingMarker: data.missingMarker ?? false,
          scriptLines: Array.isArray(data.scriptLines) ? data.scriptLines : [],
        });
      } else {
        setStatus({ kind: 'error', message: data?.error ?? t('aiInstructions.upload.failed') });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatus({ kind: 'idle' }); // Cancel: no error, back to the prior look.
        return;
      }
      setStatus({ kind: 'error', message: t('aiInstructions.upload.failed') });
    } finally {
      abortRef.current = null;
    }
  }

  const { input, open } = useFilePicker((file) => void startUpload(file), '.html,text/html');

  const uploading = status.kind === 'uploading' ? status : null;
  const rejected = status.kind === 'rejected' ? status : null;
  const genericError = status.kind === 'error' ? status.message : null;

  // Cell ground: warm notice when rejected, warm busy while uploading, else clear.
  const bg = rejected ? 'bg-frame-notice-surface' : uploading ? 'bg-surface-warm' : 'bg-transparent';

  // Dividers: a bottom rule between rows and a right rule between the two columns
  // (2-col only, left cells = even index). The last 2-col row drops its bottom rule at
  // ≥901px; the single last cell drops it at ≤900px. Correct for any subject count.
  const isLeftCol = index % 2 === 0;
  const inLastTwoColRow = index >= count - (count % 2 === 0 ? 2 : 1);
  const isLastCell = index === count - 1;
  const borders = [
    'border-b border-border-subtle',
    isLeftCol ? 'min-[901px]:border-r min-[901px]:border-border-subtle' : '',
    inLastTwoColRow ? 'min-[901px]:border-b-0' : '',
    isLastCell ? 'max-[900px]:border-b-0' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`px-[16px] pt-[12px] ${rejected ? 'pb-[14px]' : 'pb-[12px]'} ${bg} ${borders}`}>
      {input}
      <div className="flex items-center gap-[12px]">
        <span dir="auto" className="w-[116px] shrink-0 text-[13.5px] font-semibold text-ink">
          {subject.name}
        </span>

        {uploading ? (
          <div className="min-w-0 flex-1">
            <div dir="auto" className="truncate text-[12.5px] font-semibold text-ink">
              {uploading.filename}
            </div>
            <div
              className="relative mt-[8px] h-[6px] overflow-hidden rounded-[3px] bg-frame-bar-track"
              role="progressbar"
              aria-label={t('aiInstructions.worksheetFrame.progressLabel', {
                filename: uploading.filename,
              })}
            >
              <span className="curriculum-sync-bar" />
            </div>
          </div>
        ) : frame ? (
          <span
            dir="auto"
            title={frame.originalFilename ?? undefined}
            className="min-w-0 flex-1 truncate text-[12.5px] text-neutral-800"
          >
            {frame.originalFilename ?? t('aiInstructions.worksheetFrame.uploaded')}
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-faint">
            {t('aiInstructions.worksheetFrame.builtIn')}
          </span>
        )}

        {uploading ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="shrink-0 whitespace-nowrap px-[2px] py-[6px] text-[12px] font-medium text-neutral-700 transition-opacity hover:opacity-70"
          >
            {t('aiInstructions.worksheetFrame.cancel')}
          </button>
        ) : (
          <button
            type="button"
            onClick={open}
            className="shrink-0 whitespace-nowrap rounded-[8px] border border-teal-tint-border bg-white px-[11px] py-[6px] text-[12px] font-semibold text-teal transition-colors hover:bg-teal-tint"
          >
            {rejected
              ? t('aiInstructions.worksheetFrame.chooseFile')
              : frame
                ? t('aiInstructions.worksheetFrame.replace')
                : t('aiInstructions.worksheetFrame.upload')}
          </button>
        )}
      </div>

      {rejected ? (
        <FrameRejectionNotice
          filename={rejected.filename}
          missingMarker={rejected.missingMarker}
          scriptLines={rejected.scriptLines}
          locale={locale}
        />
      ) : null}
      {genericError ? <ErrorText>{genericError}</ErrorText> : null}
    </div>
  );
}

/** A small warning circle — the notice heading's icon (mockup's WarnIcon). */
function WarnIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      className="shrink-0 text-cream-ink-muted"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.4v.4" />
    </svg>
  );
}

/**
 * The rejection notice inside a cell: heading ("{file} was not saved") over a list
 * that names every reason at once — a missing `{{exercises}}` marker and/or the lines
 * that run code. The marker and `<script>` are rendered as inline code chips; the line
 * list is locale-formatted ("12 and 84" / "١٢ و٨٤").
 */
function FrameRejectionNotice({
  filename,
  missingMarker,
  scriptLines,
  locale,
}: {
  filename: string;
  missingMarker: boolean;
  scriptLines: number[];
  locale: string;
}) {
  const t = useTranslations('settings');
  const codeClass =
    'rounded-[4px] border border-frame-code-border bg-frame-code-surface px-[5px] py-[1px] font-mono text-[12px] text-cream-ink';
  const lines = new Intl.ListFormat(locale, { type: 'conjunction' }).format(
    scriptLines.map((n) => String(n)),
  );
  return (
    <div className="mt-[11px] rounded-[10px] border border-cream-border bg-cream px-[14px] py-[12px]">
      <div className="flex items-center gap-[9px] text-[13px] font-semibold text-cream-ink">
        <WarnIcon />
        <span dir="auto">
          {t('aiInstructions.worksheetFrame.notice.heading', { filename })}
        </span>
      </div>
      <ul className="mt-[10px] flex list-none flex-col gap-[9px] ps-[23px]">
        {missingMarker ? (
          <li
            dir="auto"
            className="text-[12.5px] leading-[1.55] text-frame-notice-ink [text-wrap:pretty]"
          >
            {t.rich('aiInstructions.worksheetFrame.notice.missingMarker', {
              code: () => <code className={codeClass}>{'{{exercises}}'}</code>,
            })}
          </li>
        ) : null}
        {scriptLines.length > 0 ? (
          <li
            dir="auto"
            className="text-[12.5px] leading-[1.55] text-frame-notice-ink [text-wrap:pretty]"
          >
            {t.rich('aiInstructions.worksheetFrame.notice.scriptLines', {
              code: () => <code className={codeClass}>{'<script>'}</code>,
              count: scriptLines.length,
              lines,
            })}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
