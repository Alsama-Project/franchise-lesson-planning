// Pure worksheet COMPOSITION — the eleven composition rules, implemented as a
// dependency-free function over an exercise's declared `items[]`. The model declares
// WHAT each item is (`WorksheetItem`); this module decides HOW it sits, by reading the
// item shape and applying the FIRST matching rule. It replaces the old detector
// approach (`layoutExercisePictures`), which pattern-matched the model's markdown to
// GUESS a layout and failed four times in a fortnight.
//
// It is intentionally NOT `server-only` and imports nothing privileged: it takes the
// prepared inputs (items, passage, year band, resolved image slots) and returns
// top-level tiptap nodes. `compileWorksheet` and the per-exercise splice both compose
// it; unit tests import it directly.
//
// The millimetre numbers and the year-band table come straight from Claude Design's
// `CompositionRules.jsx` — they are decisions, not suggestions. Every mm is converted
// to a layout px against the fixed A4 page (96 dpi), the same width the editor and
// print share, because compile has no DOM to measure.

import type { ImageSlot } from '@/types/worksheet-exercise';
import type { WorksheetItem } from '@/types/worksheet-exercise';

// ── Geometry ─────────────────────────────────────────────────────────────────

/** Layout px per millimetre at 96 dpi (25.4 mm/in). The spec is in mm; the page is a
 *  fixed pixel width, so every mm decision resolves through this. */
export const PX_PER_MM = 96 / 25.4;

/** One mm as a rounded layout px. */
export function mm(value: number): number {
  return Math.round(value * PX_PER_MM);
}

/** The three year bands the rules are parameterised by. */
export type YearBand = 'y0_1' | 'y2_3' | 'y4_6';

/** The year-band numbers, verbatim from `CompositionRules.jsx` (mm → px here). */
export interface BandNumbers {
  /** Rule 1: cards across a grid row. */
  gridAcross: number;
  /** Rule 1: a grid picture's width in px. */
  gridPicPx: number;
  /** Rule 2 / 11: a row picture's width in px. */
  rowPicPx: number;
  /** Rules 4-11: a ruled writing line's pitch (height) in px. */
  ruledPitchPx: number;
  /** Rule 10 / 8: rows a side (the target item count; compile drops the overspill). */
  rowsPerSide: number;
  /** Rule 4: group columns before wrapping to a second row of columns. */
  groupCols: number;
}

const BANDS: Record<YearBand, BandNumbers> = {
  // Year 0-1: 3 across · 40 mm grid; 35 mm row picture; 10 mm ruled pitch; 6 rows; 2-3 cols.
  y0_1: { gridAcross: 3, gridPicPx: mm(40), rowPicPx: mm(35), ruledPitchPx: mm(10), rowsPerSide: 6, groupCols: 3 },
  // Year 2-3: 4 across · 26 mm; 26 mm row picture; 8 mm; 8 rows; 3 cols.
  y2_3: { gridAcross: 4, gridPicPx: mm(26), rowPicPx: mm(26), ruledPitchPx: mm(8), rowsPerSide: 8, groupCols: 3 },
  // Year 4-6: 5 across · 20 mm; 20 mm row picture; 8 mm; 10 rows; 3 cols.
  y4_6: { gridAcross: 5, gridPicPx: mm(20), rowPicPx: mm(20), ruledPitchPx: mm(8), rowsPerSide: 10, groupCols: 3 },
};

/**
 * The year band for a class year (0-6). A centre-scoped plan has no class year
 * (null) — it falls to the MIDDLE band, not the lowest: a Year 5 sheet rendered at
 * Year 0 proportions looks patronising, and the reverse is unusable, so the middle
 * fails least badly in both directions.
 */
export function yearBandForYear(year: number | null | undefined): YearBand {
  if (year == null || !Number.isFinite(year)) return 'y2_3';
  if (year <= 1) return 'y0_1';
  if (year <= 3) return 'y2_3';
  return 'y4_6';
}

/** The band numbers for a year band. */
export function bandNumbers(band: YearBand): BandNumbers {
  return BANDS[band];
}

