import { describe, it, expect } from 'vitest';
import { runAudit, type AuditInputs } from './runAudit';
import { getRequirements } from '../data/requirements';
import { getAssociateDegree } from '../data/degrees';
import { getUpperDiv } from '../data/upperdiv';
import { ECC_COURSES } from '../data/courses';
import { GE_PATTERNS } from '../data/gePatterns';
import { ECC_GE_AREAS } from '../data/eccge';
import { demoProvenance } from '../data/meta';
import type { StudentProfile, MajorId, TransferAudit, GePatternId, AdtTemplate } from '../types';

// ─── Golden regression set (F1/A3) ───
//
// Hand-pinned cases per major. runAudit's correctness IS the product: if a
// data refresh or refactor shifts any pinned verdict or count, this suite
// fails and a human reviews the diff before anything ships. Expectations here
// are intentionally literal — do NOT compute them from the same data the
// engine reads.
//
// RE-DERIVED 2026-06-11 from the official 2025-26 ASSIST agreement PDFs in
// data-sources/assist-agreements/ (each pinned number traced to the printed
// agreement, not to engine output):
//   · Business — six lower-division prerequisites, exactly as the agreement
//     prints: BUS 10←BUS 101, BUS 20←BUS 150, ECON 2←ECON 101, ECON 3←ECON 102,
//     "Complete 1 course" {MATH 22←MATH 165 | MATH 9A←MATH 190}, "Complete 1
//     course" {STAT 8←STAT C1000 | STAT 10 (no articulation)}. GPA floor 2.7.
//   · CS — required for admission: CS 10A←(CSCI 1|CSCI 3), CS 10B←CSCI 30,
//     MATH 9A+9B+9C←MATH 190+MATH 191 (two rows after series split), PHYS 40A←
//     PHYS 1A, PLUS "Select 3 courses" of {CS 11←MATH 210, CS 10C←CSCI 2,
//     CS 61 (none), MATH 10A←MATH 220, PHYS 40B←PHYS 1B, PHYS 40C←PHYS 1C}
//     → 5 fixed slots + 3 picks = 8 required. GPA floor 2.8.
//   · Psychology — ONE admission-gating slot: "Select 1" of {MATH 4 (none),
//     MATH 5A←MATH 180 or (MATH 130 AND MATH 170), MATH 6A (none),
//     MATH 9A←MATH 190, MATH 22←MATH 165}. GPA floor 2.7. The biological /
//     physical / additional-two PROSE requirements ride as recommended rows
//     whose options live outside the catalog snapshot → 'unknown' + review
//     items until the catalog drop (B2 behavior, pinned below).
//
// DEGREE-PATH + CATALOG-SENSITIVE PINS RE-DERIVED 2026-07-01 after the atomic
// swap to the real 2025-26 ECC data: associate/ADT expectations now trace to
// degrees/business.associate.ts (Business Management, AS), the psych AA-T core
// (ECC's only psychology degree), degrees/adt/* (live Business AS-T and Psych
// AA-T templates; CS placeholder), and the deliberately-null CS associate
// degree. Two 2026-06-11 pins flipped with the catalog: the psych prose rows
// now resolve in-catalog (missing, not unknown), and no course yet carries a
// Cal-GETC Area 6 tag (ethnic studies stays honestly open until ECC's
// certified list drops). Each pinned value's hand derivation sits beside it.

const BASE: StudentProfile = {
  college: 'ecc',
  status: 'current',
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
  // Pinned cases below were authored on the IGETC path (pre-fall-2025 entry);
  // Cal-GETC goldens live in their own block and pass the pattern explicitly.
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
    dataVersion: 'golden-test',
  };
}

const audit = (major: MajorId, over: Partial<StudentProfile>, exams: string[] = []) =>
  runAudit({ ...BASE, major, ...over }, inputsFor(major, exams));

const prep = (t: TransferAudit, id: string) => t.majorPrep.find((r) => r.id === id)!;

