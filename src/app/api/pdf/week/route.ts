// GET /api/pdf/week?subject=<code>&subjectName=<label>&years=2,3&month=March&week=2&weekNo=12
//
// Every plan visible at a board coordinate — one subject space, one curriculum
// week — one plan per page, as a single inline PDF for batch printing. This
// mirrors what the planning board shows right now: selection runs through the
// board's shared `(subject space · years · month · week) → curriculum_lesson
// keys → WHERE curriculum_lesson_id IN (...)` path (RLS scopes class/centre/org
// visibility; there is no class or date filter). Needs the Node runtime for
// react-pdf and per-request rendering.

import { createElement } from 'react';
import { createClient } from '@/lib/supabase/server';
import { WeekLessonPlansDocument } from '@/lib/pdf/LessonPlanDocument';
import { loadWeekPdfModels } from '@/lib/pdf/load';
import { pdfResponse } from '@/lib/pdf/render';
import { resolveTermWeek } from '@/lib/term-week';
import { getActiveSpace } from '@/lib/active-space';
import { formatWeekRange } from '@/lib/week';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Parse a "2,3,4" year list to distinct, sorted year numbers (0–6). */
function parseYears(raw: string | null): number[] {
  if (!raw) return [];
  const years = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return [...new Set(years)].sort((a, b) => a - b);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subjectCode = searchParams.get('subject');
  const subjectName = searchParams.get('subjectName') ?? '';
  const month = searchParams.get('month');
  const week = Number(searchParams.get('week'));
  const weekNo = Number(searchParams.get('weekNo'));
  const years = parseYears(searchParams.get('years'));

  if (!subjectCode) {
    return new Response('Missing required query param: subject', { status: 400 });
  }
  if (!month) {
    return new Response('Missing required query param: month', { status: 400 });
  }
  if (!Number.isInteger(week) || week < 1) {
    return new Response('Missing or invalid query param: week', { status: 400 });
  }

  const models = await loadWeekPdfModels({ subjectCode, years, month, week });

  // Reuse the board's date resolution: the teaching-week number maps to a real
  // Monday via `term_week`, scoped (as the board is) to the viewer's active centre
  // and the requested years. When no term covers that (centre, year, week) — or the
  // viewer has no active centre — fall back to the curriculum coordinate label so
  // the header is never blank.
  const coordinateLabel = `${month} · Week ${week}`;
  let weekLabel = coordinateLabel;
  if (Number.isInteger(weekNo) && weekNo > 0) {
    const supabase = await createClient();
    const activeSpace = await getActiveSpace();
    const { mondayDate } = await resolveTermWeek(supabase, activeSpace?.schoolId ?? null, years, weekNo);
    weekLabel = mondayDate ? formatWeekRange(mondayDate) : `Week ${weekNo} · ${coordinateLabel}`;
  }

  const filenameStem = `${subjectCode}-${month}-w${week}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return pdfResponse(
    createElement(WeekLessonPlansDocument, { models, weekLabel, subjectLabel: subjectName }),
    `lesson-plans-${filenameStem}.pdf`,
  );
}