/** A shared scene is a fixed 114 mm square, centred — band-independent. */
const SCENE_PX = mm(114);
/** The empty middle drawing column of a matching table (rule 3). */
const MATCH_GAP_PX = mm(60);
/** The fixed speaker-name column of a dialogue (rule 5). */
const SPEAKER_COL_PX = mm(34);
/** The minimum width of an inline blank inside a sentence (rules 1, 10). */
const INLINE_BLANK_PX = mm(40);
/** A passage's supporting picture beside the first paragraph, from Year 2 (rule 8). */
const PASSAGE_SIDE_PIC_PX = mm(47);
/** A passage's supporting picture as a band above the text, at Year 0-1 (rule 8). */
const PASSAGE_BAND_PIC_PX = mm(150);

/** Ruled writing lines emitted for a rule-6 prompt when the model omits `lines`. Two
 *  lines per expected sentence plus one, assuming one sentence — a usable frame that a
 *  model which forgets the field still lands on. */
export const DEFAULT_WRITING_LINES = 3;

/** Matching pairs beyond this split into a second table (rule 3). */
const MATCH_MAX_PER_TABLE = 8;

// ── Small node builders ──────────────────────────────────────────────────────

type Node = Record<string, unknown>;

const textNode = (t: string): Node => ({ type: 'text', text: t });

function paragraph(content: Node[] = [], attrs?: Node): Node {
  const node: Node = { type: 'paragraph' };
  if (attrs) node.attrs = attrs;
  if (content.length) node.content = content;
  return node;
}

/** A ruled answer/writing line at the band's pitch (year-banded height). */
function ruledLine(pitchPx: number): Node {
  return { type: 'paragraph', attrs: { wsRule: pitchPx } };
}

/** A choice line with a leading tick box. */
function tickLine(label: string): Node {
  return { type: 'paragraph', attrs: { wsTick: true }, content: label ? [textNode(label)] : [] };
}

/** A small box to write a numeric answer. */
function numberBox(): Node {
  return { type: 'paragraph', attrs: { wsNumBox: true } };
}

function cell(content: Node[], attrs: Node = {}): Node {
  return {
    type: 'tableCell',
    attrs: { colspan: 1, rowspan: 1, colwidth: null, ...attrs },
    content: content.length ? content : [paragraph()],
  };
}

function headerCell(content: Node[]): Node {
  return { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: content.length ? content : [paragraph()] };
}

const tableRow = (cells: Node[]): Node => ({ type: 'tableRow', content: cells });
const table = (rows: Node[]): Node => ({ type: 'table', content: rows });

// ── Picture resolution (subject-keyed, not order-keyed) ──────────────────────
//
// An item's `picture` is a subject string that pairs BY VALUE with an `image_slots`
// entry of the same `subject`. Resolving by subject (not by marker order) is what lets
// a shared scene emit ONE picture and a re-order never mis-pair — the order fragility
// that bit the markdown path. A slot with a `storage_path` becomes the inline image;
// otherwise the `[Picture: …]` marker text is left, so a not-yet-generated image
// degrades to the fallback the teacher already sees and a later recompile fills it.

function slotsBySubject(slots: ImageSlot[]): Map<string, ImageSlot> {
  const map = new Map<string, ImageSlot>();
  for (const slot of slots) {
    const key = (slot.subject ?? '').trim();
    if (key && !map.has(key)) map.set(key, slot);
  }
  return map;
}

/** The inline image node for a subject, sized to `widthPx`, or the `[Picture: …]`
 *  marker text when no ready slot exists. `sizeImagesByCount` later respects the
 *  width we set here, so the year-band picture size wins over the count-based one. */
function pictureInline(subject: string, bySubject: Map<string, ImageSlot>, widthPx: number): Node {
  const slot = bySubject.get(subject.trim());
  if (slot && slot.storage_path) {
    return {
      type: 'image',
      attrs: {
        src: null,
        alt: slot.subject ?? subject,
        storagePath: slot.storage_path,
        slotId: slot.slot_id,
        brief: slot.brief ?? null,
        width: widthPx,
      },
    };
  }
  return textNode(`[Picture: ${subject}]`);
}

/** A picture wrapped alone in its paragraph (the legal block form of an inline image). */
function pictureParagraph(subject: string, bySubject: Map<string, ImageSlot>, widthPx: number): Node {
  return paragraph([pictureInline(subject, bySubject, widthPx)]);
}

// ── Item predicates ──────────────────────────────────────────────────────────

const has = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const hasList = (v: unknown): v is string[] => Array.isArray(v) && v.some((x) => has(x));
const isNumeric = (v: string): boolean => /^\d+([.,]\d+)?$/.test(v.trim());
const wordCount = (v: string): number => v.trim().split(/\s+/).length;