// Every required-prep option set, copied by hand from the agreement PDFs:
const BIZ_ALL = ['BUS 101', 'BUS 150', 'ECON 101', 'ECON 102', 'MATH 165', 'STAT C1000'];
const CS_ALL = ['CSCI 1', 'CSCI 30', 'MATH 190', 'MATH 191', 'PHYS 1A', 'MATH 210', 'CSCI 2', 'MATH 220'];
const PSY_ALL = ['MATH 190']; // the one admission-gating slot

describe('golden · Business (UCR, selecting major, GPA min 2.7, six required slots)', () => {
  it('empty profile → reach, 0/6', () => {
    const t = audit('business', {}).transfer!;
    expect(t.verdict).toBe('reach');
    expect(t.prepDone).toBe(0);
    expect(t.requiredCount).toBe(6);
    expect(t.impacted).toBe(true); // selecting major (screened)
  });
  it('all required done + GPA 3.0 → competitive (selecting major — never eligible)', () => {
    const t = audit('business', { completed: BIZ_ALL, gpa: '3.0' }).transfer!;
    expect(t.verdict).toBe('competitive');
    expect(t.prepDone).toBe(6);
    expect(t.prepMissing).toBe(0);
  });
  it('GPA exactly at the 2.7 floor → competitive, not reach', () => {
    expect(audit('business', { completed: BIZ_ALL, gpa: '2.7' }).transfer!.verdict).toBe('competitive');
  });
  it('GPA 2.69 just below the floor → reach', () => {
    expect(audit('business', { completed: BIZ_ALL, gpa: '2.69' }).transfer!.verdict).toBe('reach');
  });
  it('all required done, no GPA entered → competitive (never eligible without proof)', () => {
    expect(audit('business', { completed: BIZ_ALL }).transfer!.verdict).toBe('competitive');
  });
  it('everything merely in progress + GPA 3.5 → competitive, not eligible', () => {
    const t = audit('business', { inProgress: BIZ_ALL, gpa: '3.5' }).transfer!;
    expect(t.verdict).toBe('competitive');
    expect(t.prepDone).toBe(0);
    expect(t.prepInProgress).toBe(6);
  });
  it('the calculus group accepts either printed alternative (MATH 165 or MATH 190)', () => {
    const viaBiz = audit('business', { completed: ['MATH 165'] }).transfer!;
    expect(prep(viaBiz, 'math-22').status).toBe('done');
    expect(viaBiz.prepDone).toBe(1);
    const viaCalc = audit('business', { completed: ['MATH 190'] }).transfer!;
    expect(prep(viaCalc, 'math-9a').status).toBe('done');
    expect(viaCalc.prepDone).toBe(1);
  });
  it('the stats group is satisfiable only via STAT C1000 (STAT 10 has no articulation)', () => {
    const t = audit('business', { completed: ['STAT C1000'] }).transfer!;
    expect(prep(t, 'stat-8').status).toBe('done');
    expect(prep(t, 'stat-8').satisfiedBy).toBe('STAT C1000');
    expect(t.prepDone).toBe(1);
    // The unarticulated STAT 10 member was dropped at ingestion — no row.
    expect(t.majorPrep.some((r) => r.id === 'stat-10')).toBe(false);
  });
  it('two of six done + good GPA is still reach (missing required prep dominates)', () => {
    const t = audit('business', { completed: ['ECON 101', 'BUS 101'], gpa: '3.2' }).transfer!;
    expect(t.verdict).toBe('reach');
    expect(t.prepDone).toBe(2);
  });
  it('exam credit clears macro + micro like completed courses (AP table)', () => {
    const t = audit('business', {}, ['ECON 101', 'ECON 102']).transfer!;
    expect(prep(t, 'econ-2').status).toBe('done');
    expect(prep(t, 'econ-3').status).toBe('done');
    expect(t.prepDone).toBe(2);
  });
  it('IGETC Area 4: two econ courses (one discipline) → in-progress, not done', () => {
    const a4 = audit('business', { completed: ['ECON 101', 'ECON 102'] }).transfer!.ge.find((a) => a.id === '4')!;
    expect(a4.have).toBe(2);
    expect(a4.need).toBe(3);
    expect(a4.status).toBe('in-progress');
  });
  it('IGETC Area 4: + PSYC C1000 (second discipline) → done', () => {
    const a4 = audit('business', { completed: ['ECON 101', 'ECON 102', 'PSYC C1000'] }).transfer!.ge.find((a) => a.id === '4')!;
    expect(a4.status).toBe('done');
  });
  it('clean profile carries no needs-review items', () => {
    expect(audit('business', { completed: BIZ_ALL, gpa: '3.0' }).needsReview).toEqual([]);
  });
  // TRIMMED for this build's data slice: the two Business Management AS
  // goldens were hand-derived from degrees/business.associate.ts, which this
  // repo does not carry (src/data/degrees is a documented stub). The ADT
  // golden below survives, because it rides the articulation agreement the
  // slice DOES hold.
  it('ADT track: IGETC pattern + grants transfer priority', () => {
    const d = audit('business', { goal: 'graduate', gradTrack: 'adt' }).degree!;
    expect(d.track).toBe('adt');
    expect(d.gePatternLabel).toBe('IGETC');
    expect(d.grantsTransferPriority).toBe(true);
  });
});

