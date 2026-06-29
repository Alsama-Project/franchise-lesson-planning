// React-PDF documents for Alsama lesson plans.
//
// `LessonPlanPage` renders the body for ONE plan: a branded header (class, year,
// date), the SMARTT objective, and every lesson block in order with its
// name, teaching phase (I do / We do / You do), allotted minutes, and planned
// content. It reads only what `lesson_plans` carries today, and renders the
// reserved attachment/worksheet slots (see ./types) only when present, so those
// can be added later without touching this component.
//
// Two Document wrappers compose it:
//   • LessonPlanDocument       — a single plan (one page).
//   • WeekLessonPlansDocument  — many plans, one per page, for batch printing.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Document, Image, Page, Text, View } from '@react-pdf/renderer';
import { inSessionMinutes } from '@/lib/blocks';
import { formatLongDate } from '@/lib/week';
import { COLORS, phaseLabel, statusLabel, styles } from './theme';
import type { PdfAttachment, PlanPdfModel } from './types';

// react-pdf cannot render our SVG wordmark, so the brand mark uses the raster
// PNG. Read it once from the bundled public asset (traced via next.config) and
// reuse the bytes across every page. Node runtime only — these routes set it.
let brandLogoData: Buffer | undefined;
function brandLogoSrc(): { data: Buffer; format: 'png' } {
  brandLogoData ??= readFileSync(
    path.join(process.cwd(), 'public', 'brand', 'alsama-logo.png'),
  );
  return { data: brandLogoData, format: 'png' };
}

/** Logo + document descriptor, replacing the former "Alsama · …" text line. */
function BrandLine({ label }: { label: string }) {
  return (
    <View style={styles.brandRow}>
      {/* react-pdf's <Image> is a PDF primitive, not an HTML <img> — no alt prop. */}
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image src={brandLogoSrc()} style={styles.brandLogo} />
      <Text style={styles.brandLabel}>{label}</Text>
    </View>
  );
}

function classHeadline(c: PlanPdfModel['classContext']): string {
  return `Year ${c.year}`;
}

function Header({ model }: { model: PlanPdfModel }) {
  const { classContext: c, plan, curriculum } = model;
  const context = [c.schoolName, c.subjectName].filter(Boolean).join(' · ');

  return (
    <View style={styles.header}>
      <BrandLine label="Lesson Plan" />
      <Text style={styles.classTitle}>{classHeadline(c)}</Text>
      <View style={styles.metaRow}>
        {plan.lesson_date ? (
          <Text style={styles.metaItem}>
            <Text style={styles.metaStrong}>Date: </Text>
            {formatLongDate(plan.lesson_date)}
          </Text>
        ) : null}
        {plan.period != null && (
          <Text style={styles.metaItem}>
            <Text style={styles.metaStrong}>Period: </Text>
            {plan.period}
          </Text>
        )}
        {context !== '' && <Text style={styles.metaItem}>{context}</Text>}
        {curriculum?.focusArea ? (
          <Text style={styles.metaItem}>
            <Text style={styles.metaStrong}>Focus: </Text>
            {curriculum.focusArea}
          </Text>
        ) : null}
      </View>
      <Text style={styles.statusPill}>{statusLabel(plan.status)}</Text>
    </View>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>{heading}</Text>
      {children}
    </View>
  );
}

function ObjectiveSection({ model }: { model: PlanPdfModel }) {
  const objective = model.plan.smartt_objective?.trim();
  const dailyLO = model.curriculum?.dailyLO?.trim();
  return (
    <Section heading="SMARTT Objective">
      <View style={styles.objectiveBox}>
        {objective ? (
          <Text style={styles.objectiveText}>{objective}</Text>
        ) : (
          <Text style={styles.empty}>No objective written yet.</Text>
        )}
      </View>
      {dailyLO ? (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Daily LO</Text>
          <Text style={styles.detailValue}>{dailyLO}</Text>
        </View>
      ) : null}
    </Section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const text = value.trim();
  if (text === '') return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{text}</Text>
    </View>
  );
}