/** Distinct non-empty picture values across items. */
function distinctPictures(items: WorksheetItem[]): Set<string> {
  const s = new Set<string>();
  for (const it of items) if (has(it.picture)) s.add(it.picture.trim());
  return s;
}

/** True when two or more items reference ONE shared picture (rule 7's trigger, read as
 *  the invariant states: a picture repeated across items IS how a shared scene is
 *  declared). Every picture-bearing item must name the same picture. */
function isSharedScene(items: WorksheetItem[]): boolean {
  const withPic = items.filter((it) => has(it.picture));
  return withPic.length >= 2 && distinctPictures(items).size === 1;
}

const every = (items: WorksheetItem[], p: (it: WorksheetItem) => boolean): boolean =>
  items.length > 0 && items.every(p);

// ── The eleven rules ─────────────────────────────────────────────────────────

interface Ctx {
  band: BandNumbers;
  bandKey: YearBand;
  bySubject: Map<string, ImageSlot>;
}

/** Rule 1 — CELL / grid: a picture and a one/two-word answer. Cell = picture band +
 *  answer band (printed word for an example, number box if numeric, tick box for a
 *  true/false flag, blank ruled line otherwise). `n` across by year band. */
function rule1Grid(items: WorksheetItem[], ctx: Ctx): Node[] {
  const perRow = ctx.band.gridAcross;
  const cells: Node[] = items.map((it) => {
    const pic = pictureParagraph(it.picture!, ctx.bySubject, ctx.band.gridPicPx);
    let band: Node;
    if (it.isExample && has(it.answer)) band = paragraph([textNode(it.answer.trim())]);
    else if (it.trueFalse) band = tickLine(has(it.answer) ? it.answer.trim() : '');
    else if (has(it.answer) && isNumeric(it.answer)) band = numberBox();
    else band = ruledLine(ctx.band.ruledPitchPx);
    return cell([pic, band], { wsFlashcardCell: true });
  });
  const rows: Node[] = [];
  for (let r = 0; r < cells.length; r += perRow) {
    const rowCells = cells.slice(r, r + perRow);
    while (rowCells.length < perRow) rowCells.push(cell([paragraph()], { wsFlashcardCell: true }));
    rows.push(tableRow(rowCells));
  }
  return [table(rows)];
}

/** Rule 2 — ROW: a picture and a sentence. Two-column rows, picture left; reversed to
 *  picture-right when the item carries the true/false flag (a judgement about the
 *  picture, declared — never inferred). */
function rule2PictureSentence(items: WorksheetItem[], ctx: Ctx): Node[] {
  const rows = items.map((it, i) => {
    const sentence = paragraph([textNode(`${i + 1}. ${(it.sentence ?? '').trim()}`)]);
    const textContent: Node[] = [sentence];
    if (it.trueFalse) textContent.push(tickLine('True'), tickLine('False'));
    const picCell = cell([pictureParagraph(it.picture!, ctx.bySubject, ctx.band.rowPicPx)], { wsMediaCell: 'pic' });
    const txtCell = cell(textContent, { wsMediaCell: 'text' });
    return tableRow(it.trueFalse ? [txtCell, picCell] : [picCell, txtCell]);
  });
  return [table(rows)];
}

/** Rule 3 — ROW: two sides, a left and a right. Three columns, a 60 mm gap in the
 *  middle, the right column shuffled so it never sits in the order the left implies. A
 *  dot at each end. More than eight pairs becomes two tables. */
function rule3Matching(items: WorksheetItem[]): Node[] {
  const out: Node[] = [];
  for (let start = 0; start < items.length; start += MATCH_MAX_PER_TABLE) {
    const chunk = items.slice(start, start + MATCH_MAX_PER_TABLE);
    const rights = chunk.map((it) => (it.right ?? '').trim());
    // Rotate by one: a fixed-point-free permutation for any chunk of two or more, so
    // no right cell lands beside the left it answers.
    const shuffled = rights.map((_, i) => rights[(i + 1) % rights.length]);
    const rows = chunk.map((it, i) =>
      tableRow([
        cell([paragraph([textNode(`${(it.left ?? '').trim()}  •`)])], { wsPlainCell: true, colwidth: null }),
        cell([paragraph()], { wsPlainCell: true, colwidth: [MATCH_GAP_PX] }),
        cell([paragraph([textNode(`•  ${shuffled[i]}`)])], { wsPlainCell: true, colwidth: null }),
      ]),
    );
    out.push(table(rows));
  }
  return out;
}