describe('golden · Computer Science (UCR, selecting major, GPA min 2.8, 5 fixed + select-3 = 8 slots)', () => {
  it('empty profile → reach, 0/8, selective-review warning shown', () => {
    const r = audit('cs', {});
    expect(r.transfer!.verdict).toBe('reach');
    expect(r.transfer!.requiredCount).toBe(8);
    expect(r.transfer!.impacted).toBe(true);
    expect(r.warnings.some((w) => w.includes('selective'))).toBe(true);
  });
  it('all required done + GPA 3.5 → competitive, NEVER eligible (selection cap)', () => {
    const t = audit('cs', { completed: CS_ALL, gpa: '3.5' }).transfer!;
    expect(t.verdict).toBe('competitive');
    expect(t.prepDone).toBe(8);
  });
  it('GPA exactly at the 2.8 floor → competitive', () => {
    expect(audit('cs', { completed: CS_ALL, gpa: '2.8' }).transfer!.verdict).toBe('competitive');
  });
  it('all required done but GPA 2.79 → reach', () => {
    expect(audit('cs', { completed: CS_ALL, gpa: '2.79' }).transfer!.verdict).toBe('reach');
  });
  it('CSCI 3 (Java) satisfies CS 10A — the agreement prints both alternatives', () => {
    const t = audit('cs', { completed: ['CSCI 3'] }).transfer!;
    expect(prep(t, 'cs-10a').status).toBe('done');
    expect(prep(t, 'cs-10a').satisfiedBy).toBe('CSCI 3');
  });
  it('the calculus series needs BOTH MATH 190 and MATH 191', () => {
    const half = audit('cs', { completed: ['MATH 190'] }).transfer!;
    expect(prep(half, 'math-9a-math-9b-math-9c-p1').status).toBe('done');
    expect(prep(half, 'math-9a-math-9b-math-9c-p2').status).toBe('missing');
    const full = audit('cs', { completed: ['MATH 190', 'MATH 191'] }).transfer!;
    expect(prep(full, 'math-9a-math-9b-math-9c-p2').status).toBe('done');
    expect(full.prepDone).toBe(2);
  });
  it('select-3: two picks done leaves the verdict at reach with everything else complete', () => {
    const short = CS_ALL.filter((c) => c !== 'MATH 220'); // only MATH 210 + CSCI 2 picked
    const t = audit('cs', { completed: short, gpa: '3.5' }).transfer!;
    expect(t.verdict).toBe('reach');
    expect(t.prepDone).toBe(7);
    expect(t.prepMissing).toBe(1);
  });
  it('select-3: a fourth pick never inflates the count past the group size', () => {
    const extra = [...CS_ALL, 'PHYS 1B']; // 4 of the 5 articulable picks done
    const t = audit('cs', { completed: extra, gpa: '3.5' }).transfer!;
    expect(t.prepDone).toBe(8); // capped: 5 fixed + 3 counted picks
    expect(t.verdict).toBe('competitive');
  });
  it('AP-style exam credit clears the series + intro CS → 3/8', () => {
    const t = audit('cs', {}, ['MATH 190', 'MATH 191', 'CSCI 1']).transfer!;
    expect(t.prepDone).toBe(3);
    expect(prep(t, 'cs-10a').status).toBe('done');
  });
  it('CSCI 2 in progress reads as in-progress, never done', () => {
    const t = audit('cs', { completed: ['CSCI 1'], inProgress: ['CSCI 2'] }).transfer!;
    expect(prep(t, 'cs-10c').status).toBe('in-progress');
    expect(t.prepDone).toBe(1);
    expect(t.prepInProgress).toBe(1);
  });
  it('MATH 31 (← MATH 270) is recommended — verdict ignores it', () => {
    const t = audit('cs', { completed: CS_ALL, gpa: '3.5' }).transfer!;
    expect(prep(t, 'math-31').required).toBe(false);
    expect(t.verdict).toBe('competitive'); // not dragged to reach by a missing optional
  });
  it('ECC confers NO local CS associate degree — null registry entry, associate-track audit reports no degree', () => {
    // degrees/index.ts deliberately omits cs (2025-26 catalog offers only a
    // Certificate of Achievement, pp. 180-181). The honest answer is null —
    // never an invented curriculum. The ADT/transfer paths remain available.
    expect(getAssociateDegree('cs')).toBeNull();
    const r = audit('cs', { goal: 'graduate', gradTrack: 'associate', gpa: '3.0' });
    expect(r.degree).toBeNull();
  });
});

