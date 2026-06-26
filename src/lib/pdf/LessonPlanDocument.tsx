// React-PDF documents for Alsama lesson plans.
//
// `LessonPlanPage` renders the body for ONE plan: a branded header (class, year,
// date), the locked curriculum target (cream "given" panel), the SMARTT objective
// (pink "mine" box, stem muted + remainder), the inline lesson blocks in order
// (each with phase, editable minutes, and planned content), and the grouped
// "Link it together" strips (Recap — with the previous lesson's outcome — / Check
// for understanding / Exit ticket). Colour zoning mirrors the editor: cream =
// locked/curriculum-provided, pink = teacher-editable. It reads only what
// `lesson_plans` carries today, and renders the reserved attachment/worksheet
// slots (see ./types) only when present, so those can be added later without
// touching this component.
//
// Two Document wrappers compose it:
//   • LessonPlanDocument       — a single plan (one page).
//   • WeekLessonPlansDocument  — many plans, one per page, for batch printing.

import { Document, Page, Text, View } from '@react-pdf/renderer';
import { blockMinutes, inSessionMinutes } from '@/lib/blocks';
import { OBJECTIVE_STEM, stripStem } from '@/lib/editor/objective';
import { formatLongDate } from '@/lib/week';
import type { LessonBlockType } from '@/types/lesson';
import { COLORS, phaseLabel, statusLabel, styles } from './theme';
import type { PdfAttachment, PdfLinkIt, PlanPdfModel } from './types';

/**
 * Block types whose content lives in the "Link it together" section, not the
 * inline Lesson Blocks list. They are skipped in the block loop and rendered as
 * the three grouped strips (Recap / Check for understanding / Exit ticket),
 * mirroring the editor's Link-it step.
 */
const LINK_IT_TYPES = new Set<LessonBlockType>(['recap', 'cfu', 'exit_ticket']);

/** The empty Link-it shape, for the rare model that arrives without one. */
const EMPTY_LINK_IT: PdfLinkIt = { recap: '', cfu: [], exitTicket: [] };

function classHeadline(c: PlanPdfModel['classContext']): string {
  return `Year ${c.year}`;
}

