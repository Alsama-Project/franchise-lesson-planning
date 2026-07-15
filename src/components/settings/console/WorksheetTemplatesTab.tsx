'use client';

// Settings ▸ Worksheet Templates. Lists every subject the caller may configure
// (admins: all; coordinators: their own subjects) with each subject's master-template
// status, and a teal "Edit template" action that opens Template Mode. Follows the
// existing console tab pattern (SectionCard + ConsoleTable + shared ui primitives) —
// there is NO left-hand sub-nav; the mockup's Screen A sidebar does not exist here.

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { WorksheetTemplateRow } from '@/lib/console';
import { SectionCard, ConsoleTable, Th, Td, EmptyState } from './ui';

/** A tiny schematic A4 preview of a subject's template — filled when configured,
 *  an empty dashed page when using the default. Purely decorative (aria-hidden). */
function MiniA4({ configured }: { configured: boolean }) {
  return (
    <svg width="34" height="46" viewBox="0 0 34 46" aria-hidden className="shrink-0">
      <rect
        x="1"
        y="1"
        width="32"
        height="44"
        rx="3"
        fill="#fff"
        stroke={configured ? '#CBBFB0' : '#D8CFC2'}
        strokeWidth="1.4"
        strokeDasharray={configured ? undefined : '3 2.4'}
      />
      {configured ? (
        <>
          <rect x="4" y="5" width="26" height="7" rx="2" fill="#B62A5C" opacity="0.14" />
          <rect x="5" y="17" width="24" height="2.4" rx="1.2" fill="#1F7A6C" opacity="0.5" />
          <rect x="5" y="23" width="24" height="6" rx="1.5" fill="#E4F0ED" stroke="#CFE6E0" strokeWidth="0.8" />
          <rect x="5" y="33" width="17" height="2.4" rx="1.2" fill="#D8CFC2" />
          <rect x="5" y="38" width="24" height="2.4" rx="1.2" fill="#D8CFC2" />
        </>
      ) : null}
    </svg>
  );
}

function StatusChip({ configured, label }: { configured: boolean; label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-[10px] py-[3px] text-[11.5px] font-semibold"
      style={configured ? { background: '#E4F0ED', color: '#186155' } : { background: '#F3ECE2', color: '#7A7068' }}
    >
      {label}
    </span>
  );
}

export function WorksheetTemplatesTab({ templates }: { templates: WorksheetTemplateRow[] }) {
  const t = useTranslations('settings');
  const locale = useLocale();
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <SectionCard title={t('worksheetTemplates.title')}>
      {templates.length === 0 ? (
        <EmptyState>{t('worksheetTemplates.noSubjects')}</EmptyState>
      ) : (
        <ConsoleTable
          head={
            <tr>
              <Th>{t('worksheetTemplates.columns.subject')}</Th>
              <Th>{t('worksheetTemplates.columns.template')}</Th>
              <Th>{t('worksheetTemplates.columns.status')}</Th>
              <Th>{t('worksheetTemplates.columns.lastEdited')}</Th>
              <Th className="text-end">{t('worksheetTemplates.columns.actions')}</Th>
            </tr>
          }
        >
          {templates.map((row) => (
            <tr key={row.subjectId}>
              <Td dir="auto">
                <span className="font-semibold text-[#2A2422]">{row.name}</span>
              </Td>
              <Td>
                <MiniA4 configured={row.configured} />
              </Td>
              <Td>
                <StatusChip
                  configured={row.configured}
                  label={row.configured ? t('worksheetTemplates.status.configured') : t('worksheetTemplates.status.default')}
                />
              </Td>
              <Td dir="auto">
                {row.configured && row.updatedAt ? (
                  <span className="text-[#7A7068]">
                    {row.updatedByName
                      ? t('worksheetTemplates.editedByOn', { name: row.updatedByName, date: fmtDate(row.updatedAt) })
                      : fmtDate(row.updatedAt)}
                  </span>
                ) : (
                  <span className="text-[#A79E94]">{t('worksheetTemplates.emptyRow')}</span>
                )}
              </Td>
              <Td className="text-end">
                <Link
                  href={`/settings/worksheet-templates/${row.subjectId}`}
                  className="text-[12.5px] font-semibold text-[#186155] transition-opacity hover:opacity-70"
                >
                  {row.configured
                    ? t('worksheetTemplates.editAction')
                    : t('worksheetTemplates.setupAction')}
                </Link>
              </Td>
            </tr>
          ))}
        </ConsoleTable>
      )}
    </SectionCard>
  );
}