describe('golden · Psychology (UCR, selecting major, GPA min 2.7, one gating math slot)', () => {
  it('empty profile → reach, 0/1', () => {
    const t = audit('psych', {}).transfer!;
    expect(t.verdict).toBe('reach');
    expect(t.requiredCount).toBe(1);
    expect(t.prepDone).toBe(0);
  });
  it('math slot done + GPA 3.0 → competitive (selecting major)', () => {
    expect(audit('psych', { completed: PSY_ALL, gpa: '3.0' }).transfer!.verdict).toBe('competitive');
  });
  it('GPA 2.69 just below the 2.7 floor → reach', () => {
    expect(audit('psych', { completed: PSY_ALL, gpa: '2.69' }).transfer!.verdict).toBe('reach');
  });
  it('MATH 130 alone does NOT satisfy the math slot — the agreement requires the 130+170 pair', () => {
    const t = audit('psych', { completed: ['MATH 130'], gpa: '3.4' }).transfer!;
    expect(t.verdict).toBe('reach');
    expect(t.prepDone).toBe(0);
  });
  it('MATH 130 + MATH 170 together satisfy it (college algebra + trig substitution)', () => {
    const t = audit('psych', { completed: ['MATH 130', 'MATH 170'], gpa: '3.4' }).transfer!;
    expect(t.prepDone).toBe(1);
    expect(t.verdict).toBe('competitive');
  });
  it('MATH 165 (→ MATH 22) also satisfies it', () => {
    const t = audit('psych', { completed: ['MATH 165'], gpa: '3.0' }).transfer!;
    expect(prep(t, 'math-22').status).toBe('done');
    expect(t.verdict).toBe('competitive');
  });
  it('AP Psychology credit (PSYC C1000) clears the recommended intro row', () => {
    const t = audit('psych', {}, ['PSYC C1000']).transfer!;
    expect(prep(t, 'psyc-2').status).toBe('done');
    expect(prep(t, 'psyc-2').required).toBe(false);
  });
  it('a course both completed and in-progress counts once, as done', () => {
    const t = audit('psych', { completed: ['MATH 190'], inProgress: ['MATH 190'] }).transfer!;
    expect(t.prepDone).toBe(1);
    expect(t.prepInProgress).toBe(0);
  });
  it('prose science rows: all resolvable in the real catalog → missing (checkable gaps), zero review items', () => {
    // Post-swap the catalog carries the certified courses these prose rows
    // reference (igetcCertified.ts now lists catalog-code spellings — ANAT 30,
    // BIOL 10, CHEM 1A, PHYS 1A, STAT C1000… all present in courses.ts). No row
    // is zero-resolvable anymore, so an unsatisfied row is a checkable STUDENT
    // gap → 'missing', and no counselor question is filed. The B2
    // zero-resolvable→unknown behavior stays pinned by the synthetic
    // requirement-set block at the bottom of this file.
    const r = audit('psych', { completed: PSY_ALL, gpa: '3.0' });
    const t = r.transfer!;
    expect(prep(t, 'psych-bio-science').status).toBe('missing');
    expect(prep(t, 'psych-physical-science').status).toBe('missing');
    expect(prep(t, 'psych-additional-1').status).toBe('missing');
    expect(r.needsReview).toEqual([]);
  });
  it('a transcripted certified course (ANATOMY 30) satisfies the bio row before the catalog knows it', () => {
    const t = audit('psych', { completed: [...PSY_ALL, 'ANATOMY 30'], gpa: '3.0' }).transfer!;
    expect(prep(t, 'psych-bio-science').status).toBe('done');
    expect(prep(t, 'psych-bio-science').satisfiedBy).toBe('ANATOMY 30');
  });
  it('no-double-counting: the math-slot course cannot also fill an additional row', () => {
    // MATH 190 satisfies the math group; MATH 220 is then the only course left
    // for the two additional rows — exactly one of them can take it.
    const t = audit('psych', { completed: ['MATH 190', 'MATH 220'], gpa: '3.0' }).transfer!;
    expect(t.prepDone).toBe(1); // required side: just the math slot
    const add1 = prep(t, 'psych-additional-1');
    const add2 = prep(t, 'psych-additional-2');
    const statuses = [add1.status, add2.status].sort();
    expect(statuses[0]).toBe('done');      // one additional row takes MATH 220
    expect(statuses[1]).not.toBe('done');  // the other still needs a distinct course
    expect([add1, add2].find((x) => x.status === 'done')!.satisfiedBy).toBe('MATH 220');
  });
  it('carry-over classifies PSYC C1000 as major prep and BUS 150 as elective-only', () => {
    const co = audit('psych', { completed: ['PSYC C1000', 'BUS 150'] }).carryOver!;
    expect(co.items.find((i) => i.code === 'PSYC C1000')!.kind).toBe('major');
    expect(co.items.find((i) => i.code === 'BUS 150')!.kind).toBe('elective');
  });
  // TRIMMED: the AA Psychology core golden was hand-derived from
  // degrees/psych.associate.ts, which this slice does not carry.
});

