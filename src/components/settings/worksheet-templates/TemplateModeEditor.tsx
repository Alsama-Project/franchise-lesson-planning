'use client';

// Template Mode chrome: the teal banner + context bar wrapped around the SAME v3
// worksheet editor (in `templateMode`). It autosaves to `worksheet_template.body`
// via `saveWorksheetTemplate` — never a `lesson_plans` row — and "Publish master"
// flushes an immediate save. There is NO resource rail here (DocumentWorksheet never
// renders one); the dashed editable regions + the mode surface come from globals.css.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { WorksheetV3 } from '@/types/lesson';
import type { TagsByDimension } from '@/types/resource';
import type { WorksheetContext } from '@/components/editor/worksheet/context';
import { DocumentWorksheet, type SaveState } from '@/components/editor/worksheet/doc/DocumentWorksheet';
import { saveWorksheetTemplate } from '@/lib/actions/worksheet-template';

const AUTOSAVE_DELAY_MS = 1000;

export function TemplateModeEditor({
  subjectId,
  subjectName,
  initialBody,
  context,
  vocabulary,
}: {
  subjectId: string;
  subjectName: string;
  initialBody: unknown;
  context: WorksheetContext;
  vocabulary: TagsByDimension;
}) {
  const t = useTranslations('settings');
  const [worksheet, setWorksheet] = useState<unknown>(initialBody);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const firstRender = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced autosave to worksheet_template.body — same cadence as the lesson
  // worksheet's autosave, but the write target is the template, not a plan.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await saveWorksheetTemplate(subjectId, worksheet);
      setSaveState(res.ok ? 'saved' : 'error');
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [worksheet, subjectId]);

  const publishNow = async () => {
    if (timer.current) clearTimeout(timer.current);
    setSaveState('saving');
    const res = await saveWorksheetTemplate(subjectId, worksheet);
    setSaveState(res.ok ? 'saved' : 'error');
  };

  const saveLabel =
    saveState === 'saving'
      ? t('common.save')
      : saveState === 'saved'
        ? t('worksheetTemplates.status.configured')
        : saveState === 'error'
          ? t('common.somethingWrong')
          : '';

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 132px)' }}>
      {/* Banner — teal, full width */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-t-[14px] bg-[#1F7A6C] px-[18px] py-[12px] text-white">
        <span className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.08em]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <path d="M8 8h8M8 12h8M8 16h5" />
          </svg>
          {t('worksheetTemplates.mode.label')}
        </span>
        <span dir="auto" className="min-w-0 flex-1 text-[13px] text-white/90">
          {t('worksheetTemplates.mode.editingMaster', { subject: subjectName })}
        </span>
        <span className="inline-flex items-center gap-2 text-[12px] text-white/85">
          <span className="inline-block h-[14px] w-[22px] rounded-[3px] border border-dashed border-white/80" aria-hidden />
          {t('worksheetTemplates.mode.legendDashed')}
        </span>
        <Link
          href="/settings"
          className="rounded-[8px] bg-white/15 px-[12px] py-[6px] text-[12.5px] font-semibold text-white transition-colors hover:bg-white/25"
        >
          {t('worksheetTemplates.mode.exit')}
        </Link>
      </div>

      {/* Context bar — breadcrumb · autosave · Publish master */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-x border-b border-[#DCD2C4] bg-white px-[18px] py-[10px]">
        <nav dir="auto" className="flex min-w-0 flex-1 items-center gap-[6px] text-[12.5px] text-[#7A7068]">
          <Link href="/settings" className="hover:text-[#186155]">
            {t('title')}
          </Link>
          <span aria-hidden>/</span>
          <Link href="/settings" className="hover:text-[#186155]">
            {t('worksheetTemplates.title')}
          </Link>
          <span aria-hidden>/</span>
          <span className="font-semibold text-[#2A2422]">
            {t('worksheetTemplates.mode.breadcrumbMaster', { subject: subjectName })}
          </span>
        </nav>
        {saveLabel ? (
          <span className={saveState === 'error' ? 'text-[12px] text-[#B23A2E]' : 'text-[12px] text-[#A79E94]'}>
            {saveLabel}
          </span>
        ) : null}
        <button
          type="button"
          onClick={publishNow}
          disabled={saveState === 'saving'}
          className="rounded-[9px] bg-[#1F7A6C] px-[15px] py-[7px] text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1a6a5d] disabled:opacity-50"
        >
          {t('worksheetTemplates.mode.publish')}
        </button>
      </div>

      {/* The editor — Template Mode (no rail, dashed regions, autosave to template) */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-b-[14px] border-x border-b border-[#DCD2C4] bg-white">
        <DocumentWorksheet
          value={worksheet}
          onChange={(ws: WorksheetV3) => setWorksheet(ws)}
          context={context}
          vocabulary={vocabulary}
          saveState={saveState}
          templateMode
        />
      </div>
    </div>
  );
}