/** Rule 4 — GROUP COLUMN: a group name. One column per distinct group, a heading cell
 *  on cream (a table header), ruled space beneath — one line more than the largest
 *  group needs. Four or more groups wrap to two rows of columns. An example item is
 *  pre-placed on the first line of its column. */
function rule4Sorting(items: WorksheetItem[], ctx: Ctx): Node[] {
  const groups: string[] = [];
  const byGroup = new Map<string, WorksheetItem[]>();
  for (const it of items) {
    const g = (it.group ?? '').trim();
    if (!g) continue;
    if (!byGroup.has(g)) { byGroup.set(g, []); groups.push(g); }
    byGroup.get(g)!.push(it);
  }
  const largest = Math.max(1, ...groups.map((g) => byGroup.get(g)!.length));
  const lines = largest + 1; // one line more than the largest group needs
  const perRow = groups.length >= 4 ? Math.ceil(groups.length / 2) : groups.length;

  const columnCell = (g: string): Node => {
    const content: Node[] = [];
    const examples = byGroup.get(g)!.filter((it) => it.isExample && has(it.answer));
    for (const ex of examples) content.push(paragraph([textNode(ex.answer!.trim())]));
    for (let i = content.length; i < lines; i++) content.push(ruledLine(ctx.band.ruledPitchPx));
    return cell(content);
  };

  const rows: Node[] = [];
  for (let r = 0; r < groups.length; r += perRow) {
    const slice = groups.slice(r, r + perRow);
    const heads = slice.map((g) => headerCell([paragraph([textNode(g)])]));
    const cells = slice.map((g) => columnCell(g));
    // Pad a short final row of columns so the table stays rectangular (ProseMirror
    // requires it) — an empty header + empty cell fill the gap.
    while (heads.length < perRow) { heads.push(headerCell([paragraph()])); cells.push(cell([paragraph()])); }
    rows.push(tableRow(heads));
    rows.push(tableRow(cells));
  }
  return [table(rows)];
}

/** Rule 5 — ROW: a speaker and a reply. Speaker rows, the name in a fixed 34 mm column,
 *  a given reply as text and a blank reply as a ruled line. */
function rule5Dialogue(items: WorksheetItem[], ctx: Ctx): Node[] {
  const rows = items.map((it) => {
    const name = has(it.speaker) ? it.speaker.trim() : '';
    const replyCell = has(it.reply)
      ? cell([paragraph([textNode(it.reply.trim())])], { wsPlainCell: true })
      : cell([ruledLine(ctx.band.ruledPitchPx)], { wsPlainCell: true });
    return tableRow([
      cell([paragraph(name ? [{ type: 'text', text: name, marks: [{ type: 'bold' }] }] : [])], {
        wsPlainCell: true,
        colwidth: [SPEAKER_COL_PX],
      }),
      replyCell,
    ]);
  });
  return [table(rows)];
}

/** Rule 6 — ROW, grown: a prompt and no answer key. A writing frame: the prompt, a
 *  worked example if the item is one, then ruled rows (`lines`, or the default). */
function rule6WritingFrame(items: WorksheetItem[], ctx: Ctx): Node[] {
  const out: Node[] = [];
  for (const it of items) {
    if (has(it.prompt)) out.push(paragraph([textNode(it.prompt.trim())]));
    if (it.isExample && has(it.answer)) {
      out.push(paragraph([
        { type: 'text', text: 'Example: ', marks: [{ type: 'bold' }] },
        textNode(it.answer.trim()),
      ]));
    }
    const n = typeof it.lines === 'number' && it.lines > 0 ? Math.floor(it.lines) : DEFAULT_WRITING_LINES;
    for (let i = 0; i < n; i++) out.push(ruledLine(ctx.band.ruledPitchPx));
  }
  return out;
}

/** Rule 7 — SCENE: one shared picture referenced by every item. The picture once at
 *  114 mm, centred; the answer lines beneath in two columns, numbered to match; the
 *  picture never repeated per item. (The word bank sits above, in the framing prose.) */