// Hand-pinned from the Cal-GETC Standards v1.3 areas table: 11 areas all apply
// to a UC target (1A 1B 1C 2 3A 3B 4 5A 5B 5C 6); Area 4 = 2 courses /
// 2 disciplines; Area 6 = Ethnic Studies; no language area anywhere.
describe('golden · Cal-GETC path (entry fall 2025+)', () => {
  const calAudit = (major: MajorId, over: Partial<StudentProfile>) =>
    runAudit({ ...BASE, major, ccEntryTerm: 'Fall 2025', ...over }, inputsFor(major, [], 'calgetc'));

  it('audits 11 areas for a UC target, including 1C, none of them a language', () => {
    const t = calAudit('business', {}).transfer!;
    expect(t.ge).toHaveLength(11);
    expect(t.ge.map((a) => a.id)).toContain('1C');
    expect(t.ge.some((a) => a.label.includes('Language'))).toBe(false);
  });
  it('IGETC path (2021-22 ECC sheet): 11 UC areas — no 1C, math printed as 2A, the Area-3 total row, LOTE, NO Area 7', () => {
    const t = audit('business', {}).transfer!;
    // 12 defined − 1C (CSU-only) = 11 for a UC target:
    // 1A 1B 2A 3A 3B 3 4 5A 5B 5C 6
    expect(t.ge).toHaveLength(11);
    const ids = t.ge.map((a) => a.id);
    expect(ids).not.toContain('1C');
    expect(ids).toContain('2A');
    expect(ids).toContain('3'); // three-courses-total row for Area 3
    expect(ids).not.toContain('7'); // the 2021-22 sheet predates ethnic studies
    expect(t.ge.find((a) => a.id === '6')!.label).toBe('Languages Other Than English');
  });
  it('Area 4: ECON 101 + PSYC C1000 (2 courses, 2 disciplines) → done', () => {
    // Both carry calgetc:["4"] in courses.ts; depts Economics vs Psychology
    // satisfy the two-discipline rule. Cal-GETC Area 4 = 2 courses.
    const a4 = calAudit('business', { completed: ['ECON 101', 'PSYC C1000'] }).transfer!.ge.find((a) => a.id === '4')!;
    expect(a4.need).toBe(2);
    expect(a4.status).toBe('done');
  });
  it('Area 4: ECON 101 + ECON 102 (one discipline) → in-progress, not done', () => {
    const a4 = calAudit('business', { completed: ['ECON 101', 'ECON 102'] }).transfer!.ge.find((a) => a.id === '4')!;
    expect(a4.have).toBe(2);
    expect(a4.status).toBe('in-progress');
  });
  it('Area 6 Ethnic Studies: ESTU 1 clears it (certified list, 2026-07-01); French Bac changes nothing', () => {
    // Hand-checked against ECC's Cal-GETC certified sheet (data-sources/
    // ge-patterns/calgetc-ecc-list-2025-26.extracted.md, "AREA 6 – ETHNIC
    // STUDIES ... Ethnic Studies 1, 3"): ESTU 1 carries calgetc ["4","6"] in
    // courses.ts since the 2026-07-01 tag pass, so one ethnic-studies course
    // satisfies Area 6 on the Cal-GETC path.
    const r = calAudit('business', { completed: ['ESTU 1'], frenchBac: true });
    expect(r.transfer!.ge.find((a) => a.id === '6')!.status).toBe('done');
    // French Bac is an IGETC-only (LOTE) consideration — no review item here.
    expect(r.needsReview).toEqual([]);
  });
  it('verdicts are pattern-independent: all Business prep + 3.0 → competitive on both paths', () => {
    expect(calAudit('business', { completed: BIZ_ALL, gpa: '3.0' }).transfer!.verdict).toBe('competitive');
  });
});