function BlockRow({
  block,
  linkIt,
  previousDailyLO = '',
}: {
  block: PlanPdfModel['plan']['blocks'][number];
  linkIt?: PlanPdfModel['linkIt'];
  /** Previous lesson's daily outcome — rendered as a cream panel above the recap. */
  previousDailyLO?: string;
}) {
  const phase = phaseLabel(block.phase);

  // cfu / exit_ticket and recap use the "Link it together" model, not the legacy
  // single-select fields. Render the resolved techniques (label — note) / recap text.
  const isTechnique = block.type === 'cfu' || block.type === 'exit_ticket';
  const techniques =
    block.type === 'cfu' ? linkIt?.cfu ?? [] : block.type === 'exit_ticket' ? linkIt?.exitTicket ?? [] : [];
  const recapText = block.type === 'recap' ? (linkIt?.recap ?? '').trim() : '';

  const hasDetail = isTechnique
    ? techniques.length > 0
    : block.type === 'recap'
      ? recapText !== ''
      : block.activity_title.trim() !== '' ||
        block.teacher_does.trim() !== '' ||
        block.students_do.trim() !== '' ||
        block.resources.trim() !== '';

  return (
    <View style={styles.block} wrap={false}>
      <View style={styles.blockHead}>
        {phase ? <Text style={styles.phaseTag}>{phase}</Text> : null}
        <Text style={styles.blockTitle}>{block.title}</Text>
        <Text style={styles.minutes}>{block.duration_minutes} min</Text>
      </View>
      {isTechnique ? (
        techniques.map((t, i) => (
          <Text key={i} style={styles.activityTitle}>
            {t.label}
            {t.note.trim() !== '' ? ` — ${t.note}` : ''}
          </Text>
        ))
      ) : block.type === 'recap' ? (
        <>
          {previousDailyLO.trim() !== '' ? (
            <View style={styles.recapPrevPanel}>
              <Text style={styles.recapPrevLabel}>Yesterday&apos;s learning outcome</Text>
              <Text style={styles.recapPrevValue}>{previousDailyLO.trim()}</Text>
            </View>
          ) : null}
          {recapText !== '' ? <Text style={styles.detailValue}>{recapText}</Text> : null}
        </>
      ) : (
        <>
          {block.activity_title.trim() !== '' ? (
            <Text style={styles.activityTitle}>{block.activity_title}</Text>
          ) : null}
          <Detail label="Teacher" value={block.teacher_does} />
          <Detail label="Students" value={block.students_do} />
          <Detail label="Materials" value={block.resources} />
        </>
      )}
      {!hasDetail ? <Text style={styles.empty}>Not planned yet.</Text> : null}
    </View>
  );
}

function AttachmentList({
  heading,
  items,
}: {
  heading: string;
  items: PdfAttachment[];
}) {
  if (items.length === 0) return null;
  return (
    <Section heading={heading}>
      {items.map((item, i) => (
        <View key={i} style={styles.detailRow}>
          <Text style={styles.detailValue}>
            <Text style={styles.metaStrong}>{item.label}</Text>
            {item.detail ? ` — ${item.detail}` : ''}
          </Text>
        </View>
      ))}
    </Section>
  );
}

