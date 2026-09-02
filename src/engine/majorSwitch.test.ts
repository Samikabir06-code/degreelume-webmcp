import { describe, it, expect } from 'vitest';
import { runAudit, type AuditInputs } from './runAudit';
import { buildSwitchMatrix, type SwitchCandidate } from './majorSwitch';
import { getRequirements } from '../data/requirements';
import { getAssociateDegree, getAdtTemplate } from '../data/degrees';
import { getUpperDiv } from '../data/upperdiv';
import { ECC_COURSES } from '../data/courses';
import { GE_PATTERNS } from '../data/gePatterns';
import { ECC_GE_AREAS } from '../data/eccge';
import { getMajor } from '../data/majors';
import type { StudentProfile, MajorId } from '../types';

// ─── Major Switch Explorer goldens — HAND-DERIVED (hard rule 5) ───
//
// Every expected number below is derived BY HAND from the generated
// requirement modules (themselves transcribed from the 2025-26 ASSIST pulls),
// never from engine output. Derivations are inline; if a data refresh changes
// an agreement, re-derive by hand.
//
// TRIMMED for this build's data slice: the original per-major goldens ran on
// ECC→UCR math / mech / econ / comm, and this repo carries agreements for
// three majors only (business, cs, psych — docs/PLAN.md). Those four
// hand-derivations are therefore about data this repo does not hold, and are
// gone rather than re-derived against a different major. What survives is what
// this module actually contributes — the baseline pinning and the ordering
// rule — re-expressed over the three majors the slice does carry.

const STUDENT: StudentProfile = {
  college: 'ecc',
  status: 'current',
  goal: 'transfer',
  gradTrack: 'associate',
  school: 'ucr',
  major: 'cs',
  fromMajor: null,
  // A CS-track student two calculus years in: the classic "what else could
  // my credits do?" profile.
  completed: ['MATH 190', 'MATH 191', 'MATH 220', 'CSCI 1', 'CSCI 2'],
  inProgress: [],
  exams: [],
  frenchBac: false,
  gpa: '3.2',
  startTerm: 'Fall 2026',
  termLoad: 'normal',
  ccEntryTerm: 'Fall 2025', // → Cal-GETC
  gePatternChoice: 'auto',
};

function inputsFor(major: MajorId): AuditInputs {
  return {
    requirementSet: getRequirements('ucr', major, 'ecc'), // college-aware (demo overlay + V1 fallback)
    associateDegree: getAssociateDegree(major),
    adtTemplate: getAdtTemplate(major),
    upperDivSet: getUpperDiv('ucr', major),
    collegeName: 'El Camino College',
    schoolName: 'UC Riverside',
    schoolSystem: 'UC',
    catalog: ECC_COURSES,
    gePattern: GE_PATTERNS.calgetc,
    eccgeAreas: ECC_GE_AREAS,
    examCourses: [],
    dataVersion: 'switch-golden',
  };
}

function candidateFor(major: MajorId): SwitchCandidate | null {
  const req = getRequirements('ucr', major, 'ecc');
  if (!req) return null;
  const meta = getMajor(major)!;
  return {
    major,
    majorName: meta.name,
    school: 'ucr',
    schoolName: 'UC Riverside',
    audit: runAudit({ ...STUDENT, major }, inputsFor(major)),
    provenance: req.meta.verification,
    notOffered: meta.notOfferedAt?.ucr,
  };
}

describe('major-switch goldens: ECC→UCR, CS student with the calc sequence done', () => {
  const majors: MajorId[] = ['cs', 'business', 'psych'];
  const matrix = buildSwitchMatrix(
    { major: 'cs', school: 'ucr' },
    majors.map(candidateFor).filter((c): c is SwitchCandidate => c != null),
  );
  const row = (m: MajorId) => matrix.rows.find((r) => r.major === m)!;

  it('current major (cs) is pinned as the baseline row', () => {
    expect(matrix.rows[0].major).toBe('cs');
    expect(matrix.rows[0].isCurrent).toBe(true);
    expect(matrix.baseline).toBe(matrix.rows[0]);
  });

  it('every candidate with an agreement produces exactly one row', () => {
    expect(matrix.rows.map((r) => r.major).sort()).toEqual(['business', 'cs', 'psych']);
  });

  it('psych: the one admission-gating math slot is covered — coverage 1', () => {
    // HAND-DERIVED from ucr.psych.ts: the agreement's only REQUIRED row is the
    // "Select 1" math group, whose members include MATH 9A ← MATH 190. This
    // student has MATH 190 → the group closes. The bio / physical-science /
    // two-additional rows are required:false (prose requirements completable
    // at UCR within a year), so they never enter the required tally.
    const r = row('psych');
    expect(r.prepTotal).toBe(1);
    expect(r.prepDone).toBe(1);
    expect(r.prepMissing).toBe(0);
    expect(r.coverage).toBe(1);
  });

  it('business: none of the six required slots is covered by a CS course load', () => {
    // HAND-DERIVED from ucr.business.ts: six required rows — BUS 10 ← BUS 101,
    // BUS 20 ← BUS 150, ECON 2 ← ECON 101, ECON 3 ← ECON 102, "Complete 1"
    // {MATH 22 ← MATH 165 | MATH 9A ← MATH 190}, "Complete 1" {STAT 8 ←
    // STAT C1000}. This student holds MATH 190, which closes the math group
    // and nothing else → 1 of 6.
    const r = row('business');
    expect(r.prepTotal).toBe(6);
    expect(r.prepDone).toBe(1);
    expect(r.prepMissing).toBe(5);
    expect(r.verdict).toBe('reach'); // required prep still missing dominates
  });

  it('ordering: non-baseline rows are sorted by coverage, best first', () => {
    // The engine's own rule (a floor-only major, coverage null, sorts as fully
    // covered). Asserted as a property so it survives a data refresh.
    const cov = matrix.rows.slice(1).map((r) => r.coverage ?? 1);
    expect(cov).toEqual([...cov].sort((a, b) => b - a));
    expect(matrix.rows.indexOf(row('psych'))).toBeLessThan(matrix.rows.indexOf(row('business')));
  });
});
