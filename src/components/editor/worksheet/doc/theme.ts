// Shared constants for the continuous-document worksheet editor (v3).
//
// The type scale is deliberately CURATED — teachers pick Heading / Subheading /
// Body, never an arbitrary font or size (the one thing the editor constrains).
// Colours are the Alsama brand palette only; the on-screen surface is a white A4
// page on a soft-grey "Docs" canvas (not the old beige-on-beige).

/** Autosave lifecycle for the Docs-style "Saving… / All changes saved" indicator. */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** A4 page geometry at 96dpi (the printout width the surface mirrors on screen). */
export const PAGE_WIDTH = 794;
/** A4 height — used only to draw the export page-break hints in print, never to
 *  paginate the on-screen surface (which is pageless). */
export const PAGE_HEIGHT = 1123;
/** Page margins (Word-ish ~19mm sides). The editable column is PAGE_WIDTH − 2×X. */
export const PAGE_PAD_X = 56;
export const PAGE_PAD_TOP = 40;
export const PAGE_PAD_BOTTOM = 56;

/** Brand palette (mirrors MasterFrame / globals.css — the "colour law"). */
export const BRAND = {
  pink: '#B62A5C',
  teal: '#1F7A6C',
  ink: '#2A2422',
  muted: '#6E6052',
  faint: '#93826B',
  cream: '#F5EDE5',
  creamSoft: '#FBF6EF',
  creamBorder: '#E6D9C7',
  /** The soft-grey Docs canvas the white page floats on. */
  canvas: '#F1F0EE',
  canvasFull: '#E8E1D6',
  pageShadow: '0 1px 3px rgba(40,30,20,0.12), 0 12px 32px -12px rgba(40,30,20,0.28)',
} as const;

/** The curated inline text colours offered in the toolbar/bubble (brand only —
 *  NOT an arbitrary colour picker). `null` clears the colour. */
export const TEXT_COLOURS: { label: string; value: string | null }[] = [
  { label: 'Default', value: null },
  { label: 'Pink', value: BRAND.pink },
  { label: 'Teal', value: BRAND.teal },
  { label: 'Muted', value: BRAND.muted },
];

/** The curated block styles offered in the toolbar. Heading = h2, Subheading = h3,
 *  Body = paragraph. (The worksheet TITLE lives in the masthead, so there is no
 *  in-body Title style.) */
export type BlockStyle = 'heading' | 'subheading' | 'body';
export const BLOCK_STYLES: { style: BlockStyle; label: string; level?: 2 | 3 }[] = [
  { style: 'body', label: 'Body' },
  { style: 'heading', label: 'Heading', level: 2 },
  { style: 'subheading', label: 'Subheading', level: 3 },
];

/** CURATED font sizes for the toolbar dropdown — never an arbitrary field. `null` =
 *  the document default (16px, from `.ws-doc`). The value is applied to the
 *  TextStyle mark by the FontSize extension. */
export const FONT_SIZES: { label: string; value: string | null }[] = [
  { label: 'Small', value: '13px' },
  { label: 'Normal', value: null },
  { label: 'Large', value: '20px' },
  { label: 'Extra large', value: '26px' },
];