/** The printable body for a single plan; reused by both Document wrappers. */
function LessonPlanPage({
  model,
  sectionLabel,
}: {
  model: PlanPdfModel;
  /** Optional band above the header (the weekly export's unscheduled section). */
  sectionLabel?: string;
}) {
  const total = inSessionMinutes(model.plan.blocks);

  return (
    <Page size="A4" style={styles.page} wrap>
      {sectionLabel ? (
        <View style={styles.sectionBand}>
          <Text style={styles.sectionBandText}>{sectionLabel}</Text>
        </View>
      ) : null}
      <Header model={model} />
      <ObjectiveSection model={model} />

      <View style={styles.section}>
        <Text style={styles.blocksHeading}>Lesson Blocks</Text>
        {model.plan.blocks.map((block, i) => (
          <BlockRow
            key={`${block.type}-${i}`}
            block={block}
            linkIt={model.linkIt}
            previousDailyLO={model.curriculum?.previousDailyLO ?? ''}
          />
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalText}>In-session total: {total} min</Text>
        </View>
      </View>

      {model.attachments && model.attachments.length > 0 ? (
        <AttachmentList heading="Resources & Materials" items={model.attachments} />
      ) : null}
      {model.worksheet ? (
        <AttachmentList heading="Worksheet" items={[model.worksheet]} />
      ) : null}

      <View style={styles.footer} fixed>
        <Text>
          {classHeadline(model.classContext)}
          {model.plan.lesson_date ? ` · ${formatLongDate(model.plan.lesson_date)}` : ''}
        </Text>
        <Text
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
        />
      </View>
    </Page>
  );
}

/** A single lesson plan as a one-page PDF document. */
export function LessonPlanDocument({ model }: { model: PlanPdfModel }) {
  const title = `Lesson Plan — ${classHeadline(model.classContext)}${
    model.plan.lesson_date ? ` — ${model.plan.lesson_date}` : ''
  }`;
  return (
    <Document title={title} author="Alsama" subject="Lesson plan">
      <LessonPlanPage model={model} />
    </Document>
  );
}

/**
 * Order scheduled plans for printing: by day column (Mon→Fri), then by the
 * stored day-ordinal within that column. Only called on plans with a `weekday`.
 */
function byWeekdayPeriod(a: PlanPdfModel, b: PlanPdfModel): number {
  const wa = a.plan.weekday ?? 0;
  const wb = b.plan.weekday ?? 0;
  if (wa !== wb) return wa - wb;
  const pa = a.plan.period ?? 0;
  const pb = b.plan.period ?? 0;
  if (pa !== pb) return pa - pb;
  return a.plan.id.localeCompare(b.plan.id);
}

const UNSCHEDULED_SECTION_LABEL = 'Centre-wide / unscheduled';

/**
 * Every plan visible at a board coordinate, one page per plan, for batch printing
 * a subject's week. Plans carrying a `weekday` are placed in day order
 * (weekday → period); plans with no `weekday` (centre-wide / dateless) are
 * appended as a clearly-marked unscheduled section. Nothing is dropped.
 */
export function WeekLessonPlansDocument({
  models,
  weekLabel,
  subjectLabel,
}: {
  models: PlanPdfModel[];
  weekLabel: string;
  /** The subject-space label shown in the header / title (e.g. "English"). */
  subjectLabel?: string;
}) {
  const heading = [subjectLabel, weekLabel].filter(Boolean).join(' · ');
  const title = `Lesson Plans${heading ? ` — ${heading}` : ''}`;

  if (models.length === 0) {
    return (
      <Document title={title} author="Alsama" subject="Lesson plans">
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <BrandLine label="Lesson Plans" />
            {subjectLabel ? <Text style={styles.classTitle}>{subjectLabel}</Text> : null}
            <Text style={[styles.metaItem, { marginTop: 2 }]}>{weekLabel}</Text>
          </View>
          <Text style={[styles.empty, { color: COLORS.muted }]}>
            No lesson plans found for this week.
          </Text>
        </Page>
      </Document>
    );
  }

  // Scheduled plans (a real day column) first, in day order; the rest — centre-
  // wide or dateless plans with no `weekday` — appended as the unscheduled section.
  const scheduled = models.filter((m) => m.plan.weekday != null).sort(byWeekdayPeriod);
  const unscheduled = models.filter((m) => m.plan.weekday == null);

  return (
    <Document title={title} author="Alsama" subject="Lesson plans">
      {scheduled.map((model) => (
        <LessonPlanPage key={model.plan.id} model={model} />
      ))}
      {unscheduled.map((model) => (
        // Every unscheduled page carries the section band, so the section reads
        // correctly however the PDF is later split or reordered.
        <LessonPlanPage
          key={model.plan.id}
          model={model}
          sectionLabel={UNSCHEDULED_SECTION_LABEL}
        />
      ))}
    </Document>
  );
}