describe('golden · ADT template scaffold (Task 2: replace the "ADT core = UCR prep" shortcut)', () => {
  // Post-swap (2026-07-01): the Business AS-T and Psychology AA-T templates are
  // LIVE (real 2025-26 catalog cores); CS remains the empty-core placeholder —
  // ECC confers no CS degree, so the engine falls back to the articulation prep
  // for the ADT approximation. Both directions stay pinned: the placeholder
  // fallback (on cs) and template takeover (real + synthetic templates).
  const adtBase = { ...BASE, goal: 'graduate' as const, gradTrack: 'adt' as const };

  // TRIMMED for this build's data slice: the three goldens that consumed the
  // SHIPPED ADT templates (getAdtTemplate('cs'|'business'|'psych')) are gone.
  // src/data/degrees is a documented stub here — the slice carries no degree
  // templates at all — so those tests asserted on data this repo does not
  // hold. What they pinned about the ENGINE (a live template takes over the
  // ADT audit; an absent one falls back to the articulation prep) is still
  // pinned by the two tests below, which build their templates inline.
  it('an absent template is inert — the engine falls back to the articulation prep', () => {
    // The slice ships no templates, so this is the shipped state: the ADT
    // audit runs on the UCR CS articulation prep — 8 slots (5 fixed + a
    // select-3 group counted as 3; the recommended MATH 31 row excluded).
    // The ucr-cs facts sidecar honestly reports NO AS-T Computer Science at
    // ECC (adt.available false, name null — 2025-26 catalog), so the engine
    // renders the generic fallback label and does NOT grant ADT priority for
    // a degree that does not exist.
    const fallback = runAudit({ ...adtBase, major: 'cs' }, inputsFor('cs')).degree!;
    expect(fallback.coreRequired).toBe(8);
    expect(fallback.name).toBe('Associate Degree for Transfer');
    expect(fallback.grantsTransferPriority).toBe(false);
  });

  it('a transcribed template TAKES OVER the ADT degree audit (core, name, units)', () => {
    const live: AdtTemplate = {
      major: 'business',
      degreeType: 'AS-T',
      name: 'AS-T Business Administration (official template)',
      totalUnits: 60,
      gpaTarget: 2.0,
      grantsTransferPriority: true,
      core: [
        { id: 'adt-macro', label: 'Macroeconomics', options: ['ECON 101'], required: true },
        { id: 'adt-micro', label: 'Microeconomics', options: ['ECON 102'], required: true },
        { id: 'adt-fin', label: 'Financial Accounting', options: ['BUS 101'], required: true },
      ],
      meta: demoProvenance('Test ADT template', 'https://example.test'),
    };
    const d = runAudit(
      { ...adtBase, major: 'business', completed: ['ECON 101', 'ECON 102'] },
      { ...inputsFor('business'), adtTemplate: live },
    ).degree!;
    // Template core (3 slots), NOT the 6 UCR-prep fallback slots → proof it took over.
    expect(d.coreRequired).toBe(3);
    expect(d.coreDone).toBe(2);
    expect(d.name).toBe('AS-T Business Administration (official template)');
    expect(d.core.find((r) => r.id === 'adt-macro')!.status).toBe('done');
    expect(d.core.find((r) => r.id === 'adt-fin')!.status).toBe('missing');
  });

  it('a live template is cited as the ADT requirements source', () => {
    const live: AdtTemplate = {
      major: 'cs',
      degreeType: 'AS-T',
      name: 'AS-T Computer Science (official template)',
      totalUnits: 60,
      gpaTarget: 2.0,
      grantsTransferPriority: true,
      core: [{ id: 'adt-introcs', label: 'Intro CS', options: ['CSCI 1'], required: true }],
      meta: demoProvenance('ECC AS-T Computer Science template', 'https://example.test/adt'),
    };
    const r = runAudit({ ...adtBase, major: 'cs' }, { ...inputsFor('cs'), adtTemplate: live });
    const cite = r.sources.find((s) => s.appliesTo.includes('ADT requirements'))!;
    expect(cite).toBeDefined();
    expect(cite.sourceName).toBe('ECC AS-T Computer Science template');
  });
});

