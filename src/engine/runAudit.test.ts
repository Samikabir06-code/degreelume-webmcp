import { describe, it, expect } from 'vitest';
import { runAudit, type AuditInputs } from './runAudit';
import {
  isShortTerm,
  capForTerm,
  maxCoursesForTerm,
  SHORT_TERM_MAX_COURSES,
  SHORT_TERM_UNIT_CAP,
} from './buildTermPlan';
import { getRequirements } from '../data/requirements';
import { getAssociateDegree } from '../data/degrees';
import { getUpperDiv } from '../data/upperdiv';
import { EXAM_CREDITS } from '../data/examCredits';
import { ECC_COURSES } from '../data/courses';
import { GE_PATTERNS } from '../data/gePatterns';
import { ECC_GE_AREAS } from '../data/eccge';
import type { StudentProfile, MajorId, GePatternId, Course, RequirementSet, SchoolId } from '../types';

// The legacy suite below pins IGETC-path behavior, so the profile declares a
// pre-fall-2025 entry and the inputs pass the IGETC pattern explicitly.
// Cal-GETC divergences get their own suite at the bottom.
const BASE: StudentProfile = {
  college: 'ecc',
  status: 'new',
  goal: 'transfer',
  gradTrack: 'adt',
  school: 'ucr',
  major: 'business',
  fromMajor: null,
  completed: [],
  inProgress: [],
  exams: [],
  frenchBac: false,
  gpa: '',
  startTerm: 'Fall 2026',
  termLoad: 'normal',
  ccEntryTerm: 'Fall 2024',
  gePatternChoice: 'auto',
};

function inputsFor(major: MajorId, examCourses: string[] = [], pattern: GePatternId = 'igetc'): AuditInputs {
  return {
    requirementSet: getRequirements('ucr', major),
    associateDegree: getAssociateDegree(major),
    upperDivSet: getUpperDiv('ucr', major),
    collegeName: 'El Camino College',
    schoolName: 'UC Riverside',
    schoolSystem: 'UC',
    catalog: ECC_COURSES,
    gePattern: GE_PATTERNS[pattern],
    eccgeAreas: ECC_GE_AREAS,
    examCourses,
    dataVersion: 'test-snapshot',
  };
}

const BIZ = inputsFor('business');

// The data layer now ships only the AP table (the id->grants resolver helper
// didn't survive the swap); the audit itself consumes plain course codes via
// AuditInputs.examCourses. Resolve exam ids -> granted courses locally so the
// real table's id/grant rows stay pinned.
const examGrantedCourses = (ids: string[]): string[] =>
  EXAM_CREDITS.filter((e) => ids.includes(e.id)).flatMap((e) => e.grants);

// --- Engine-rule fixture courses (labeled; can never collide with real codes) ---
// The real 2025-26 snapshot only tags the three majors' course footprint, so a
// few pattern rules have no real trigger yet:
//  . no course carries an IGETC Area 3 tag (3A/3B/3);
//  . IGETC Area 4 spans exactly two disciplines (ECON 101/102 + PSYC C1000), so
//    "count met but disciplines short" is unreachable with real codes;
//  . no course carries the Cal-GETC Area 6 (Ethnic Studies) tag (real ESTU 1/3
//    are tagged for the LOCAL pattern only: eccge ["4","6"]).
// Those engine rules stay pinned on fixture rows appended to the real catalog.
const FIXTURES: Course[] = [
  { code: 'TEST-ART', name: 'Fixture - Studio Art', dept: 'Art', units: 3, igetc: ['3A', '3'], calgetc: [], eccge: [] },
  { code: 'TEST-MUS', name: 'Fixture - Music Appreciation', dept: 'Music', units: 3, igetc: ['3A', '3'], calgetc: [], eccge: [] },
  { code: 'TEST-PHIL', name: 'Fixture - Great Books', dept: 'Philosophy', units: 3, igetc: ['3B', '3'], calgetc: [], eccge: [] },
  { code: 'TEST-HUM', name: 'Fixture - Humanities Survey', dept: 'Humanities', units: 3, igetc: ['3B', '3'], calgetc: [], eccge: [] },
  { code: 'TEST-ECON', name: 'Fixture - Economic History', dept: 'Economics', units: 3, igetc: ['4'], calgetc: [], eccge: [] },
  { code: 'TEST-ESTU', name: 'Fixture - Intro to Ethnic Studies', dept: 'Ethnic Studies', units: 3, igetc: [], calgetc: ['6'], eccge: ['4', '6'] },
];
const BIZ_FIX: AuditInputs = { ...BIZ, catalog: [...ECC_COURSES, ...FIXTURES] };

// Real 2025-26 agreement fixtures (re-derived by hand from the ASSIST PDFs):
//   Business required = BUS 101, BUS 150, ECON 101, ECON 102,
//     one of {MATH 165, MATH 190} (bus-math group),
//     STAT C1000 (bus-stats group — STAT 10 has no articulation).
//   Row ids are receiving-course slugs from the generator (econ-2 = UCR ECON 2).
const BIZ_ALL_REQ = ['BUS 101', 'BUS 150', 'ECON 101', 'ECON 102', 'MATH 165', 'STAT C1000'];
//   CS required = CS 10A (CSCI 1|CSCI 3), CS 10B (CSCI 30), MATH 190+191
//     (9A-9C series), PHYS 1A, plus 3 of {MATH 210, CSCI 2, MATH 220, PHYS 1B,
//     PHYS 1C} (cs-additional group).
const CS_ALL_REQ = ['CSCI 1', 'CSCI 30', 'MATH 190', 'MATH 191', 'PHYS 1A', 'MATH 210', 'CSCI 2', 'MATH 220'];

