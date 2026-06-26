// Shared visual language for the lesson-plan PDFs.
//
// The Alsama brand is applied lightly: a small palette plus a single StyleSheet
// reused by every PDF component. We deliberately use react-pdf's built-in
// Helvetica rather than registering a web font (e.g. Sora) — registering a
// remote font would make every PDF request depend on outbound network at render
// time, which the environment's network policy may block. Helvetica renders
// identically offline and keeps these routes robust. Swapping in a bundled Sora
// .ttf later is a one-line `Font.register` here, with no change to the documents.

import { StyleSheet } from '@react-pdf/renderer';

/**
 * Alsama brand palette (kept intentionally small).
 *
 * The `given*` / `mine*` / `stem` values mirror the editor's "colour = meaning"
 * design tokens (globals.css): cream `given` = locked, curriculum-provided
 * content; pink `mine` = teacher-editable content; `stem` = the baked-in,
 * non-editable objective prefix. Keeping the PDF on the same semantics means the
 * exported plan reads with the same zoning the teacher sees on screen.
 */
export const COLORS = {
  pink: '#B62A5C',
  teal: '#1F7A6C',
  cream: '#F5EDE5',
  ink: '#2A2A2A',
  muted: '#6B6B6B',
  neutral700: '#756B64', // secondary text — strip / section sub-headings
  hairline: '#E2D8CE',
  white: '#FFFFFF',
  // Editor zoning roles (see globals.css @theme).
  given: '#FBF8F3', // cream surface — locked / curriculum-provided
  givenBorder: '#ECE4D7',
  givenLabel: '#A6917A',
  mine: '#FBF2F5', // pink surface — teacher-editable
  mineBorder: '#F1D8E1',
  stem: '#A88792', // baked-in objective stem prefix
} as const;

/** Human label for a gradual-release teaching phase. `null` → no label. */
export function phaseLabel(phase: 'i_do' | 'we_do' | 'you_do' | null): string | null {
  switch (phase) {
    case 'i_do':
      return 'I do';
    case 'we_do':
      return 'We do';
    case 'you_do':
      return 'You do';
    default:
      return null;
  }
}

/** Human label for a plan's approval status. */
export function statusLabel(status: string): string {
  switch (status) {
    case 'in_progress':
      return 'In progress';
    case 'submitted':
      return 'Submitted';
    case 'needs_review':
      return 'Needs review';
    case 'approved':
      return 'Approved';
    default:
      return status;
  }
}

export const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 44,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    lineHeight: 1.4,
    color: COLORS.ink,
  },

  // ---- Header band -------------------------------------------------------
  header: {
    backgroundColor: COLORS.cream,
    borderRadius: 6,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.pink,
  },
  brand: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    letterSpacing: 1.5,
    color: COLORS.pink,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  classTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    color: COLORS.ink,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  metaItem: {
    marginRight: 18,
    fontSize: 9,
    color: COLORS.muted,
  },
  metaStrong: {
    fontFamily: 'Helvetica-Bold',
    color: COLORS.teal,
  },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: COLORS.teal,
    color: COLORS.white,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ---- Generic section ---------------------------------------------------
  section: {
    marginBottom: 14,
  },
  sectionHeading: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: COLORS.teal,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairline,
  },
  // The SMARTT objective is teacher-editable → pink (mine) box, mirroring the
  // on-screen SmarttObjectiveBox / ObjectiveBanner.
  objectiveBox: {
    backgroundColor: COLORS.mine,
    borderWidth: 1,
    borderColor: COLORS.mineBorder,
    borderRadius: 5,
    padding: 10,
  },
  objectiveText: {
    fontSize: 11,
    lineHeight: 1.5,
  },
  // The baked-in, non-editable opening stem, shown muted before the remainder.
  objectiveStem: {
    color: COLORS.stem,
  },

  // ---- Curriculum (locked / "given") panels ------------------------------
  givenPanel: {
    backgroundColor: COLORS.given,
    borderWidth: 1,
    borderColor: COLORS.givenBorder,
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  },
  givenLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.givenLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  givenValue: {
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.ink,
    lineHeight: 1.4,
  },

  // ---- Link it together (three strips) -----------------------------------
  linkItCard: {
    borderWidth: 1,
    borderColor: COLORS.hairline,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  strip: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.hairline,
    paddingTop: 12,
  },
  stripFirst: {
    marginTop: 0,
    borderTopWidth: 0,
    paddingTop: 0,
  },
  stripHeading: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.neutral700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  // The Recap free-text is teacher-editable → a light pink (mine) field.
  recapBox: {
    backgroundColor: COLORS.mine,
    borderWidth: 1,
    borderColor: COLORS.mineBorder,
    borderRadius: 5,
    padding: 8,
  },
  techniqueRow: {
    marginBottom: 3,
  },

  // ---- Blocks ------------------------------------------------------------
  blocksHeading: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: COLORS.teal,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  block: {
    marginBottom: 9,
    paddingBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairline,
  },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  blockTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: COLORS.ink,
    flexGrow: 1,
  },
  phaseTag: {
    marginRight: 8,
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.pink,
    color: COLORS.pink,
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  minutes: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: COLORS.teal,
  },
  activityTitle: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Oblique',
    color: COLORS.muted,
    marginBottom: 3,
  },
  detailRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  detailLabel: {
    width: 64,
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.muted,
    textTransform: 'uppercase',
  },
  detailValue: {
    flexGrow: 1,
    flexBasis: 0,
    fontSize: 9.5,
  },
  empty: {
    fontSize: 9.5,
    color: COLORS.muted,
    fontFamily: 'Helvetica-Oblique',
  },

  // ---- Footer ------------------------------------------------------------
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: COLORS.muted,
    borderTopWidth: 1,
    borderTopColor: COLORS.hairline,
    paddingTop: 6,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  totalText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: COLORS.pink,
  },
});
