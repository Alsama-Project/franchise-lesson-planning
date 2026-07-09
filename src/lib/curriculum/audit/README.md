# Curriculum fidelity audit

An **independent, full-content reconciliation** that guarantees the app's curriculum
data (`curriculum_lesson`) matches the source Excel workbooks — wired as a **gate** that
blocks an ingest whenever the diff isn't clean.

## Why it exists (the one principle)

An audit that reuses the ingest's column-mapping is worthless — it blesses the same
wrong data. So **this harness shares no code with the parser** (`parse.ts`,
`columnMatcher.ts`, the alias dict, the parser's forward-fill). "Expected" is derived
from **raw Excel cells via a human-pinned coordinate mapping** and reconciled against the
**actual DB gold master** — never against a re-parse of the workbook (that would only
prove `parser == extractor`, not `app == source`) and never against the committed,
text-free parity fixtures (those are derived and can be green while the app is wrong).

This is deliberately **separate** from the existing parser parity gate
(`__tests__/parity.test.ts`), which calls `parseCurriculumWorkbook` and only checks that
`lesson_key` **sets** line up. That gate proves the parser is self-consistent; this one
proves the parser is *correct*, on **content**.

## The trust anchor: `pinned-map.ts`

Each subject is a human-declared extraction rule in raw coordinates — sheet name, header
row, explicit column letters for the key parts, and the exact **outcome column(s)**.
Simple enough to verify by eye on 3–5 rows against the live workbook, then applied by
machine to every row.

- **Verified pins:** `english` (outcome = col **R** `Daily LO`, the abbreviated column
  surrounded by decoy "…Learning Outcome" columns — the prime mis-bind trigger),
  `awareness` (Weekly Skill **I** `\n` Weekly Knowledge **J**), `yoga` (Weekly Skill
  **K** `\n` Weekly Knowledge **N**). Source: the audit brief §3.
- **Unpinned:** `arabic, maths, professionalism, science, it` are declared `pinned:
  false`. Their outcome columns can't be pinned honestly without the real gold-master
  workbooks in hand, so the harness **refuses** to audit them and surfaces them loudly
  (CLI + a non-fatal test warning) rather than silently skipping. Declare each against
  its real workbook and set `pinned: true`.

## The four layers (`reconcile.ts`)

Run in order; the first failing layer names the failure mode.

1. **Coverage / structure** — key-set diff on the natural key. `app-only` = a DB row
   with no backing source row (fabricated/orphaned — **blocks the gate**); `source-only`
   = a workbook row not yet in the DB (un-imported new content — reported, not fatal).
2. **Content (Tier-1)** — outcome text drift on matched rows. The wrong-column / shift
   detector. **Blocks the gate.**
3. **Set cross-check** — the DB `daily_outcome` **set** is tested against each candidate
   source column's set; the best match names the column the ingest *actually* pulled.
   Root-causes a mis-bind without touching the parser.
4. **Whitespace-only** — Tier-0 fail / Tier-1 pass. Reported separately, low priority.

**Natural key** is rebuilt from columns `(subject, year, month, week, period)`, each
normalised (`Year 3`→3, month lower-cased, `Period 1`→1, weekly→null) — **never** from
the stored `lesson_key`, so a key-generation change can't hide behind it.

**Two tiers** (`normalize.ts`): Tier-1 (content) trims, collapses horizontal whitespace,
normalises newlines to `\n`, NFC, strips zero-width — a Tier-1 mismatch is real
corruption. Tier-0 (bytes) is exact — a Tier-0-only mismatch is whitespace/encoding
noise, classified, never silently normalised away.

## Running it

The raw workbooks and the DB gold master are gitignored IP, so **everything self-skips
when they're absent** (CI, or before the files are dropped in) — exactly like the parser
parity gate.

```
# 1. Export the ACTIVE curriculum_lesson rows per subject to CSV (see Track A in the
#    audit brief) → test/fixtures/curriculum/goldmaster/<subject>.csv
#    Columns: subject_code,year,month,week,period,lesson_key,daily_outcome,
#             weekly_skills_lo,weekly_knowledge_lo,monthly_lo,... (README in test/fixtures)
# 2. Drop the real source workbooks under the fixtures dir (real filename or
#    <subject>.xlsx), or point CURRICULUM_FIXTURES_DIR at an out-of-tree copy.

npm run audit:curriculum   # layered report; exits 1 if any auditable subject fails the gate
npm test                   # the wired gate (audit-reconciliation.test.ts) fails loudly on any
                           # app-only orphan or Tier-1 corruption; self-skips without fixtures
```

`audit-extract.test.ts` proves the extractor and every reconciliation layer on synthetic
in-memory workbooks, so the mechanism is verified even without the IP fixtures.

## Independence boundary (a note on SheetJS)

The gate lives in the repo's Node/test toolchain, so it reads cells with `xlsx` (the same
library the parser depends on) — but **only by explicit A1 addresses**, with its own
forward-fill and its own error-sentinel handling, and **zero** imports from the parser's
mapping code. Independence here is code-level (no shared column logic), which is what
makes a diff trustworthy. A human running Track A in plain `openpyxl` will reach the same
`expected` values from the same pinned coordinates.