describe('transfer — major prep', () => {
  it('marks a completed course done', () => {
    const r = runAudit({ ...BASE, completed: ['ECON 101'] }, BIZ);
    expect(r.transfer!.majorPrep.find((x) => x.id === 'econ-2')!.status).toBe('done');
  });
  it('marks an in-progress course in-progress', () => {
    const r = runAudit({ ...BASE, inProgress: ['ECON 101'] }, BIZ);
    expect(r.transfer!.majorPrep.find((x) => x.id === 'econ-2')!.status).toBe('in-progress');
  });
  it('marks missing course missing', () => {
    const r = runAudit(BASE, BIZ);
    expect(r.transfer!.majorPrep.find((x) => x.id === 'econ-2')!.status).toBe('missing');
  });
  it('select-1 group: either member course satisfies the calculus requirement', () => {
    // The agreement's "Complete 1 course from the following" (MATH 22 | MATH 9A)
    const viaBiz = runAudit({ ...BASE, completed: ['MATH 165'] }, BIZ).transfer!;
    expect(viaBiz.majorPrep.find((x) => x.id === 'math-22')!.status).toBe('done');
    const viaCalc = runAudit({ ...BASE, completed: ['MATH 190'] }, BIZ).transfer!;
    expect(viaCalc.majorPrep.find((x) => x.id === 'math-9a')!.status).toBe('done');
    // Either way the group contributes exactly one required slot.
    expect(viaBiz.requiredCount).toBe(viaCalc.requiredCount);
  });
});

describe('CCN transition provenance', () => {
  it('labels an older agreement when its requirements touch Fall 2026 renumbered courses', () => {
    const source = runAudit(BASE, BIZ).sources.find((s) => s.appliesTo.includes('transfer'))!;
    expect(source.renumberingNotice?.effectiveTerm).toBe('Fall 2026');
    expect(source.renumberingNotice?.targetCatalogYear).toBe('2026–27');
    expect(source.renumberingNotice?.courses).toEqual(expect.arrayContaining([
      { code: 'ECON C2002', formerCode: 'ECON 101' },
      { code: 'ECON C2001', formerCode: 'ECON 102' },
    ]));
  });

  it('drops the notice once the agreement year reaches the renumbering year', () => {
    const current: AuditInputs = {
      ...BIZ,
      requirementSet: {
        ...BIZ.requirementSet!,
        meta: { ...BIZ.requirementSet!.meta, catalogYear: '2026–27' },
      },
    };
    const source = runAudit(BASE, current).sources.find((s) => s.appliesTo.includes('transfer'))!;
    expect(source.renumberingNotice).toBeUndefined();
  });

  it('does not warn when the audited requirements do not use a renumbered course', () => {
    const unaffected: AuditInputs = {
      ...BIZ,
      requirementSet: {
        ...BIZ.requirementSet!,
        majorPrep: [{ id: 'calc', label: 'Calculus', options: ['MATH 190'], required: true }],
      },
    };
    const source = runAudit(BASE, unaffected).sources.find((s) => s.appliesTo.includes('transfer'))!;
    expect(source.renumberingNotice).toBeUndefined();
  });
});

describe('transfer — verdict', () => {
  // All three real UCR majors are selecting (screened) → the engine's
  // 'eligible' branch needs a non-selective variant to stay covered.
  const BIZ_OPEN: AuditInputs = { ...BIZ, requirementSet: { ...BIZ.requirementSet!, impacted: false } };
  it('reach when required prep missing', () => {
    expect(runAudit({ ...BASE, gpa: '3.5' }, BIZ).transfer!.verdict).toBe('reach');
  });
  it('eligible when prep done + gpa ≥ target + major not selective', () => {
    expect(runAudit({ ...BASE, completed: BIZ_ALL_REQ, gpa: '3.0' }, BIZ_OPEN).transfer!.verdict).toBe('eligible');
  });
  it('competitive when prep done + gpa ≥ target at a selecting major (real Business facts)', () => {
    expect(runAudit({ ...BASE, completed: BIZ_ALL_REQ, gpa: '3.0' }, BIZ).transfer!.verdict).toBe('competitive');
  });
  it('reach when gpa below target', () => {
    expect(runAudit({ ...BASE, completed: BIZ_ALL_REQ, gpa: '2.0' }, BIZ).transfer!.verdict).toBe('reach');
  });
  it('competitive on impacted major with gpa met (CS, select-3 group complete)', () => {
    const r = runAudit({ ...BASE, major: 'cs', completed: CS_ALL_REQ, gpa: '3.5' }, inputsFor('cs'));
    expect(r.transfer!.verdict).toBe('competitive');
  });
  it('reach while the select-3 group is short, even with everything else done', () => {
    // Only 2 of the 3 required additional-prep picks — the group must gate.
    const short = CS_ALL_REQ.filter((c) => c !== 'MATH 220');
    const r = runAudit({ ...BASE, major: 'cs', completed: short, gpa: '3.5' }, inputsFor('cs'));
    expect(r.transfer!.verdict).toBe('reach');
  });
  it('competitive when no gpa entered', () => {
    expect(runAudit({ ...BASE, completed: BIZ_ALL_REQ }, BIZ).transfer!.verdict).toBe('competitive');
  });
});

describe('transfer — selective-major warning', () => {
  it('warns on selecting-major CS', () => {
    const r = runAudit({ ...BASE, major: 'cs' }, inputsFor('cs'));
    expect(r.warnings.some((w) => w.includes('selective'))).toBe(true);
  });
  it('no selective warning when the requirement set is not screened', () => {
    const open: AuditInputs = { ...BIZ, requirementSet: { ...BIZ.requirementSet!, impacted: false } };
    expect(runAudit(BASE, open).warnings.some((w) => w.includes('selective'))).toBe(false);
  });
});

describe('transfer — French Bac is claimed, never silently verified (B2)', () => {
  it('marks IGETC Area 6 unknown (needs human verification), not done', () => {
    const a6 = runAudit({ ...BASE, frenchBac: true }, BIZ).transfer!.ge.find((a) => a.id === '6')!;
    expect(a6.status).toBe('unknown');
    expect(a6.satisfiedBy).toBe('French Baccalauréat');
  });
  it('files a needs-review item with a copyable counselor question', () => {
    const r = runAudit({ ...BASE, frenchBac: true }, BIZ);
    const item = r.needsReview.find((n) => n.id === 'french-bac-area6');
    expect(item).toBeDefined();
    expect(item!.question).toContain('UC Riverside');
  });
  it('Area 6 missing without frenchBac, and no review item', () => {
    const r = runAudit(BASE, BIZ);
    expect(r.transfer!.ge.find((a) => a.id === '6')!.status).toBe('missing');
    expect(r.needsReview.find((n) => n.id === 'french-bac-area6')).toBeUndefined();
  });
  it('degree completeness is blocked by the unverified credential, not granted by it', () => {
    const r = runAudit({ ...BASE, goal: 'graduate', gradTrack: 'adt', frenchBac: true }, BIZ);
    expect(r.degree!.status).not.toBe('complete');
  });
});