function rule7Scene(items: WorksheetItem[], ctx: Ctx): Node[] {
  const subject = (distinctPictures(items).values().next().value as string) ?? '';
  const scene = paragraph([pictureInline(subject, ctx.bySubject, SCENE_PX)], { textAlign: 'center' });
  // Two-column grid of numbered ruled lines (an example item shows its answer instead).
  const labelCell = (it: WorksheetItem, n: number): Node => {
    const content: Node[] = it.isExample && has(it.answer)
      ? [paragraph([textNode(`${n}. ${it.answer.trim()}`)])]
      : [paragraph([textNode(`${n}.`)]), ruledLine(ctx.band.ruledPitchPx)];
    return cell(content, { wsPlainCell: true });
  };
  const rows: Node[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const left = labelCell(items[i], i + 1);
    const right = i + 1 < items.length ? labelCell(items[i + 1], i + 2) : cell([paragraph()], { wsPlainCell: true });
    rows.push(tableRow([left, right]));
  }
  return rows.length ? [scene, table(rows)] : [scene];
}

/** Rule 8 — PASSAGE: a passage shared by every item. Text at full measure, one
 *  supporting picture (a band above at Year 0-1, a 47 mm block beside from Year 2),
 *  then the items as numbered prompt rows with ruled space beneath. */
function rule8Passage(items: WorksheetItem[], passage: string, ctx: Ctx): Node[] {
  const out: Node[] = [];
  const subject = items.map((it) => it.picture).find(has) ?? null;
  const paras = passage.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  if (subject && ctx.bandKey === 'y0_1') {
    out.push(pictureParagraph(subject, ctx.bySubject, PASSAGE_BAND_PIC_PX));
    for (const p of paras) out.push(paragraph([textNode(p)]));
  } else if (subject && paras.length > 0) {
    // Picture beside the first paragraph: a two-column borderless row, text then pic.
    out.push(
      table([
        tableRow([
          cell([paragraph([textNode(paras[0])])], { wsMediaCell: 'text' }),
          cell([pictureParagraph(subject, ctx.bySubject, PASSAGE_SIDE_PIC_PX)], { wsMediaCell: 'pic' }),
        ]),
      ]),
    );
    for (const p of paras.slice(1)) out.push(paragraph([textNode(p)]));
  } else {
    for (const p of paras) out.push(paragraph([textNode(p)]));
  }

  items.forEach((it, i) => {
    const q = has(it.prompt) ? it.prompt.trim() : has(it.sentence) ? it.sentence.trim() : (it.answer ?? '').trim();
    out.push(paragraph([textNode(`${i + 1}. ${q}`)]));
    if (!(it.isExample && has(it.answer))) out.push(ruledLine(ctx.band.ruledPitchPx));
  });
  return out;
}

/** Rule 9 — ROW: options to choose between, no picture. Plain flow: the sentence, then
 *  the options on one line with tick boxes if three or fewer and each short; a line
 *  each otherwise. */
function rule9Options(items: WorksheetItem[]): Node[] {
  const out: Node[] = [];
  items.forEach((it, i) => {
    if (has(it.sentence)) out.push(paragraph([textNode(`${i + 1}. ${it.sentence.trim()}`)]));
    const options = (it.options ?? []).filter(has).map((o) => o.trim());
    const inline = options.length > 0 && options.length <= 3 && options.every((o) => o.length <= 15);
    if (inline) {
      out.push(table([tableRow(options.map((o) => cell([tickLine(o)], { wsPlainCell: true })))]));
    } else {
      for (const o of options) out.push(tickLine(o));
    }
  });
  return out;
}

/** Rule 10 — ROW, no picture: no picture, one answer inside a sentence. Plain numbered
 *  flow at full measure, a blank inline where the answer belongs. The model writes the
 *  blank as an underscore run `___`; we normalise it to a ≥40 mm inline blank. */
function rule10InlineBlank(items: WorksheetItem[]): Node[] {
  return items.map((it, i) => {
    const raw = has(it.sentence) ? it.sentence.trim() : '';
    return paragraph([textNode(`${i + 1}. ${normaliseInlineBlank(raw)}`)]);
  });
}

/** A run of two or more underscores → a fixed-width inline blank of underscores wide
 *  enough to read as ≥40 mm; if the sentence has none, a blank is appended. Inline
 *  blanks stay text (not a styled node) so this touches no schema — the crisp ruled
 *  BLOCK line is where the border-bottom treatment lives. */