describe('golden · unknown status on a data gap (synthetic requirement set)', () => {
  // A requirement none of whose options exist in the catalog must come back
  // "unknown" with a review item — never "missing" (B2).
  const synthetic = (): AuditInputs => ({
    ...inputsFor('cs'),
    requirementSet: {
      school: 'ucr',
      major: 'cs',
      impacted: false,
      gpaTarget: 3.0,
      adt: { available: false, name: null, grantsPriority: false },
      meta: demoProvenance('Synthetic test set', 'https://example.test'),
      majorPrep: [
        { id: 'ghost', label: 'Course our snapshot is missing', options: ['ZZZ-999'], required: true },
        { id: 'real', label: 'Intro CS', options: ['CS-1'], required: true },
      ],
    },
  });

  it('flags the unmatchable requirement as unknown and files a review item', () => {
    const r = runAudit({ ...BASE, major: 'cs', completed: ['CS-1'], gpa: '3.5' }, synthetic());
    const t = r.transfer!;
    expect(prep(t, 'ghost').status).toBe('unknown');
    expect(prep(t, 'real').status).toBe('done');
    const item = r.needsReview.find((n) => n.id === 'req-ghost');
    expect(item).toBeDefined();
    expect(item!.question).toContain('El Camino College');
    expect(item!.question).toContain('Course our snapshot is missing');
  });
  it('unknown is not eligible and not reach — it degrades honestly to competitive', () => {
    const r = runAudit({ ...BASE, major: 'cs', completed: ['CS-1'], gpa: '3.5' }, synthetic());
    expect(r.transfer!.verdict).toBe('competitive');
  });
});