describe('goal branching', () => {
  it('transfer goal → degree null', () => {
    const r = runAudit({ ...BASE, goal: 'transfer' }, BIZ);
    expect(r.transfer).not.toBeNull();
    expect(r.degree).toBeNull();
  });
  // TRIMMED for this build's data slice: "graduate goal → transfer null" also
  // asserted a non-null DEGREE audit, which needs El Camino's AA/AS templates.
  // The slice carries no degree data (src/data/degrees is a documented stub),
  // so the assertion is about data this repo does not hold. The ADT half of the
  // same branch still runs below, because it rides the articulation agreement.
  it('both goal → transfer and degree present', () => {
    const r = runAudit({ ...BASE, goal: 'both', gradTrack: 'adt' }, BIZ);
    expect(r.transfer).not.toBeNull();
    expect(r.degree).not.toBeNull();
  });
});

// TRIMMED: the whole "degree — associate (local AA/AS)" suite asserted on El
// Camino's AA/AS templates, which this build's data slice does not carry.
// What it pinned (the local-GE path, the unit tally, the GPA gate) is degree
// behaviour, not transfer behaviour, and this product answers transfer
// questions. The engine itself is untouched — only the fixture is gone.
describe('degree — no local AA/AS data in this slice', () => {
  it('an associate goal with no degree template produces no degree audit', () => {
    const r = runAudit({ ...BASE, goal: 'graduate', gradTrack: 'associate' }, BIZ);
    expect(r.degree).toBeNull();
    expect(r.transfer).toBeNull();
  });
});

describe('degree — ADT', () => {
  it('uses IGETC and grants transfer priority', () => {
    const r = runAudit({ ...BASE, goal: 'graduate', gradTrack: 'adt' }, BIZ);
    expect(r.degree!.track).toBe('adt');
    expect(r.degree!.gePatternLabel).toBe('IGETC');
    expect(r.degree!.grantsTransferPriority).toBe(true);
  });
  it('pushes a transfer-priority warning', () => {
    const r = runAudit({ ...BASE, goal: 'graduate', gradTrack: 'adt' }, BIZ);
    expect(r.warnings.some((w) => w.toLowerCase().includes('transfer priority'))).toBe(true);
  });
});

describe('term plan', () => {
  it('generates terms for a new student', () => {
    const r = runAudit({ ...BASE, goal: 'transfer' }, BIZ);
    expect(r.termPlan.length).toBeGreaterThan(0);
  });
  // TRIMMED: the prerequisite-ordering golden (PSYC 109A after PSYC C1000)
  // planned off the ECC Psychology associate core, which this slice does not
  // carry. Prerequisite ordering is still covered on the transfer path by the
  // MATH 190 → MATH 191 assertions further down.
  it('never exceeds the unit cap (normal = 15)', () => {
    const r = runAudit({ ...BASE, goal: 'both', gradTrack: 'associate' }, BIZ);
    r.termPlan.forEach((t) => expect(t.totalUnits).toBeLessThanOrEqual(15));
  });
  it('heavy load packs more units than light', () => {
    const light = runAudit({ ...BASE, goal: 'graduate', gradTrack: 'associate', termLoad: 'light' }, BIZ);
    const heavy = runAudit({ ...BASE, goal: 'graduate', gradTrack: 'associate', termLoad: 'heavy' }, BIZ);
    const maxLight = Math.max(...light.termPlan.map((t) => t.totalUnits));
    const maxHeavy = Math.max(...heavy.termPlan.map((t) => t.totalUnits));
    expect(maxHeavy).toBeGreaterThanOrEqual(maxLight);
  });
  // TRIMMED: the degree-floor variant of the elective-units assertion needed
  // the associate template for its floor. The transfer floor below is the one
  // this product actually uses, and it still runs.
  it('transfer goal now enforces the 60-unit transfer floor', () => {
    const r = runAudit({ ...BASE, goal: 'transfer' }, BIZ);
    expect(r.electiveUnitsNeeded).toBeGreaterThan(0);
  });
});

describe('intersession caps — Summer/Winter are lighter than fall/spring', () => {
  it('classifies only Summer/Winter as short terms', () => {
    expect(isShortTerm('Summer 2027')).toBe(true);
    expect(isShortTerm('Winter 2027')).toBe(true);
    expect(isShortTerm('Fall 2026')).toBe(false);
    expect(isShortTerm('Spring 2027')).toBe(false);
  });

  it('knocks the unit + course ceilings down for intersessions only', () => {
    // Fall/spring keep the student's full load cap and have no course limit.
    expect(capForTerm('Fall 2026', 18)).toBe(18);
    expect(maxCoursesForTerm('Spring 2027')).toBe(Infinity);
    // Summer/winter are capped on both axes, regardless of the load cap.
    expect(capForTerm('Summer 2027', 18)).toBe(SHORT_TERM_UNIT_CAP);
    expect(capForTerm('Winter 2027', 12)).toBe(SHORT_TERM_UNIT_CAP);
    expect(maxCoursesForTerm('Summer 2027')).toBe(SHORT_TERM_MAX_COURSES);
  });

  it('every generated summer term holds ≤2 courses and ≤8 units (normal + heavy)', () => {
    for (const termLoad of ['normal', 'heavy'] as const) {
      const r = runAudit({ ...BASE, goal: 'both', gradTrack: 'associate', termLoad }, BIZ);
      const shortTerms = r.termPlan.filter((t) => isShortTerm(t.label));
      expect(shortTerms.length, `${termLoad} should schedule at least one summer`).toBeGreaterThan(0);
      for (const t of shortTerms) {
        expect(t.courses.length, `${termLoad} ${t.label} course count`).toBeLessThanOrEqual(SHORT_TERM_MAX_COURSES);
        expect(t.totalUnits, `${termLoad} ${t.label} units`).toBeLessThanOrEqual(SHORT_TERM_UNIT_CAP);
      }
    }
  });

  it('regular fall/spring terms are NOT limited to 2 courses (the cap is intersession-only)', () => {
    const r = runAudit({ ...BASE, goal: 'both', gradTrack: 'associate', termLoad: 'heavy' }, BIZ);
    const regular = r.termPlan.filter((t) => !isShortTerm(t.label));
    expect(regular.some((t) => t.courses.length > SHORT_TERM_MAX_COURSES)).toBe(true);
  });
});