function normaliseInlineBlank(sentence: string): string {
  const blank = '_'.repeat(Math.max(12, Math.round(INLINE_BLANK_PX / 6)));
  if (/_{2,}/.test(sentence)) return sentence.replace(/_{2,}/, blank);
  return sentence.length ? `${sentence} ${blank}` : blank;
}

/** Rule 11 — ROW: the safe fallback. One row per item — picture left if there is one,
 *  everything else as an ordinary paragraph, a ruled line beneath if the item has no
 *  printed answer. A mixed exercise takes this rather than switching item by item. */
function rule11Fallback(items: WorksheetItem[], ctx: Ctx): Node[] {
  const out: Node[] = [];
  items.forEach((it, i) => {
    const body: Node[] = [];
    const printedAnswer = Boolean(it.isExample && has(it.answer));
    const parts: string[] = [];
    if (has(it.prompt)) parts.push(it.prompt.trim());
    if (has(it.sentence)) parts.push(it.sentence.trim());
    if (printedAnswer) parts.push(it.answer!.trim());
    body.push(paragraph([textNode(`${i + 1}. ${parts.join(' ')}`.trim())]));
    if (!printedAnswer && !hasList(it.options)) body.push(ruledLine(ctx.band.ruledPitchPx));
    for (const o of (it.options ?? []).filter(has)) body.push(tickLine(o.trim()));

    if (has(it.picture)) {
      out.push(
        table([
          tableRow([
            cell([pictureParagraph(it.picture.trim(), ctx.bySubject, ctx.band.rowPicPx)], { wsMediaCell: 'pic' }),
            cell(body, { wsMediaCell: 'text' }),
          ]),
        ]),
      );
    } else {
      out.push(...body);
    }
  });
  return out;
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Compose one exercise's declared items into top-level tiptap nodes, by the FIRST
 * matching rule. `passage` (an exercise-level sibling of items) is checked first
 * because it is the exercise's defining feature — a reading question is also "a prompt
 * with no answer key" (rule 6), so without this an exercise with a passage would land
 * on a writing frame instead of passage-and-questions.
 *
 * Rule 11 is the fallback and always matches, so an item shape nobody anticipated —
 * or a mix of shapes — lands on a known arrangement rather than nowhere.
 */
export function composeExerciseItems(input: {
  items: WorksheetItem[];
  passage: string | null | undefined;
  band: YearBand;
  slots: ImageSlot[];
}): unknown[] {
  const items = (input.items ?? []).filter((it) => it && typeof it === 'object');
  const ctx: Ctx = { band: BANDS[input.band], bandKey: input.band, bySubject: slotsBySubject(input.slots ?? []) };
  const passage = has(input.passage) ? input.passage.trim() : '';

  if (items.length === 0) return passage ? [paragraph([textNode(passage)])] : [];

  // Rule 8 — passage present (exercise-level, dominates the item-level rules).
  if (passage) return rule8Passage(items, passage, ctx);

  // Rule 7 — a shared picture (checked before the picture rules, per the invariant).
  if (isSharedScene(items)) return rule7Scene(items, ctx);

  // Rule 1 — picture + short answer, pictures distinct (a shared picture went to 7).
  if (every(items, (it) => has(it.picture) && has(it.answer) && wordCount(it.answer) <= 2)) {
    return rule1Grid(items, ctx);
  }
  // Rule 2 — picture + sentence.
  if (every(items, (it) => has(it.picture) && has(it.sentence))) return rule2PictureSentence(items, ctx);
  // Rule 3 — a left and a right.
  if (every(items, (it) => has(it.left) && has(it.right))) return rule3Matching(items);
  // Rule 4 — a group name.
  if (every(items, (it) => has(it.group))) return rule4Sorting(items, ctx);
  // Rule 5 — a speaker and a reply.
  if (every(items, (it) => has(it.speaker))) return rule5Dialogue(items, ctx);
  // Rule 6 — a prompt and no answer key.
  if (every(items, (it) => has(it.prompt) && !has(it.answer))) return rule6WritingFrame(items, ctx);
  // Rule 9 — options, no picture.
  if (every(items, (it) => hasList(it.options) && !has(it.picture))) return rule9Options(items);
  // Rule 10 — no picture, an answer inside a sentence.
  if (every(items, (it) => !has(it.picture) && has(it.sentence) && has(it.answer))) {
    return rule10InlineBlank(items);
  }
  // Rule 11 — anything else, or a mix of shapes.
  return rule11Fallback(items, ctx);
}
