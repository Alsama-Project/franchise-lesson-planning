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

Each subject is a human-declared extraction rule in raw coordinates — sheet name, first
data row, explicit column letters for the key parts, and the exact **outcome column(s)**.
Simple enough to verify by eye on 3–5 rows against the live workbook, then applied by
machine to every row. All seven source-backed subjects are verified against the real
gold-master workbooks:

| Subject | Sheet | Year/Month/Week/Period | Outcome (pinned) | Weekly/Monthly S · K | Grain |
|---|---|---|---|---|---|
| english | `English Curriculum` | E / G / O / Q | **R** `Daily LO` | K · N (weekly) | daily |
| arabic | `Arabic Curriculum (2)` | E / F / L / M | **N** `نتائج التعلم اليومية` | H · K (weekly) | daily (row 7) |
| maths | `Curriculum Math` | D / F / N / O | **P** `Daily LO` | J · M (weekly) | daily |
| science | `Version 2 ` (sic) | E / G / O / P | **Q** `Daily LO` | K · N (weekly) | daily |
| professionalism | `V4` (only visible) | E / G / K / L | **M** `Daily LO` | I · J (weekly) | daily (Y3–6) |
| awareness | `Awareness Cirriculum V3` | E / G / K / — | **compose(I, J)** | I · J (weekly) | weekly |
| yoga | `Yoga Curriculum` | E / G / P / (forced P1) | **compose(K, N)** | K · N (weekly) | daily (P1) |

Sheet-selection gotchas the pins encode: arabic uses `Arabic Curriculum (2)` (the other
tab has taxonomy-code junk in the daily column); science's sheet name has a **trailing
space**; professionalism uses **`V4`** — the only *visible* sheet (V1/V2/Detail*/Sheet1
are hidden legacy versions, and the DB was mistakenly ingested from the hidden, stale
`V1`). Yoga's
source is one row per week with blank period cells, so its period is **forced to 1** to
match the DB key; prof carries **Monthly** S/K (the DB's `weekly_*` are NULL for prof, so
they're not diffed — a product decision left open).

- **Unpinned:** `it` has **no source workbook**, so it stays `pinned: false`. The harness
  **refuses** to audit it and surfaces it loudly (CLI + a non-fatal test warning) rather
  than silently skipping. Do not fabricate a mapping for it.

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
# 1. Export the ACTIVE curriculum_lesson rows to CSV (see Track A in the audit brief).
#    Either a single COMBINED export → <fixtures>/goldmaster.csv (all subjects; the
#    loader filters by subject_code) OR per-subject → <fixtures>/goldmaster/<subject>.csv.
#    Columns used: subject_code,year,month,week,period,daily_outcome,
#                  weekly_skills_lo,weekly_knowledge_lo (extra columns are ignored).
# 2. Drop the real source workbooks under the fixtures dir (real filename or
#    <subject>.xlsx), or point CURRICULUM_FIXTURES_DIR at an out-of-tree copy.

npm run audit:curriculum   # layered report; exits 1 if any auditable subject fails the gate
npm test                   # the wired gate (audit-reconciliation.test.ts) fails loudly on any
                           # app-only orphan or Tier-1 corruption; self-skips without fixtures
```

`audit-extract.test.ts` proves the extractor and every reconciliation layer on synthetic
in-memory workbooks, so the mechanism is verified even without the IP fixtures.

## Findings from the first full run (real workbooks + DB gold master)

The set cross-check confirms **no wrong-column binding** anywhere: every daily subject's
DB `daily_outcome` set matches its pinned Daily-LO column (jaccard ≈ 0.99–1.0), all
decoys ≈ 0. The gate is red only for real, explained reasons — hand these to the operator:

| Subject | Gate | What the audit found |
|---|---|---|
| **maths** | ✅ pass | 1240/1240 exact, incl. Year 0. Cross-check 1.000. |
| **professionalism** | ❌ fail | DB is stale **V1** (a hidden legacy sheet). Repinned to the only-visible **V4**: daily content AND week-numbering differ entirely (jaccard 0.000, 160/160 daily mismatch on overlapping keys), so it reads red until re-ingested from V4. This is the bug the V1 pin was hiding. |
| **science** | ❌ fail | 5 `Y5 May W36` lessons drift across all fields — the source was **edited after ingest** (DB: reproduction; source: mitosis/cancer). Reconcile or re-import. 17 holiday markers excused; 10 duplicate source keys noted. |
| **awareness** | ❌ fail | `daily_outcome` is **NULL for all 248 rows** — `composeWeekly` (skill `\n` knowledge) was never applied at ingest. Weekly fields already correct. Fix = re-ingest. |
| **yoga** | ❌ fail | Same `composeWeekly` NULL defect (215 rows). Plus 12 un-imported new weeks (source-only) and the known `Y5 "Year 5" W5 P5` artefact (excused). |
| **english** | ❌ fail | daily content exact (0/1179); one genuine orphan `Y5 Mar W27` — a real lesson mis-stored with NULL period. Sweep it. |
| **arabic** | ❌ fail | daily content exact (0/1235); one genuine orphan `Y5 Dec W15` — same NULL-period anomaly. |

Note: maths and arabic Year 0 **is** present in both workbook and DB and matches exactly,
so no year is excluded. `excludeYears` remains available for any subject whose source
genuinely lacks a year, but none currently need it.

## Independence boundary (a note on SheetJS)

The gate lives in the repo's Node/test toolchain, so it reads cells with `xlsx` (the same
library the parser depends on) — but **only by explicit A1 addresses**, with its own
forward-fill and its own error-sentinel handling, and **zero** imports from the parser's
mapping code. Independence here is code-level (no shared column logic), which is what
makes a diff trustworthy. A human running Track A in plain `openpyxl` will reach the same
`expected` values from the same pinned coordinates.