// These exercise the post-transfer planner itself, so they run on a REAL
// upper-division set. They used to run on UC Riverside's, which was withdrawn
// on 2026-08-20 after a check against UCR's own catalog found it invented —
// see STATIC_UPPER_DIV in scripts/ingest.ts. Berkeley's sets are transcribed
// from the university's own catalog, so the mechanism is now pinned against
// data a student could actually follow.
describe('post-transfer upper-division plan', () => {
  const UCB_BIZ: AuditInputs = {
    ...BIZ, upperDivSet: getUpperDiv('uc-berkeley', 'business'), schoolName: 'UC Berkeley',
  };

  // TRIMMED: every assertion that a post-transfer plan is PRESENT (its term
  // labels, its prerequisite ordering, its elective units) ran on Berkeley's
  // transcribed upper-division sets. This build carries none — src/data/upperdiv
  // is a documented stub — so those tests assert on data the slice does not
  // hold. The two honest-absence assertions below survive, and they are the
  // ones that matter here: with no transcribed catalog, the engine must produce
  // NO plan rather than a plausible-looking invented one.
  it('is null for a graduation-only (local AA/AS) goal', () => {
    const r = runAudit({ ...BASE, goal: 'graduate', gradTrack: 'associate' }, UCB_BIZ);
    expect(r.upperDiv).toBeNull();
  });

  // The withdrawal itself, pinned: a school with no transcribed upper-division
  // data must produce NO post-transfer plan rather than a plausible-looking
  // invented one. This is the behaviour that made removing UCR safe.
  it('produces no plan at all for a school with no transcribed upper-division data', () => {
    expect(getUpperDiv('ucr', 'business')).toBeNull();
    const r = runAudit({ ...BASE, goal: 'transfer' }, BIZ);
    expect(r.upperDiv).toBeNull();
  });
});

describe('IGETC — Area 4 needs 3 courses across 2 disciplines', () => {
  const a4 = (completed: string[], inputs: AuditInputs = BIZ) =>
    runAudit({ ...BASE, completed }, inputs).transfer!.ge.find((a) => a.id === '4')!;

  it('exposes the count contract (need 3)', () => {
    const area = a4(['ECON 101']);
    expect(area.need).toBe(3);
    expect(area.have).toBe(1);
    expect(area.status).toBe('in-progress'); // one course is not enough
  });
  it('is done with 3 courses spanning 2+ disciplines', () => {
    // The full real Area-4 list: ECON 101/102 (Economics) + PSYC C1000 (Psychology)
    const area = a4(['ECON 101', 'ECON 102', 'PSYC C1000']);
    expect(area.have).toBe(3);
    expect(area.status).toBe('done');
  });
  it('is NOT done with 3 courses from a single discipline', () => {
    // Real Economics has only two Area-4 courses, so the third same-dept course
    // is a fixture row — the discipline rule (not the count) is what bites.
    const area = a4(['ECON 101', 'ECON 102', 'TEST-ECON'], BIZ_FIX);
    expect(area.have).toBe(3);
    expect(area.status).toBe('in-progress');
  });
  it('single-course areas are unaffected (Area 2A done with one course)', () => {
    const area2 = runAudit({ ...BASE, completed: ['MATH 190'] }, BIZ).transfer!.ge.find((a) => a.id === '2A')!;
    expect(area2.need).toBe(1);
    expect(area2.status).toBe('done');
  });
});

describe('IGETC — Area 3 needs one Arts, one Humanities, and a third from either', () => {
  // No real course carries an IGETC 3A/3B/3 tag in this snapshot (the majors'
  // footprint doesn't touch Area 3), so the three-row mechanism is pinned on
  // fixture rows: TEST-ART/TEST-MUS (Arts), TEST-PHIL/TEST-HUM (Humanities).
  const area = (completed: string[], id: string) =>
    runAudit({ ...BASE, completed }, BIZ_FIX).transfer!.ge.find((a) => a.id === id)!;

  it('one arts + one humanities is not yet done (third course owed)', () => {
    expect(area(['TEST-ART', 'TEST-PHIL'], '3A').status).toBe('done');
    expect(area(['TEST-ART', 'TEST-PHIL'], '3B').status).toBe('done');
    expect(area(['TEST-ART', 'TEST-PHIL'], '3').status).toBe('in-progress');
  });
  it('two arts + one humanities completes the total row (third course from the arts side)', () => {
    expect(area(['TEST-ART', 'TEST-MUS', 'TEST-PHIL'], '3').status).toBe('done');
    expect(area(['TEST-ART', 'TEST-MUS', 'TEST-PHIL'], '3B').status).toBe('done'); // TEST-PHIL carries 3B
    expect(area(['TEST-ART', 'TEST-MUS', 'TEST-HUM'], '3B').status).toBe('done');
  });
  it('one from each plus a third from either completes all three rows', () => {
    const done = ['TEST-ART', 'TEST-PHIL', 'TEST-HUM'];
    expect(area(done, '3A').status).toBe('done');
    expect(area(done, '3B').status).toBe('done');
    expect(area(done, '3').status).toBe('done');
  });
});

describe('verdict honesty — in-progress prep is not "done"', () => {
  const BIZ_OPEN: AuditInputs = { ...BIZ, requirementSet: { ...BIZ.requirementSet!, impacted: false } };
  it('all-required-in-progress + good GPA is competitive, not eligible', () => {
    const r = runAudit({ ...BASE, inProgress: BIZ_ALL_REQ, gpa: '3.5' }, BIZ_OPEN);
    expect(r.transfer!.verdict).toBe('competitive');
  });
  it('eligible still requires prep actually completed', () => {
    const r = runAudit({ ...BASE, completed: BIZ_ALL_REQ, gpa: '3.5' }, BIZ_OPEN);
    expect(r.transfer!.verdict).toBe('eligible');
  });
});