function Header({ model }: { model: PlanPdfModel }) {
  const { classContext: c, plan, curriculum } = model;
  const context = [c.schoolName, c.subjectName].filter(Boolean).join(' · ');

  return (
    <View style={styles.header}>
      <Text style={styles.brand}>Alsama · Lesson Plan</Text>
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

/** The locked curriculum target — a cream ("given") panel, as on the editor. */
function CurriculumSection({ model }: { model: PlanPdfModel }) {
  const dailyLO = model.curriculum?.dailyLO?.trim();
  if (!dailyLO) return null;
  return (
    <View style={styles.givenPanel}>
      <Text style={styles.givenLabel}>Daily outcome</Text>
      <Text style={styles.givenValue}>{dailyLO}</Text>
    </View>
  );
}

/**
 * The SMARTT objective in its pink (teacher-editable) box, with the baked-in
 * opening stem muted and the teacher's remainder in ink — mirroring the on-screen
 * ObjectiveBanner. The stem/strip helpers are shared with the editor so the PDF
 * can never drift from how the objective is stored and composed.
 */
function ObjectiveSection({ model }: { model: PlanPdfModel }) {
  const remainder = stripStem(model.plan.smartt_objective);
  return (
    <Section heading="SMARTT objective">
      <View style={styles.objectiveBox}>
        {remainder ? (
          <Text style={styles.objectiveText}>
            <Text style={styles.objectiveStem}>{OBJECTIVE_STEM} </Text>
            {remainder}
          </Text>
        ) : (
          <Text style={styles.empty}>No objective written yet.</Text>
        )}
      </View>
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

/** One inline lesson block (the Link-it block types are rendered separately). */
function BlockRow({ block }: { block: PlanPdfModel['plan']['blocks'][number] }) {
  const phase = phaseLabel(block.phase);

  const hasDetail =
    block.activity_title.trim() !== '' ||
    block.teacher_does.trim() !== '' ||
    block.students_do.trim() !== '' ||
    block.resources.trim() !== '';

  return (
    <View style={styles.block} wrap={false}>
      <View style={styles.blockHead}>
        {phase ? <Text style={styles.phaseTag}>{phase}</Text> : null}
        <Text style={styles.blockTitle}>{block.title}</Text>
        {/* Honour the teacher's editable per-block minutes (falls back to the
            format default), matching the on-screen read-only view. */}
        <Text style={styles.minutes}>{blockMinutes(block)} min</Text>
      </View>
      {block.activity_title.trim() !== '' ? (
        <Text style={styles.activityTitle}>{block.activity_title}</Text>
      ) : null}
      <Detail label="Teacher" value={block.teacher_does} />
      <Detail label="Students" value={block.students_do} />
      <Detail label="Materials" value={block.resources} />
      {!hasDetail ? <Text style={styles.empty}>Not planned yet.</Text> : null}
    </View>
  );
}

/** One "Link it together" strip: a sub-heading over its content. */
function Strip({
  heading,
  first,
  children,
}: {
  heading: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={first ? [styles.strip, styles.stripFirst] : styles.strip}>
      <Text style={styles.stripHeading}>{heading}</Text>
      {children}
    </View>
  );
}

/** Resolved technique rows (label — note) for the cfu / exit-ticket strips. */
function TechniqueList({ items }: { items: { label: string; note: string }[] }) {
  if (items.length === 0) return <Text style={styles.empty}>Not planned yet.</Text>;
  return (
    <>
      {items.map((t, i) => (
        <Text key={i} style={[styles.activityTitle, styles.techniqueRow]}>
          {t.label}
          {t.note.trim() !== '' ? ` — ${t.note}` : ''}
        </Text>
      ))}
    </>
  );
}

/**
 * The grouped "Link it together" section: three strips (Recap / Check for
 * understanding / Exit ticket), driven by the shared `normalizeLinkIt` output.
 * The Recap strip carries the previous lesson's daily outcome in a cream ("given")
 * panel above the teacher's (pink) recap text, exactly as the editor lays it out.
 */
function LinkItSection({
  linkIt,
  previousDailyLO,
}: {
  linkIt: PdfLinkIt;
  previousDailyLO: string;
}) {
  const recap = linkIt.recap.trim();
  const previous = previousDailyLO.trim();

  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.blocksHeading}>Link it together</Text>
      <View style={styles.linkItCard}>
        <Strip heading="Recap" first>
          {previous ? (
            <View style={styles.givenPanel}>
              <Text style={styles.givenLabel}>Yesterday&apos;s learning outcome</Text>
              <Text style={styles.givenValue}>{previous}</Text>
            </View>
          ) : null}
          {recap ? (
            <View style={styles.recapBox}>
              <Text style={styles.objectiveText}>{recap}</Text>
            </View>
          ) : (
            <Text style={styles.empty}>Not planned yet.</Text>
          )}
        </Strip>
        <Strip heading="Check for understanding">
          <TechniqueList items={linkIt.cfu} />
        </Strip>
        <Strip heading="Exit ticket">
          <TechniqueList items={linkIt.exitTicket} />
        </Strip>
      </View>
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
function LessonPlanPage({ model }: { model: PlanPdfModel }) {
  const total = inSessionMinutes(model.plan.blocks);

  return (
    <Page size="A4" style={styles.page} wrap>
      <Header model={model} />
      <CurriculumSection model={model} />
      <ObjectiveSection model={model} />

      <View style={styles.section}>
        <Text style={styles.blocksHeading}>Lesson Blocks</Text>
        {model.plan.blocks
          .filter((block) => !LINK_IT_TYPES.has(block.type))
          .map((block, i) => (
            <BlockRow key={`${block.type}-${i}`} block={block} />
          ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalText}>In-session total: {total} min</Text>
        </View>
      </View>

      <LinkItSection
        linkIt={model.linkIt ?? EMPTY_LINK_IT}
        previousDailyLO={model.curriculum?.previousDailyLO ?? ''}
      />

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

/** Many lesson plans, one per page, for batch printing a class's week. */
export function WeekLessonPlansDocument({
  models,
  weekLabel,
}: {
  models: PlanPdfModel[];
  weekLabel: string;
}) {
  const className = models[0] ? classHeadline(models[0].classContext) : 'Class';
  const title = `Lesson Plans — ${className} — ${weekLabel}`;

  if (models.length === 0) {
    return (
      <Document title={title} author="Alsama" subject="Lesson plans">
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.brand}>Alsama · Lesson Plans</Text>
            <Text style={styles.classTitle}>{weekLabel}</Text>
          </View>
          <Text style={[styles.empty, { color: COLORS.muted }]}>
            No lesson plans found for this class in the selected week.
          </Text>
        </Page>
      </Document>
    );
  }

  return (
    <Document title={title} author="Alsama" subject="Lesson plans">
      {models.map((model) => (
        <LessonPlanPage key={model.plan.id} model={model} />
      ))}
    </Document>
  );
}
