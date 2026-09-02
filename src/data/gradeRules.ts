import type { DataProvenance } from '../types';

// Grade rules for the Risk Radar (endgoal "Risk Radar on real grades").
//
// These are ENGINE DEFAULTS with provenance — the honest posture the product
// uses everywhere else: a rule is a rule with a source and a verification
// stamp, and where the real campus policy is thinner we say so instead of
// pretending. Every flag the radar produces cites the rule it used.
//
// The standing default for California transfer prep: major-prep courses must
// be passed with a C or better (UC/CSU transfer prep standard; campus and
// agreement-specific exceptions exist and are modeled as overrides below).
// GE areas follow the same C-or-better default. Courses the engine cannot
// map to a requirement produce no flag at all (unmapped ≠ at risk).

export interface GradeRule {
  points: number;        // required minimum grade points (4.0 scale)
  label: string;         // "C" | "B" | ...
  source: string;        // student-facing one-liner for the citation chip
  meta: DataProvenance;
}

// Letter grades on the standard 4.0 scale (A = 4.0 … F = 0.0), including
// plus/minus — the scale Canvas reports and transcripts use.
export const LETTER_POINTS: Record<string, number> = {
  'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7,
  'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D+': 1.3, 'D': 1.0, 'D-': 0.7, 'F': 0.0,
};

// Percent-score cutoffs used ONLY when Canvas reports a numeric score without
// a letter grade. These follow a common 4.0 letter mapping; because campuses
// vary, any flag built from a score-only estimate is labeled "estimated".
export const SCORE_TO_LETTER: { min: number; letter: string }[] = [
  { min: 93, letter: 'A' }, { min: 90, letter: 'A-' },
  { min: 87, letter: 'B+' }, { min: 83, letter: 'B' }, { min: 80, letter: 'B-' },
  { min: 77, letter: 'C+' }, { min: 73, letter: 'C' }, { min: 70, letter: 'C-' },
  { min: 67, letter: 'D+' }, { min: 63, letter: 'D' }, { min: 60, letter: 'D-' },
  { min: 0, letter: 'F' },
];

// Grades that carry no position on the 4.0 scale. A Pass, a Withdrawal, or an
// Incomplete is NOT a low grade — treating "P" as 0 would flag a passing course
// as failing. These resolve to null (no numeric grade) and the radar says so.
const NON_NUMERIC_GRADES = new Set([
  'P', 'NP', 'CR', 'NC', 'W', 'I', 'IP', 'RD', 'EW', 'MW', 'SP', 'AU', 'N/A', '',
]);

export function pointsFromScore(score: number): number {
  const letter = SCORE_TO_LETTER.find((row) => score >= row.min)?.letter ?? 'F';
  return LETTER_POINTS[letter] ?? 0;
}

export function pointsFromLetter(letter: string): number | null {
  const normalized = letter
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    // Canvas and transcript exports use the unicode minus/en-dash for "C−".
    .replace(/[−–—]/g, '-');
  if (NON_NUMERIC_GRADES.has(normalized)) return null;
  if (normalized in LETTER_POINTS) return LETTER_POINTS[normalized];
  // Some exports use "A+" / "B++" style — collapse the pluses to the base grade
  // (all of them, so "B++" is a B, not a B+).
  const stripped = normalized.replace(/\++$/, '');
  if (stripped in LETTER_POINTS) return LETTER_POINTS[stripped];
  return null;
}

export const DEFAULT_GRADE_RULE: GradeRule = {
  points: 2.0,
  label: 'C',
  source: 'California transfer-prep standard: major-prep and GE courses must be completed with a C or better (campus/agreement exceptions are modeled as overrides).',
  meta: {
    // The C-or-better floor is the standing convention across UC/CSU transfer
    // prep and the ICAS Cal-GETC/IGETC standards. It is stated here as an
    // ENGINE DEFAULT with a source, not as a verified per-agreement rule: no
    // human has checked it against each campus's published language yet, so it
    // stays 'unreviewed' like every other dataset awaiting that pass.
    sourceName: 'UC/CSU transfer-prep and ICAS GE grade standard (C or better)',
    sourceUrl: 'https://admission.universityofcalifornia.edu/how-to-apply/applying-as-a-transfer/requirements-for-transfer.html',
    catalogYear: '2025–26',
    lastVerified: '2026-08-15',
    verification: 'unreviewed',
  },
};

// Known per-agreement overrides. Populated from official campus/agreement
// language as it is confirmed; empty until then — the default above applies.
// Key: `${school}|${major}|${courseCode}` (courseCode = catalog code).
export const GRADE_RULE_OVERRIDES: Record<string, GradeRule> = {};

export function gradeRuleFor(
  school: string,
  major: string,
  catalogCode: string | null,
): GradeRule | null {
  if (!catalogCode) return null;
  const override = GRADE_RULE_OVERRIDES[`${school}|${major}|${catalogCode}`];
  return override ?? DEFAULT_GRADE_RULE;
}