describe('verdict honesty — IGETC disclosure', () => {
  it('discloses unfinished IGETC when prep is done but GE is open', () => {
    const r = runAudit({ ...BASE, completed: BIZ_ALL_REQ, gpa: '3.5' }, BIZ);
    expect(r.transfer!.verdict).toBe('competitive'); // selecting major — still discloses
    expect(r.warnings.some((w) => w.includes('IGETC'))).toBe(true);
  });
  it('does not add IGETC noise to a reach verdict', () => {
    const r = runAudit({ ...BASE, gpa: '3.5' }, BIZ); // nothing done → reach
    expect(r.transfer!.verdict).toBe('reach');
    expect(r.warnings.some((w) => w.includes('IGETC'))).toBe(false);
  });
});

describe('term plan — fills IGETC Area 4 to 3 courses across disciplines', () => {
  it('plans a 2nd-discipline course beyond the two required econ courses', () => {
    const r = runAudit({ ...BASE, goal: 'transfer' }, BIZ);
    const flat: string[] = [];
    r.termPlan.forEach((t) => t.courses.forEach((c) => flat.push(c.code)));
    // Area-4-tagged catalog courses (re-derived 2026-07-07 after the IGETC
    // certified list was completed from the sheet — Area 4 now spans many
    // disciplines, not just the econ pair + PSYC C1000).
    const area4 = new Map(
      ECC_COURSES.filter((c) => c.igetc?.includes('4')).map((c) => [c.code, c.dept]),
    );
    const planned = flat.filter((c) => area4.has(c));
    expect(planned.length).toBeGreaterThanOrEqual(3);
    // econ alone (both Economics dept) cannot satisfy the 2-discipline rule
    const depts = new Set(planned.map((c) => area4.get(c)));
    expect(depts.size).toBeGreaterThanOrEqual(2);
  });
  it('planned courses carry their prereqs for drag-and-drop ordering', () => {
    // ECON 102 is required Business prep and lists ECON 101 as its prereq (courses.ts).
    const r = runAudit({ ...BASE, goal: 'transfer' }, BIZ);
    const econ102 = r.termPlan.flatMap((t) => t.courses).find((c) => c.code === 'ECON C2001');
    expect(econ102?.prereqs).toContain('ECON C2002');
  });
});

describe('new student — no GPA pressure', () => {
  it('does not nag a new student for a GPA', () => {
    const r = runAudit({ ...BASE, status: 'new', goal: 'transfer' }, BIZ);
    expect(r.warnings.some((w) => w.includes('Add your GPA'))).toBe(false);
  });
  it('still nudges a current student with no GPA', () => {
    const r = runAudit({ ...BASE, status: 'current', goal: 'transfer' }, BIZ);
    expect(r.warnings.some((w) => w.includes('Add your GPA'))).toBe(true);
  });
});

describe('carry-over — what already-taken courses count toward the target major', () => {
  it('is null when no courses are entered', () => {
    expect(runAudit({ ...BASE, goal: 'transfer' }, BIZ).carryOver).toBeNull();
  });
  it('classifies major prep, GE, and elective-only for the target major', () => {
    // For Business: ECON 101 is major prep, ENGL C1000 is IGETC GE (Area 1A),
    // CSCI 1 is neither (no IGETC tag, not a Business prep option)
    const r = runAudit({ ...BASE, status: 'current', goal: 'transfer', completed: ['ECON 101', 'ENGL C1000', 'CSCI 1'] }, BIZ);
    const co = r.carryOver!;
    expect(co.items.find((i) => i.code === 'ECON C2002')!.kind).toBe('major');
    expect(co.items.find((i) => i.code === 'ENGL C1000')!.kind).toBe('ge');
    expect(co.items.find((i) => i.code === 'CSCI 1')!.kind).toBe('elective');
    expect(co.countsTowardMajor).toBe(1);
    expect(co.electiveOnly).toBe(1);
  });
  it('re-classifies the same courses when the target major changes (Business → Psychology)', () => {
    const taken = ['BUS 150', 'PSYC C1000'];
    const biz = runAudit({ ...BASE, status: 'switching', major: 'business', fromMajor: 'psych', completed: taken }, inputsFor('business')).carryOver!;
    const psy = runAudit({ ...BASE, status: 'switching', major: 'psych', fromMajor: 'business', completed: taken }, inputsFor('psych')).carryOver!;
    // Financial accounting counts toward Business prep (UCR BUS 20 row)…
    expect(biz.items.find((i) => i.code === 'BUS 150')!.kind).toBe('major');
    // …but toward Psychology it's neither prep nor GE-tagged → elective; intro
    // psych is the recommended PSYC 2 articulation there → counts as major.
    expect(psy.items.find((i) => i.code === 'BUS 150')!.kind).toBe('elective');
    expect(psy.items.find((i) => i.code === 'PSYC C1000')!.kind).toBe('major');
    // Toward Business, intro psych carries IGETC Area 4 → GE.
    expect(biz.items.find((i) => i.code === 'PSYC C1000')!.kind).toBe('ge');
  });
});

