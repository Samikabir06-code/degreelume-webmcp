import type { MajorPrepReq } from '../../types';
import { IGETC_CERTIFIED_CODES } from '../igetcCertified';

// UCR Psychology PROSE requirements — hand-authored, NOT generated.
//
// Source: the same official ASSIST agreement PDF as ucr.psych.ts
// (data-sources/assist-agreements/ucr-psych-2025-26.pdf, "GENERAL
// REQUIREMENTS" section, accessed 2026-06-11; re-checked against the PDF prose
// 2026-07-01 — rides ucr.psych.ts's verified provenance).
// These three requirements are printed as prose, not articulation rows, so
// the ingest generator cannot produce them; requirements/index.ts composes
// them after the generated rows. Regenerating ucr.psych.ts never touches this
// file.
//
// Required-flag decision: required:false. Per the agreement these are lower-
// division MAJOR requirements (completable at UCR within one year of
// matriculation), and per the UCR Majors Preparation Guide the only
// ADMISSION-gating prep is the math requirement — so they must not drive the
// eligible/competitive/reach verdict. The labels carry the real urgency.
//
// Options strategy: the option lists are the ECC courses certified for IGETC
// 5B (biological) / 5A (physical) / 2A (math) on the 2021-2022 ECC IGETC sheet
// (data-sources/ge-patterns/igetc-ecc-list-2021-22.pdf), exactly as printed,
// plus the UC-transferable CSCI courses from the CS agreement for the
// "additional" rows. Most of these codes are NOT in the catalog snapshot yet
// (the full ECC catalog drop is pending), so for students who haven't taken
// them the rows audit as 'unknown' — the honest state (B2) — while students
// whose transcript contains one still get credit (audit checks completion
// before catalog membership).
//
// The audit's consumption rule enforces the printed no-double-counting rules:
// the course consumed by the math select-group can't also fill an
// "additional" row, the bio-row course can't double as an additional course,
// and the two additional rows need two distinct courses.
//
// Footnote caveats from the sheet (e.g. "GEOL 30/32/34/36 only if taken fall
// 2009 or later") are NOT modeled — course-vintage rules need the transcript
// term, which is out of scope for this pass. Sami: see ge-patterns/SOURCES.md.

// Option lists come from the certified-course registry (igetcCertified.ts) so
// the codes stay consistent with the integrity gate and the future catalog
// normalization happens in one place.
const IGETC_5B_CODES = IGETC_CERTIFIED_CODES['5B'];

// The agreement excludes Cultural Geography from the physical-science
// requirement — GEOG 5/5H (cultural) are not on the 5A list anyway; the
// physical-geography entries (GEOGRAPHY 1/6/9) are listed and stay.
const IGETC_5A_CODES = IGETC_CERTIFIED_CODES['5A'];

// "Approved as a Mathematics course on your community college's IGETC list".
// Two deliberate exclusions from the certified 2A list:
//  · COMMUNICATION STUDIES 180 — printed on the sheet's 2A line but ambiguous
//    for this prose rule; ask a counselor.
//  · MATH 115 — certified only if taken before fall 2017 (vintage rules are
//    not modeled; excluding is the conservative direction).
const IGETC_MATH_CODES = IGETC_CERTIFIED_CODES['2A'].filter(
  (c) => c !== 'COMMUNICATION STUDIES 180' && c !== 'MATH 115',
);

// UC-transferable Computer Science courses (all four articulate to UCR per
// the 2025-26 CS agreement, which establishes UC transferability).
const UC_TRANSFERABLE_CS_CODES = ['CSCI 1', 'CSCI 2', 'CSCI 3', 'CSCI 30'];

const ADDITIONAL_OPTIONS = [
  ...IGETC_5B_CODES,
  ...IGETC_5A_CODES,
  ...IGETC_MATH_CODES,
  ...UC_TRANSFERABLE_CS_CODES,
];

export const UCR_PSYCH_EXTRAS: MajorPrepReq[] = [
  {
    id: 'psych-bio-science',
    label:
      'Biological Sciences requirement — one course (required for the UCR Psychology major; due within one year at UCR, strongly encouraged before transfer). Any course on ECC’s IGETC biological-science (5B) list qualifies.',
    options: IGETC_5B_CODES,
    required: false,
  },
  {
    id: 'psych-physical-science',
    label:
      'Physical Science requirement — one course, excluding Cultural Geography (required for the UCR Psychology major; due within one year at UCR, strongly encouraged before transfer). Any course on ECC’s IGETC physical-science (5A) list qualifies.',
    options: IGETC_5A_CODES,
    required: false,
  },
  {
    id: 'psych-additional-1',
    label:
      'Additional requirement (1 of 2) — another biological/physical science, an IGETC-approved math course (statistics, college algebra, discrete structures…), or a UC-transferable computer science course. The course used for the math requirement may not double-count.',
    options: ADDITIONAL_OPTIONS,
    required: false,
  },
  {
    id: 'psych-additional-2',
    label:
      'Additional requirement (2 of 2) — same menu as 1 of 2; the two additional courses must be distinct.',
    options: ADDITIONAL_OPTIONS,
    required: false,
  },
];
