import type { GeArea } from '../types';

// IGETC — the legacy intersegmental GE pattern, still certifiable by students
// who first enrolled at a CCC before fall 2025 (catalog rights). Students
// entering fall 2025+ follow Cal-GETC instead (see calgetc.ts).
//
// REAL pattern data, transcribed 2026-06-11 from El Camino College's IGETC
// sheet (data-sources/ge-patterns/igetc-ecc-list-2021-22.pdf) — 'unreviewed'
// until Sami's transcription pass (provenance in meta.ts, IGETC_SOURCE).
//
// SHEET CURRENCY — confirmed 2026-06-14: an ECC Transfer Center representative
// told Sami THIS sheet (printed "2021-2022") is the current, authoritative ECC
// IGETC sheet to use — ECC has not issued a newer IGETC edition (IGETC is being
// phased out in favor of Cal-GETC). So 2021-22 is the correct pattern year, not
// a stale artifact to replace. Two things about the sheet, both modeled faithfully:
//  · It folds Ethnic Studies courses INTO Area 4 (Social & Behavioral Sciences)
//    rather than a standalone Area 7 — so THERE IS NO AREA 7 ROW here. (Cal-GETC,
//    by contrast, carries Ethnic Studies as its Area 6.)
//  · It predates Common Course Numbering and prints "(formerly X)" mappings
//    (e.g. ECONOMICS 101 formerly 1). The 2025-26 agreements use the CCN codes;
//    the catalog reconciles the two (see ecc-catalog/SOURCES.md). IGETC placement
//    also follows the list in effect when a course was TAKEN (rule 1 on the sheet).
//
// Modeling notes:
//  · Area 2 prints as "2A" on the sheet — the area id is now "2A" everywhere
//    (course tags included).
//  · Area 3's real rule is THREE courses: ≥1 Arts (3A), ≥1 Humanities (3B),
//    plus one more from either. Modeled exactly with three area rows: 3A and
//    3B (one each) plus the synthetic total-row "3" (count 3) that every
//    3A/3B-tagged course also feeds via its extra "3" tag. All three rows
//    green ⇔ the printed rule holds; no engine change needed.
//  · Area 5: one 5A + one 5B, one of the two with a lab (5C). 5C overlap with
//    5A/5B is intended (a lab science course tags e.g. ["5A","5C"]).
//  · Area 6 is a UC-only requirement on the sheet ("UC Requirement Only") —
//    appliesTo filters it out for CSU targets, same mechanism as 1C.
//  · Unit minimums (e.g. "9 semester units in Area 3") are carried in the
//    descriptions; the engine audits course counts, not units — a known
//    simplification, surfaced in copy.
export const IGETC_AREAS: GeArea[] = [
  {
    id: "1A",
    label: "English Composition",
    description: "One course in English composition (3 semester units minimum)",
  },
  {
    id: "1B",
    label: "Critical Thinking – English Composition",
    description: "One course in critical thinking / composition (3 semester units minimum). The sheet notes this area cannot be cleared by an AP exam.",
  },
  {
    id: "1C",
    label: "Oral Communication",
    description: "One course in oral communication (CSU requirement only — not needed for UC under IGETC)",
    appliesTo: "CSU",
  },
  {
    id: "2A",
    label: "Mathematical Concepts & Quantitative Reasoning",
    description: "One course in math/quantitative reasoning (3 semester units minimum)",
  },
  {
    id: "3A",
    label: "Arts",
    description: "At least one Arts course (Area 3 total: three courses, 9 semester units minimum)",
  },
  {
    id: "3B",
    label: "Humanities",
    description: "At least one Humanities course (Area 3 total: three courses, 9 semester units minimum)",
  },
  {
    id: "3",
    label: "Arts & Humanities — three courses total",
    description: "Area 3 requires three courses overall: one Arts, one Humanities, and one more from either",
    count: 3,
  },
  {
    id: "4",
    label: "Social & Behavioral Sciences",
    description: "Three courses from at least two different groups/disciplines (9 semester units minimum)",
    count: 3,
    minDistinctDepts: 2,
  },
  {
    id: "5A",
    label: "Physical Sciences",
    description: "One course in physical sciences (Area 5 total: 7–9 semester units minimum)",
  },
  {
    id: "5B",
    label: "Biological Sciences",
    description: "One course in biological sciences",
  },
  {
    id: "5C",
    label: "Laboratory Science",
    description: "One of the two science courses must include a laboratory (the lab must correspond to a 5A/5B lecture). Lab (5C) tags were verified 2026-07-07 against the underline marks on ECC's current advisement sheet (the same courses' lab status; the 2021-22 sheet's own underlines don't survive in its PDF).",
  },
  {
    id: "6",
    label: "Languages Other Than English",
    description: "UC requirement only: proficiency equivalent to two years of high school study in one language — a course, qualifying exam score, or verified equivalent (see the sheet for the full list of proofs)",
    appliesTo: "UC",
  },
];