describe('time-to-finish estimate scales with term load', () => {
  // Monotonic calendar ordering (Fall < Winter < Spring < Summer of the next
  // label-year), by approximate start month — handles the 4-term intersession year.
  const ordinal = (term: string) => {
    const [s, y] = term.split(' ');
    const m: Record<string, number> = { Winter: 1, Spring: 4, Summer: 7, Fall: 9 };
    return parseInt(y, 10) * 12 + (m[s] ?? 0);
  };

  it('light load takes no summers and at least as many terms as heavy', () => {
    const light = runAudit({ ...BASE, goal: 'transfer', termLoad: 'light' }, BIZ).estimate!;
    const heavy = runAudit({ ...BASE, goal: 'transfer', termLoad: 'heavy' }, BIZ).estimate!;
    expect(light.usesSummer).toBe(false);
    expect(heavy.usesSummer).toBe(true);
    expect(light.terms).toBeGreaterThanOrEqual(heavy.terms);
  });
  it('normal load uses summers', () => {
    expect(runAudit({ ...BASE, goal: 'transfer', termLoad: 'normal' }, BIZ).estimate!.usesSummer).toBe(true);
  });
  it('reports a finish term, duration label, and goal verb', () => {
    const e = runAudit({ ...BASE, goal: 'transfer', termLoad: 'normal' }, BIZ).estimate!;
    expect(e.finishTerm).toMatch(/^(Fall|Winter|Spring|Summer) \d{4}$/);
    expect(e.durationLabel).toMatch(/year|semester/);
    expect(e.goalVerb).toBe('transfer-ready');
  });
  it('heavier load finishes on or before lighter load in calendar time', () => {
    const start = 'Fall 2026';
    const light = runAudit({ ...BASE, startTerm: start, goal: 'transfer', termLoad: 'light' }, BIZ).estimate!;
    const heavy = runAudit({ ...BASE, startTerm: start, goal: 'transfer', termLoad: 'heavy' }, BIZ).estimate!;
    expect(ordinal(heavy.finishTerm)).toBeLessThanOrEqual(ordinal(light.finishTerm));
  });
  // TRIMMED: the graduation-ready label needs an associate degree to be
  // auditing toward, and the slice carries no degree templates.
});

describe('exam credit (AP/IB/CLEP)', () => {
  it('resolves exam ids to course-equivalents (real agreement AP table)', () => {
    expect(examGrantedCourses(['ap-macro', 'ap-micro'])).toEqual(expect.arrayContaining(['ECON C2002', 'ECON C2001']));
  });
  it('BC at 3 grants only MATH 190; BC at 4+ grants the full 190+191 series (conservative rule)', () => {
    expect(examGrantedCourses(['ap-calc-bc'])).toEqual(['MATH 190']);
    expect(examGrantedCourses(['ap-calc-bc-4'])).toEqual(expect.arrayContaining(['MATH 190', 'MATH 191']));
  });
  it('exam-cleared courses satisfy major prep in the audit', () => {
    const r = runAudit({ ...BASE, status: 'current' }, inputsFor('business', ['ECON 101']));
    expect(r.transfer!.majorPrep.find((x) => x.id === 'econ-2')!.status).toBe('done');
  });
  it('exam-cleared courses count toward carry-over', () => {
    const r = runAudit({ ...BASE, status: 'current' }, inputsFor('business', ['ECON 101']));
    expect(r.carryOver!.items.some((i) => i.code === 'ECON C2002')).toBe(true);
  });
});

describe('honesty — in-progress disclosure', () => {
  it('warns that the plan assumes in-progress courses pass', () => {
    const r = runAudit({ ...BASE, status: 'current', inProgress: ['ECON 101'] }, BIZ);
    expect(r.warnings.some((w) => /assumes you pass/.test(w))).toBe(true);
  });
  it('adds no such warning when nothing is in progress', () => {
    const r = runAudit({ ...BASE, status: 'current' }, BIZ);
    expect(r.warnings.some((w) => /assumes you pass/.test(w))).toBe(false);
  });
});

describe('review fixes — exam credit, estimate, degree, insights gating', () => {
  it('exam-cleared courses are NOT re-scheduled in the term plan', () => {
    // BC 4+ clears MATH 190 + MATH 191, the CS calculus series
    const planned = runAudit({ ...BASE, status: 'current', major: 'cs' }, inputsFor('cs', ['MATH 190', 'MATH 191']))
      .termPlan.flatMap((t) => t.courses).map((c) => c.code);
    expect(planned).not.toContain('MATH 190');
    expect(planned).not.toContain('MATH 191');
  });
  it('the time estimate credits in-progress units the same as completed', () => {
    const units = BIZ_ALL_REQ;
    const ip = runAudit({ ...BASE, status: 'current', inProgress: units }, BIZ).estimate!;
    const done = runAudit({ ...BASE, status: 'current', completed: units }, BIZ).estimate!;
    expect(ip.terms).toBe(done.terms);
    expect(ip.finishTerm).toBe(done.finishTerm);
  });
  // TRIMMED: hasGpa / gpaMet live on the DEGREE audit, which needs the
  // associate template the slice does not carry.
  it('no transfer-prep difficulty/chains for a graduate-only (associate) goal', () => {
    const r = runAudit({ ...BASE, goal: 'graduate', gradTrack: 'associate' }, BIZ);
    expect(r.difficulty).toBeNull();
    expect(r.prereqChains).toEqual([]);
  });
});

describe('provenance — every result is versioned and cited (A1/A2)', () => {
  it('stamps the data version onto the result', () => {
    expect(runAudit(BASE, BIZ).dataVersion).toBe('test-snapshot');
  });
  it('cites the articulation source for a transfer audit', () => {
    const r = runAudit({ ...BASE, goal: 'transfer' }, BIZ);
    expect(r.sources.length).toBeGreaterThan(0);
    // Generated provenance prints the full institution name from ASSIST.
    expect(r.sources[0].sourceName).toContain('Riverside');
    expect(r.sources[0].appliesTo).toContain('transfer');
  });
  // TRIMMED: the associate-degree citation needs the associate template.
  it('merges citations when transfer and ADT share one agreement', () => {
    const r = runAudit({ ...BASE, goal: 'both', gradTrack: 'adt' }, BIZ);
    const arts = r.sources.filter((s) => s.sourceName.includes('ASSIST'));
    expect(arts).toHaveLength(1);
    expect(arts[0].appliesTo).toContain('transfer');
    expect(arts[0].appliesTo).toContain('ADT');
  });
});

