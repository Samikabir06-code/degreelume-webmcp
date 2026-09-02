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
// requirement modules (ecc.ucr.{math,mech,econ}.ts — themselves transcribed
// from the 2025-26 ASSIST pulls), never from engine output. Derivations are
// inline; if a data refresh changes an agreement, re-derive by hand.

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
  const majors: MajorId[] = ['cs', 'math', 'mech', 'econ'];
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

  it('math: 2/2 required rows covered — coverage 1.0, competitive (CNAS selective)', () => {
    // HAND-DERIVED from ecc.ucr.math.ts: two select-1 groups → requiredTotal 2.
    //  g1 member math-9a = rows {MATH 191, MATH 190} — both completed → closed.
    //  g2 member math-10a = row {MATH 220} — completed → closed.
    // GPA 3.2 ≥ 2.7 floor, no required missing, but impacted (CNAS screen)
    // → 'competitive', never 'eligible'.
    const r = row('math');
    expect(r.prepTotal).toBe(2);
    expect(r.prepDone).toBe(2);
    expect(r.prepMissing).toBe(0);
    expect(r.coverage).toBe(1);
    expect(r.verdict).toBe('competitive');
  });

  it('mech: 2/8 required rows covered — coverage 0.25, reach', () => {
    // RE-DERIVED BY HAND 2026-08-21, after the ASSIST re-pull corrected the
    // required/recommended flags (scripts/assist-repull.mjs).
    //
    // From data-sources/.../el-camino/agreements/uc-riverside__mech__2025-26.json,
    // whose ASSIST headings put the first block under "LOWER DIVISION MAJOR
    // REQUIREMENTS" and MATH 10A / MATH 46 / STAT 10 under a recommended one:
    //   5 plain required rows — PHYS 40A(←PHYS 1A), CHEM 1A(←CHEM 1A+1B, split
    //     into two rows), MATH 9A(←MATH 191+190, split into two rows)
    //   1 select-3 group g2-n3 over 4 members — ME 9(←CADD 7|5), ME 10(←ENGR 9),
    //     PHYS 40B(←PHYS 1B), PHYS 40C(←PHYS 1C)
    //   → requiredTotal 5 + 3 = 8.
    // The student has MATH 190 + MATH 191, covering both MATH 9A rows → done 2.
    // Nothing in the select-3 group is covered → 3 short. missing 3 + 3 = 6.
    //
    // Was 10/3/0.3: MATH 10A (←MATH 220, which this student HAS) used to be
    // marked required. ASSIST lists it as recommended, so it no longer counts
    // toward required prep — the correction, visible in a golden.
    const r = row('mech');
    expect(r.prepTotal).toBe(8);
    expect(r.prepDone).toBe(2);
    expect(r.prepMissing).toBe(6);
    expect(r.coverage).toBeCloseTo(0.25, 10);
    expect(r.verdict).toBe('reach');
  });

  it('econ: the one genuinely required row is covered — coverage 1, eligible', () => {
    // RE-DERIVED BY HAND 2026-08-21, after the ASSIST re-pull.
    //
    // The raw payload's own headings decide this, and they are unambiguous:
    //   TITLE "LOWER DIVISION MAJOR REQUIREMENTS" → MATH 9A     → required
    //   TITLE "STRONGLY RECOMMENDED COURSES"      → ECON 2,
    //                                                ECON 3,
    //                                                MATH 9B    → recommended
    // → requiredTotal 1. The student has MATH 190, which articulates to
    // MATH 9A → done 1, missing 0, coverage 1.
    //
    // Was 0/null/'competitive': every row read as recommended, because
    // `required` was taken from the nearest heading and "STRONGLY RECOMMENDED
    // COURSES" reached the block above it. UCR does list most prep as
    // recommended — but not this row.
    //
    // The verdict moves with it, and correctly. econ.facts.json is
    // impacted:false, gpaTarget 2.4; this student is at 3.2 with every
    // required row done, which is the definition of 'eligible'. It only read
    // 'competitive' before because requiredTotal was 0 — "nothing missing, but
    // nothing all-done either". Compare math above, which stays 'competitive'
    // with full coverage because CNAS genuinely screens (impacted:true).
    const r = row('econ');
    expect(r.prepTotal).toBe(1);
    expect(r.prepDone).toBe(1);
    expect(r.prepMissing).toBe(0);
    expect(r.coverage).toBe(1);
    expect(r.verdict).toBe('eligible');
  });

  it('ordering: fully-covered math and econ sort above mech (0.25)', () => {
    const order = matrix.rows.map((r) => r.major);
    expect(order[0]).toBe('cs');
    expect(order.indexOf('math')).toBeLessThan(order.indexOf('mech'));
    expect(order.indexOf('econ')).toBeLessThan(order.indexOf('mech'));
  });

  it('not-offered metadata flows from majors.ts, never invented by the engine', () => {
    const comm = candidateFor('comm')!;
    expect(comm.notOffered?.closestName).toBe('Media and Cultural Studies, B.A.');
    const m = buildSwitchMatrix({ major: 'cs', school: 'ucr' }, [comm]);
    expect(m.rows[0].notOffered?.closestName).toBe('Media and Cultural Studies, B.A.');
  });
});