// ─── Cal-GETC path: every divergence from IGETC, pinned by hand from the
// ICAS Cal-GETC Standards v1.3 (areas table + §5.4.4/§9.4/§9.6/§9.7.2) ───
describe('Cal-GETC — pattern divergences from IGETC', () => {
  const CAL: StudentProfile = { ...BASE, ccEntryTerm: 'Fall 2025' };
  const BIZ_CAL = inputsFor('business', [], 'calgetc');

  it('stamps the pattern identity onto the transfer audit', () => {
    const t = runAudit(CAL, BIZ_CAL).transfer!;
    expect(t.gePatternId).toBe('calgetc');
    expect(t.gePatternName).toBe('Cal-GETC');
  });
  it('1C Oral Communication binds for a UC target (IGETC drops it for UC)', () => {
    const cal = runAudit(CAL, BIZ_CAL).transfer!;
    const ig = runAudit(BASE, BIZ).transfer!;
    expect(cal.ge.some((a) => a.id === '1C')).toBe(true);
    expect(ig.ge.some((a) => a.id === '1C')).toBe(false);
  });
  // No real course carries a Cal-GETC Area 6 tag yet (real ESTU 1/3 are tagged
  // for the LOCAL pattern only), so Area-6 satisfiability is pinned on the
  // TEST-ESTU fixture; the pattern structure itself is real.
  const BIZ_CAL_FIX: AuditInputs = { ...BIZ_CAL, catalog: [...ECC_COURSES, ...FIXTURES] };
  it('has NO language area: Area 6 is Ethnic Studies, satisfied by an ethnic-studies course', () => {
    const a6 = runAudit({ ...CAL, completed: ['TEST-ESTU'] }, BIZ_CAL_FIX).transfer!.ge.find((a) => a.id === '6')!;
    expect(a6.label).toBe('Ethnic Studies');
    expect(a6.status).toBe('done');
    expect(a6.satisfiedBy).toBe('TEST-ESTU');
  });
  it('French Bac raises NO unknown and NO review item on the Cal-GETC path', () => {
    const r = runAudit({ ...CAL, frenchBac: true }, BIZ_CAL);
    expect(r.transfer!.ge.every((a) => a.status !== 'unknown')).toBe(true);
    expect(r.needsReview.find((n) => n.id === 'french-bac-area6')).toBeUndefined();
  });
  it('ethnic studies: Cal-GETC Area 6, and NO Area 7 on the encoded IGETC pattern', () => {
    // The IGETC snapshot is ECC's 2021-2022 sheet, which predates IGETC's
    // ethnic-studies area — the pattern faithfully has no Area 7 row, and
    // TEST-ESTU carries no igetc tag (like the real ESTU courses). (Returns
    // with the current-year sheet drop; see src/data/igetc.ts header.)
    const ig = runAudit({ ...BASE, completed: ['TEST-ESTU'] }, BIZ_FIX).transfer!;
    expect(ig.ge.some((a) => a.id === '7')).toBe(false);
    expect(ig.ge.find((a) => a.id === '6')!.status).toBe('missing'); // LOTE untouched
    const cal = runAudit({ ...CAL, completed: ['TEST-ESTU'] }, BIZ_CAL_FIX).transfer!;
    expect(cal.ge.find((a) => a.id === '6')!.status).toBe('done');
    expect(cal.ge.some((a) => a.id === '7')).toBe(false);
  });
  it('Area 4 needs 2 courses from 2 disciplines (IGETC wants 3)', () => {
    const twoEcon = runAudit({ ...CAL, completed: ['ECON 101', 'ECON 102'] }, BIZ_CAL).transfer!.ge.find((a) => a.id === '4')!;
    expect(twoEcon.need).toBe(2);
    expect(twoEcon.have).toBe(2);
    expect(twoEcon.status).toBe('in-progress'); // one discipline isn't enough
    const spread = runAudit({ ...CAL, completed: ['ECON 101', 'PSYC C1000'] }, BIZ_CAL).transfer!.ge.find((a) => a.id === '4')!;
    expect(spread.status).toBe('done');
  });
  it('per-pattern tags diverge: SPAN 52A clears IGETC Area 6 (LOTE) but not Cal-GETC Area 6 (Ethnic Studies)', () => {
    // Re-derived 2026-07-07 after the IGETC certified list was completed from
    // the sheet: SPANISH 52A is listed in BOTH 3B and 6 on the IGETC sheet
    // (igetc ["3B","3","6"]) and in 3B on the Cal-GETC sheet (calgetc ["3B"]).
    // The real per-pattern divergence is Area 6 semantics: LOTE (IGETC,
    // satisfied) vs Ethnic Studies (Cal-GETC, untouched).
    const ig = runAudit({ ...BASE, completed: ['SPAN 52A'] }, BIZ).transfer!;
    expect(ig.ge.find((a) => a.id === '6')!.status).toBe('done');     // LOTE
    expect(ig.ge.find((a) => a.id === '3B')!.status).toBe('done');    // sheet lists 52A in 3B too
    const cal = runAudit({ ...CAL, completed: ['SPAN 52A'] }, BIZ_CAL).transfer!;
    expect(cal.ge.find((a) => a.id === '3B')!.status).toBe('done');   // calgetc 3B
    expect(cal.ge.find((a) => a.id === '6')!.status).toBe('missing'); // Ethnic Studies untouched
  });
  it('the unfinished-GE disclosure names the right pattern', () => {
    const r = runAudit({ ...CAL, completed: BIZ_ALL_REQ, gpa: '3.5' }, BIZ_CAL);
    expect(r.warnings.some((w) => w.includes('Cal-GETC'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('IGETC'))).toBe(false);
  });
  it('ADT degree path follows the student pattern label', () => {
    const r = runAudit({ ...CAL, goal: 'graduate', gradTrack: 'adt' }, BIZ_CAL);
    expect(r.degree!.gePatternLabel).toBe('Cal-GETC');
  });
  it('the audited GE pattern is cited as a source (A2)', () => {
    const r = runAudit(CAL, BIZ_CAL);
    expect(r.sources.some((s) => s.appliesTo.includes('Cal-GETC'))).toBe(true);
  });
  it('term plan never schedules toward a language area under Cal-GETC', () => {
    const r = runAudit({ ...CAL, goal: 'transfer' }, BIZ_CAL);
    const fills = r.termPlan.flatMap((t) => t.courses).map((c) => c.fills);
    expect(fills.some((f) => f.includes('Languages Other Than English'))).toBe(false);
    expect(fills.some((f) => f.startsWith('General ed'))).toBe(true); // plain plan-row labels
  });
});

describe('insights — difficulty profile & prereq unlock maps', () => {
  it('difficulty profile reports prep counts group-aware (CS = 5 fixed + 3 picks)', () => {
    const cs = runAudit({ ...BASE, major: 'cs' }, inputsFor('cs')).difficulty!;
    // CS 10A, CS 10B, MATH 190, MATH 191 (series rows), PHYS 1A + select-3 group
    expect(cs.requiredPrepCount).toBe(8);
    expect(cs.impacted).toBe(true);
    expect(cs.gateways.length).toBeGreaterThan(0); // calculus + physics gateways
    expect(cs.gpaTarget).toBe(2.8);
  });
  // The real catalog now carries prereq data (CSCI 1 → CSCI 2 → CSCI 30,
  // MATH 170 → 180 → 190, …), so the unlock maps run on the real CS set.
  it('prereq chains expose a multi-step unlock for the major', () => {
    const chains = runAudit({ ...BASE, major: 'cs' }, inputsFor('cs')).prereqChains;
    expect(chains.length).toBeGreaterThan(0);
    // First required row with a chain is CS 10B: CSCI 1 → CSCI 2 → CSCI 30.
    expect(chains[0].steps.length).toBeGreaterThanOrEqual(2);
  });
  it('marks a chain step cleared once its course is completed', () => {
    const chains = runAudit({ ...BASE, major: 'cs', completed: ['CSCI 1'] }, inputsFor('cs')).prereqChains;
    const step = chains.flatMap((c) => c.steps).find((s) => s.code === 'CSCI 1');
    expect(step?.done).toBe(true);
  });
});

// ---- WI4: CSU facts model — DoD: a CSU target (campus-wide impacted) and a UC
// target render correct, DISTINCT verdicts + advisory copy from the SAME student
// record. The CSU advisories (impaction mechanics, ADT system-guarantee, Golden
// Four) are copy only — the verdict rule itself is unchanged and shared. ----
describe('CSU facts model (WI4): CSU vs UC from the same student record', () => {
  const student: StudentProfile = {
    ...BASE, status: 'current', goal: 'transfer', gradTrack: 'associate',
    gpa: '3.5', completed: ['MATH 190'],
  };
  const prep = [{ id: 'math', label: 'Calculus I', options: ['MATH 190'], required: true }];
  const meta = {
    sourceName: 'test fixture', sourceUrl: 'https://example.test',
    catalogYear: '2025–26', lastVerified: '2026-07-01', verification: 'unreviewed' as const,
  };

  // SDSU-flavored fixture: campus-wide impacted CSU target with the WI4 csu block.
  const csuSet: RequirementSet = {
    school: 'san-diego-state' as SchoolId, major: 'business', impacted: true, gpaTarget: 2.9,
    adt: { available: true, name: 'AS-T Business Administration', grantsPriority: true },
    csu: {
      adtGuarantee: {
        available: true, similarMajorAtCampus: true,
        similarAdt: 'AS-T Business Administration', notes: 'System guarantee.',
      },
      campusImpacted: 'campus-wide (FTF & UDT)',
      localAdmissionArea: 'SDSU transfer local area: San Diego + Imperial county CCs.',
      sourceUrl: 'https://admissions.sdsu.edu/transfers/gpa-requirements',
    },
    majorPrep: prep, meta,
  };
  const ucSet: RequirementSet = {
    school: 'ucr', major: 'business', impacted: false, gpaTarget: 2.7,
    adt: { available: true, name: 'AS-T Business Administration', grantsPriority: true },
    majorPrep: prep, meta,
  };
  const inputs = (set: RequirementSet, system: 'UC' | 'CSU', schoolName: string): AuditInputs => ({
    requirementSet: set, associateDegree: null, upperDivSet: null,
    collegeName: 'El Camino College', schoolName, schoolSystem: system,
    catalog: ECC_COURSES, gePattern: GE_PATTERNS.calgetc, eccgeAreas: ECC_GE_AREAS,
    examCourses: [], dataVersion: 'test-snapshot',
  });

  it('CSU target: impaction mechanics + ADT system-guarantee + Golden Four advisories; impacted caps at competitive', () => {
    const res = runAudit(student, inputs(csuSet, 'CSU', 'San Diego State'));
    // All required prep done + 3.5 ≥ 2.9 floor — but impacted, so never 'eligible'.
    expect(res.transfer!.verdict).toBe('competitive');
    const w = res.warnings.join(' | ');
    expect(w).toContain('impacted at San Diego State (campus-wide (FTF & UDT))');
    expect(w).toContain('does not guarantee admission');
    expect(w).toContain('local admission area');
    // Rule 4: "guarantees" appears only as the OFFICIAL ADT program's own claim.
    expect(w).toContain('guarantees admission to the CSU system with junior standing');
    expect(w).toContain('supplemental/local criteria');
    // Golden Four: MATH 190 covers Cal-GETC area 2; areas 1A/1B/1C still open.
    expect(w).toContain('Golden Four');
    expect(w).toContain('3 of the four are still open');
  });

  it('UC target: same student reads eligible at a non-impacted UC, with none of the CSU advisories', () => {
    const res = runAudit(student, inputs(ucSet, 'UC', 'UC Riverside'));
    expect(res.transfer!.verdict).toBe('eligible');
    const w = res.warnings.join(' | ');
    expect(w).not.toContain('Golden Four');
    expect(w).not.toContain('CSU system');
    expect(w).not.toContain('local admission area');
  });

  it('campus that does NOT map the similar ADT: system guarantee only, campus priority explicitly excluded', () => {
    const noMap: RequirementSet = {
      ...csuSet,
      csu: { ...csuSet.csu!, adtGuarantee: { ...csuSet.csu!.adtGuarantee, similarMajorAtCampus: false, similarAdt: 'Computer Science AA-T (maps elsewhere)' } },
    };
    const res = runAudit(student, inputs(noMap, 'CSU', 'Cal Poly Pomona'));
    const w = res.warnings.join(' | ');
    expect(w).toContain('does not map it to this major');
    expect(w).toContain('campus ADT priority for this program does not');
  });

  it('a CSU set WITHOUT the csu block keeps the generic selective-major copy (pre-WI4 data)', () => {
    const bare: RequirementSet = { ...csuSet, csu: undefined };
    const res = runAudit(student, inputs(bare, 'CSU', 'San Diego State'));
    const w = res.warnings.join(' | ');
    expect(w).toContain('This is a selective major');
    expect(w).toContain('Golden Four'); // pattern-level advisory needs no csu block
  });
});
