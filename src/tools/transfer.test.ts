import { describe, it, expect } from 'vitest';
import { TRANSFER_IMPLS } from './transfer';
import { isToolError, type ToolContext } from './runtime';
import type { ToolOutput } from './contract';
import { INITIAL_STATE, type PageState } from '../lib/store';

// A read-only context over an explicit page state. The transfer tools never
// write, so setState is a no-op here and every test states its own facts.
function ctx(over: Partial<PageState> = {}): ToolContext {
  return {
    state: { ...INITIAL_STATE, ...over },
    setState: () => { throw new Error('a transfer tool must not write to the page'); },
    now: new Date('2026-09-02T19:00:00Z'),
  };
}

async function ok(name: string, input: unknown, c = ctx()): Promise<ToolOutput> {
  const out = await TRANSFER_IMPLS[name](input, c);
  if (isToolError(out)) throw new Error(`${name} errored: ${out.error} — ${out.message}`);
  return out;
}

// Hard rule 2 of docs/PLAN.md, checked on every summary this file produces.
const FORBIDDEN = /guarantee|guaranteed|will be admitted|you will get in/i;
function assertHonest(out: ToolOutput) {
  expect(out.summary).not.toMatch(FORBIDDEN);
  for (const c of out.caveats) {
    // "does not guarantee admission" is the one honest use of the word, so the
    // check is on a CLAIM of a guarantee, not the letters.
    expect(c).not.toMatch(/\b(is|are) guaranteed\b|will be admitted/i);
  }
}

const UCLA_CS = { campus: 'UCLA', major: 'cs' };

describe('list_options', () => {
  it('describes the college, the campuses, the majors and the snapshot', async () => {
    const out = await ok('list_options', {});
    const d = out.data as {
      college: { id: string }; campuses: { id: string; tier: string; majors: string[] }[];
      majors: { id: string }[]; catalogSize: number; dataVersion: string;
    };
    expect(d.college.id).toBe('ecc');
    expect(d.campuses.length).toBe(17);
    expect(d.majors.map((m) => m.id).sort()).toEqual(['business', 'cs', 'psych']);
    expect(d.catalogSize).toBeGreaterThan(100);
    expect(d.dataVersion).toMatch(/assist/);
    expect(d.campuses.every((c) => ['verified', 'machine-transcribed'].includes(c.tier))).toBe(true);
    expect(out.citations.length).toBeGreaterThan(0);
    assertHonest(out);
  });

  it('says out loud that the machine-transcribed agreements are unreviewed', async () => {
    const out = await ok('list_options', {});
    expect(out.caveats.some((c) => /machine-transcribed/i.test(c))).toBe(true);
  });
});

describe('check_course_transfer', () => {
  it('MATH 190 satisfies MATH 31A for CS at UCLA, with the ASSIST citation', async () => {
    const out = await ok('check_course_transfer', { course: 'MATH 190', ...UCLA_CS });
    const d = out.data as {
      course: { code: string; units: number };
      satisfies: { rowId: string; label: string; required: boolean }[];
      articulated: boolean;
      geAreas: { calgetc: { id: string }[]; igetc: { id: string }[] };
      alsoAcceptedAt: { campus: string; rows: string[] }[];
    };
    expect(d.course.code).toBe('MATH 190');
    expect(d.articulated).toBe(true);
    expect(d.satisfies.some((s) => s.label.includes('MATH 31A'))).toBe(true);
    expect(d.satisfies.find((s) => s.label.includes('MATH 31A'))!.required).toBe(true);
    // The GE areas the catalog actually carries for it.
    expect(d.geAreas.igetc.map((a) => a.id)).toContain('2A');
    expect(d.geAreas.calgetc.map((a) => a.id)).toContain('2');
    // The citation is the agreement, by name, year and verification state.
    const assist = out.citations.find((c) => c.sourceName.includes('ASSIST'))!;
    expect(assist.sourceUrl).toContain('assist.org');
    expect(assist.catalogYear).toBe('2025-2026');
    expect(['unreviewed', 'verified']).toContain(assist.verification);
    // And where else the same course counts for the same major.
    expect(d.alsoAcceptedAt.length).toBeGreaterThan(5);
    expect(d.alsoAcceptedAt.every((a) => a.rows.length > 0)).toBe(true);
    expect(d.alsoAcceptedAt.some((a) => a.campus === 'ucla')).toBe(false);
    assertHonest(out);
  });

  it('accepts loose spellings of the course and the campus', async () => {
    const out = await ok('check_course_transfer', { course: 'math190', campus: 'uc los angeles', major: 'computer science' });
    const d = out.data as { course: { code: string }; campus: string; major: string };
    expect(d.course.code).toBe('MATH 190');
    expect(d.campus).toBe('ucla');
    expect(d.major).toBe('cs');
  });

  it('an unreviewed agreement carries the row-by-row caveat', async () => {
    const out = await ok('check_course_transfer', { course: 'MATH 190', campus: 'CSULB', major: 'cs' });
    expect(out.caveats.some((c) => /machine-transcribed from ASSIST/.test(c))).toBe(true);
  });

  it('a course that does not articulate says so plainly, in three beats', async () => {
    // A humanities course against a CS agreement: transferable, but not major
    // prep. The summary must say it does not articulate, then what it DOES
    // still carry, then where it counts — silence on the last two reads as
    // "this course is worthless", which is almost never true.
    const out = await ok('check_course_transfer', { course: 'HIST 101', ...UCLA_CS });
    const d = out.data as { articulated: boolean; satisfies: unknown[] };
    expect(d.articulated).toBe(false);
    expect(d.satisfies).toEqual([]);
    expect(out.summary).toMatch(
      /^HIST C1001 does not articulate to any lower-division requirement for Computer Science at UC Los Angeles in the 2025-2026 agreement./,
    );
    expect(out.summary).toMatch(/still carries transfer general-education credit: Cal-GETC .+; IGETC /);
    assertHonest(out);
  });

  it('CSCI 1 for CS: the verified split of campuses that do and do not take it', async () => {
    // Checked against the agreements on disk: CS at Cal Poly Pomona,
    // UC Berkeley, San Diego State and UC San Diego articulates nothing from
    // CSCI 1; UCLA and Cal State Long Beach do.
    const out = await ok('check_course_transfer', { course: 'CSCI 1', campus: 'cal-poly-pomona', major: 'cs' });
    const d = out.data as {
      articulated: boolean;
      alsoAcceptedAt: { campus: string }[];
      notAcceptedAt: { campus: string; campusName: string }[];
    };
    expect(d.articulated).toBe(false);
    const no = d.notAcceptedAt.map((c) => c.campus);
    const yes = d.alsoAcceptedAt.map((c) => c.campus);
    for (const id of ['uc-berkeley', 'san-diego-state', 'uc-san-diego']) expect(no, id).toContain(id);
    for (const id of ['ucla', 'csulb']) expect(yes, id).toContain(id);
    // The campus asked about is in neither list, and the two lists partition
    // every other campus covered for the major — so "nowhere" and "we didn't
    // check" can never look the same.
    expect(no).not.toContain('cal-poly-pomona');
    expect(yes).not.toContain('cal-poly-pomona');
    expect(new Set([...no, ...yes]).size).toBe(16);
    expect(d.notAcceptedAt.every((c) => c.campusName.length > 0)).toBe(true);
    expect(out.summary).toContain('does not articulate to any lower-division requirement');
    expect(out.summary).toMatch(/It does count toward this major at .*UC Los Angeles.*, and does not at .*UC Berkeley/);
    assertHonest(out);
  });

  it('an articulated course keeps its positive summary', async () => {
    const out = await ok('check_course_transfer', { course: 'CSCI 1', ...UCLA_CS });
    const d = out.data as { articulated: boolean; notAcceptedAt: { campus: string }[] };
    expect(d.articulated).toBe(true);
    // notAcceptedAt is present either way, so an agent can always answer
    // "where doesn't this count".
    expect(d.notAcceptedAt.map((c) => c.campus)).toContain('cal-poly-pomona');
    expect(out.summary).toMatch(/^CSCI 1 .* satisfies /);
  });

  it('an unknown course is an error carrying the nearest catalog codes', async () => {
    const out = await TRANSFER_IMPLS.check_course_transfer({ course: 'MATH 9999', ...UCLA_CS }, ctx());
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('unknown_course');
    expect(out.hint).toMatch(/MATH/);
  });

  it('a retired course number resolves to today\'s course and says which', async () => {
    const out = await ok('check_course_transfer', { course: 'ECON 101', campus: 'UCLA', major: 'business' });
    const d = out.data as { course: { code: string; formerCode?: string } };
    expect(d.course.code).toBe('ECON C2002');
    expect(d.course.formerCode).toBe('ECON 101');
    expect(out.caveats.some((c) => c.includes('ECON 101'))).toBe(true);
  });

  it('no target on the page and no argument is target_not_set', async () => {
    const out = await TRANSFER_IMPLS.check_course_transfer({ course: 'MATH 190' }, ctx());
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('target_not_set');
    expect(out.message).toBe('No target campus/major on the page and none given.');
    expect(out.hint).toContain('set_student_target');
  });

  it('an unresolvable campus offers candidates back', async () => {
    const out = await TRANSFER_IMPLS.check_course_transfer({ course: 'MATH 190', campus: 'Hogwarts', major: 'cs' }, ctx());
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('unknown_campus');
    expect(out.hint).toMatch(/list_options/);
  });
});

describe('audit_coursework', () => {
  it('audits the page profile when given no arguments', async () => {
    const page = ctx({
      target: { campus: 'ucla', major: 'cs', entryTerm: 'Fall 2024' },
      completed: ['MATH 190', 'CSCI 1'],
      inProgress: ['MATH 191'],
    });
    const out = await ok('audit_coursework', {}, page);
    const d = out.data as {
      campus: string; major: string; gePattern: string; verdict: string;
      prep: { done: number; requiredTotal: number }; units: { done: number; floor: number };
      rows: { id: string; status: string }[]; ge: unknown[]; dataVersion: string;
    };
    expect(d.campus).toBe('ucla');
    expect(d.major).toBe('cs');
    expect(d.gePattern).toBe('IGETC');
    expect(['eligible', 'competitive', 'reach']).toContain(d.verdict);
    expect(d.prep.done).toBeGreaterThan(0);
    expect(d.units.floor).toBe(60);
    expect(d.rows.find((r) => r.id === 'math-31a')!.status).toBe('done');
    expect(d.rows.find((r) => r.id === 'math-31b')!.status).toBe('in-progress');
    expect(d.ge.length).toBeGreaterThan(0);
    expect(d.dataVersion).toMatch(/assist/);
    assertHonest(out);
  });

  it('explicit coursework overrides the page', async () => {
    const page = ctx({ target: { campus: 'ucla', major: 'cs', entryTerm: '' }, completed: ['MATH 190'] });
    const out = await ok('audit_coursework', { courses: [] }, page);
    const d = out.data as { prep: { done: number } };
    expect(d.prep.done).toBe(0);
    expect(out.summary).toMatch(/No coursework is recorded/);
  });

  it('an empty profile audits to an honest empty answer, not a verdict about the student', async () => {
    const out = await ok('audit_coursework', { ...UCLA_CS, courses: [], inProgress: [] });
    expect(out.summary).toMatch(/reflects an empty record rather than anything about the student/);
    assertHonest(out);
  });

  it('one bad course code fails the whole call rather than auditing a shorter list', async () => {
    const out = await TRANSFER_IMPLS.audit_coursework({ ...UCLA_CS, courses: ['MATH 190', 'NOPE 1'] }, ctx());
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('unknown_course');
    expect(out.message).toContain('NOPE 1');
  });

  it('the entry term decides the GE pattern', async () => {
    const cal = await ok('audit_coursework', { ...UCLA_CS, courses: [], entryTerm: 'Fall 2025' });
    expect((cal.data as { gePattern: string }).gePattern).toBe('Cal-GETC');
    const igetc = await ok('audit_coursework', { ...UCLA_CS, courses: [], entryTerm: 'Fall 2024' });
    expect((igetc.data as { gePattern: string }).gePattern).toBe('IGETC');
  });
});

describe('compare_campuses', () => {
  const COURSES = ['MATH 190', 'MATH 191', 'CSCI 1', 'CSCI 2'];

  it('returns one row per campus with data, sorted, every row cited', async () => {
    const out = await ok('compare_campuses', { courses: COURSES, major: 'cs' });
    const d = out.data as {
      major: string; sortedBy: string;
      rows: { campus: string; campusName: string; system: string; verdict: string; coverage: number | null; prepDone: number; prepTotal: number; sourceUrl: string; catalogYear: string; provenance: string }[];
    };
    expect(d.major).toBe('cs');
    expect(d.sortedBy).toBe('coverage desc');
    expect(d.rows).toHaveLength(17);
    expect(new Set(d.rows.map((r) => r.campus)).size).toBe(17);
    // Sorted by coverage, best first (a floor-only campus sorts as covered).
    const cov = d.rows.map((r) => r.coverage ?? 1);
    expect(cov).toEqual([...cov].sort((a, b) => b - a));
    // Every row cites the agreement it rests on.
    expect(d.rows.every((r) => r.sourceUrl.includes('assist.org'))).toBe(true);
    expect(d.rows.every((r) => r.catalogYear.length > 0)).toBe(true);
    expect(d.rows.every((r) => ['UC', 'CSU'].includes(r.system))).toBe(true);
    expect(d.rows.every((r) => ['eligible', 'competitive', 'reach'].includes(r.verdict))).toBe(true);
    expect(out.citations).toHaveLength(17);
    assertHonest(out);
  });

  it('this coursework carries somewhere — at least one campus counts all four courses', async () => {
    const out = await ok('compare_campuses', { courses: COURSES, major: 'cs' });
    const d = out.data as { rows: { creditsThatCount: number; unitsApplied: number }[] };
    expect(Math.max(...d.rows.map((r) => r.creditsThatCount))).toBe(4);
    expect(Math.max(...d.rows.map((r) => r.unitsApplied))).toBeGreaterThan(0);
  });

  it('names WHICH courses only transfer as electives at each campus', async () => {
    // A CS load with two courses that are not CS prep anywhere.
    const out = await ok('compare_campuses', {
      courses: ['MATH 190', 'MATH 191', 'CSCI 1', 'CSCI 2', 'HIST 101', 'PHYS 1A'],
      major: 'cs',
    });
    const d = out.data as { rows: { campus: string; electivesOnly: number; electiveCourses: string[] }[] };
    expect(d.rows.every((r) => Array.isArray(r.electiveCourses))).toBe(true);
    // The list itemises the count, so an agent can say which courses those are
    // rather than only how many.
    for (const r of d.rows) {
      if (r.electivesOnly <= 8) expect(r.electiveCourses, r.campus).toHaveLength(r.electivesOnly);
      else expect(r.electiveCourses[8], r.campus).toBe(`+${r.electivesOnly - 8} more`);
    }
    // At least one campus takes none of the CSCI work for the major.
    // Cal Poly Pomona takes CSCI 2 for CS 2400 but articulates nothing from
    // CSCI 1 — so exactly one of the pair is elective-only there.
    const cpp = d.rows.find((r) => r.campus === 'cal-poly-pomona')!;
    expect(cpp.electiveCourses).toContain('CSCI 1');
    expect(cpp.electiveCourses).not.toContain('CSCI 2');
    // …and every listed code is one the student actually gave us.
    const given = ['MATH 190', 'MATH 191', 'CSCI 1', 'CSCI 2', 'HIST C1001', 'PHYS 1A'];
    for (const r of d.rows) {
      for (const code of r.electiveCourses) {
        if (code.startsWith('+')) continue;
        expect(given, `${r.campus} listed ${code}`).toContain(code);
      }
    }
  });

  it('caps a long elective list with a countable marker rather than dropping courses', async () => {
    // Twelve courses, none of them CS preparation at Cal Poly Pomona.
    // Twelve real catalog courses that carry no transfer GE area and are not
    // Cal Poly Pomona CS preparation, so every one lands in the elective bucket.
    const courses = [
      'BIOL 12', 'BUS 101', 'BUS 150', 'BUS 108', 'BUS 109', 'BUS 115',
      'BUS 117', 'BUS 120', 'BUS 121', 'BUS 122', 'BUS 126', 'BUS 151',
    ];
    const out = await ok('compare_campuses', { courses, major: 'cs', campuses: ['cal-poly-pomona'] });
    const row = (out.data as { rows: { electivesOnly: number; electiveCourses: string[] }[] }).rows[0];
    expect(row.electivesOnly).toBe(12);
    // The count stays whole; only the naming is capped, and the marker says
    // by how much.
    expect(row.electiveCourses).toHaveLength(9);
    expect(row.electiveCourses[8]).toBe('+4 more');
    expect(row.electiveCourses.slice(0, 8).every((c) => courses.includes(c))).toBe(true);
  });

  it('restricts to the campuses asked for', async () => {
    const out = await ok('compare_campuses', { courses: COURSES, major: 'cs', campuses: ['UCLA', 'Cal Poly Pomona'] });
    const d = out.data as { rows: { campus: string }[] };
    expect(d.rows.map((r) => r.campus).sort()).toEqual(['cal-poly-pomona', 'ucla']);
  });

  it('names coverage as a comparison of preparation, never a ranking of campuses', async () => {
    const out = await ok('compare_campuses', { courses: COURSES, major: 'cs' });
    expect(out.caveats.some((c) => /not a ranking of campuses/.test(c))).toBe(true);
  });

  it('with no major anywhere it is target_not_set', async () => {
    const out = await TRANSFER_IMPLS.compare_campuses({ courses: COURSES }, ctx());
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('target_not_set');
  });

  it('defaults the major to the page target', async () => {
    const page = ctx({ target: { campus: 'ucla', major: 'psych', entryTerm: '' }, completed: ['MATH 190'] });
    const out = await ok('compare_campuses', {}, page);
    expect((out.data as { major: string }).major).toBe('psych');
  });
});

describe('explain_requirement', () => {
  it('explains a row by its receiving course code, with the catalog entry per option', async () => {
    const out = await ok('explain_requirement', { requirement: 'MATH 31A', ...UCLA_CS });
    const d = out.data as {
      campus: string;
      matches: { rowId: string; label: string; required: boolean; options: { code: string; name: string | null; units: number | null; inCatalog: boolean; igetc: string[] }[] }[];
    };
    expect(d.campus).toBe('ucla');
    expect(d.matches[0].rowId).toBe('math-31a');
    expect(d.matches[0].required).toBe(true);
    const opt = d.matches[0].options.find((o) => o.code === 'MATH 190')!;
    expect(opt.inCatalog).toBe(true);
    expect(opt.name).toContain('Calculus');
    expect(opt.units).toBe(5);
    expect(opt.igetc).toContain('2A');
    expect(out.citations.some((c) => c.sourceName.includes('ASSIST'))).toBe(true);
    expect(out.citations.some((c) => c.sourceName.includes('El Camino College 2025–26 Catalog'))).toBe(true);
    assertHonest(out);
  });

  it('matches on a word from the label too', async () => {
    const out = await ok('explain_requirement', { requirement: 'discrete', ...UCLA_CS });
    const d = out.data as { matches: { label: string }[] };
    expect(d.matches.length).toBeGreaterThan(0);
    expect(d.matches[0].label.toLowerCase()).toContain('discrete');
  });

  it('finds a row by the receiving subject alone, whatever the campus calls it', async () => {
    // Cal Poly Pomona prints "Introduction to Newtonian Mechanics (PHY 1510)".
    // "physics" used to find nothing there, because the label never says it.
    const out = await ok('explain_requirement', { requirement: 'physics', campus: 'cpp', major: 'cs' });
    const d = out.data as { matches: { rowId: string; label: string; options: { code: string }[] }[] };
    expect(d.matches).toHaveLength(1);
    expect(d.matches[0].label).toContain('PHY 1510');
    expect(d.matches[0].options.map((o) => o.code)).toContain('PHYS 1A');
    assertHonest(out);
  });

  it('the subject families are interchangeable in both directions', async () => {
    // PHY / PHYS / PHYSICS name one subject; so do MATH / MAT and the CS
    // family. A student should not have to know which spelling their campus
    // prints.
    for (const needle of ['phy', 'phys', 'PHYSICS', 'PHY 1510']) {
      const out = await ok('explain_requirement', { requirement: needle, campus: 'cpp', major: 'cs' });
      expect((out.data as { matches: { rowId: string }[] }).matches.map((m) => m.rowId), needle).toContain('phy-1510');
    }
    const mat = await ok('explain_requirement', { requirement: 'math', campus: 'cpp', major: 'cs' });
    const ids = (mat.data as { matches: { rowId: string }[] }).matches.map((m) => m.rowId);
    expect(ids).toContain('mat-1140');
    expect(ids).toContain('mat-1150');
  });

  it('finds a row by the El Camino course code that satisfies it', async () => {
    // At UCLA "PHYS 1A" names two things at once: El Camino's own PHYS 1A,
    // which satisfies physics-1a-p3, and UCLA's PHYSICS 1A, printed in the
    // "[series PHYSICS 1A+…]" heading every row of that series carries. Both
    // are honest readings of the question, so both are returned.
    const out = await ok('explain_requirement', { requirement: 'PHYS 1A', ...UCLA_CS });
    const d = out.data as { matches: { rowId: string; label: string; options: { code: string }[] }[] };
    const byOption = d.matches.find((m) => m.options.some((o) => o.code === 'PHYS 1A'))!;
    expect(byOption.rowId).toBe('physics-1a-p3');
    expect(d.matches.every((m) => /PHYS(ICS)? 1A/.test(m.label) || m.options.some((o) => o.code === 'PHYS 1A'))).toBe(true);
  });

  it('an option code with no ambiguity finds exactly the rows it satisfies', async () => {
    // CSCI 16 appears in one UCLA CS row and nowhere in any receiving label.
    const out = await ok('explain_requirement', { requirement: 'CSCI 16', ...UCLA_CS });
    const d = out.data as { matches: { rowId: string; options: { code: string }[] }[] };
    expect(d.matches).toHaveLength(1);
    expect(d.matches[0].rowId).toBe('com-sci-33');
    expect(d.matches[0].options.map((o) => o.code)).toContain('CSCI 16');
  });

  it('matches a row id and a receiving code exactly', async () => {
    const byCode = await ok('explain_requirement', { requirement: 'CS 1400', campus: 'cpp', major: 'cs' });
    expect((byCode.data as { matches: { rowId: string }[] }).matches[0].rowId).toBe('cs-1400');
    const byId = await ok('explain_requirement', { requirement: 'cs-1400', campus: 'cpp', major: 'cs' });
    expect((byId.data as { matches: { rowId: string }[] }).matches[0].rowId).toBe('cs-1400');
  });

  it('collapses the rows of one select-group member instead of repeating it', async () => {
    // UCLA's "Complete one full option for Introduction to Computer Science I"
    // splits one alternative across two normalized rows.
    const out = await ok('explain_requirement', { requirement: 'COM SCI 31', ...UCLA_CS });
    const d = out.data as { matches: { rowId: string; group?: { id: string } }[] };
    const members = d.matches
      .filter((m) => m.group)
      .map((m) => `${m.group!.id}|${m.rowId}`);
    expect(new Set(members).size).toBe(members.length);
    // Two members of the group, not the three rows they span.
    expect(d.matches.filter((m) => m.group?.id === 'com-sci-31-opt')).toHaveLength(2);
  });

  it('no match is requirement_not_found with candidate labels', async () => {
    const out = await TRANSFER_IMPLS.explain_requirement({ requirement: 'underwater basket weaving', ...UCLA_CS }, ctx());
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('requirement_not_found');
    // Up to twelve candidate labels, so an agent has enough of the agreement
    // to pick from rather than five rows and a guess.
    const listed = out.hint!.split(' · ').length;
    expect(listed).toBeGreaterThan(5);
    expect(listed).toBeLessThanOrEqual(12);
  });

  it('an option outside our catalog snapshot is reported as such, not as a gap in the student', async () => {
    // UCR Psychology's prose rows list courses the ECC snapshot does not carry.
    const out = await ok('explain_requirement', { requirement: 'psych-additional-1', campus: 'ucr', major: 'psych' });
    const d = out.data as { matches: { options: { inCatalog: boolean }[] }[] };
    const outside = d.matches[0].options.filter((o) => !o.inCatalog);
    if (outside.length > 0) {
      expect(out.caveats.some((c) => /not in our El Camino catalog snapshot/.test(c))).toBe(true);
    }
    assertHonest(out);
  });
});

describe('every transfer summary stays inside the verdict vocabulary', () => {
  it('holds across all five tools', async () => {
    const page = ctx({
      target: { campus: 'ucla', major: 'cs', entryTerm: 'Fall 2024' },
      completed: ['MATH 190', 'CSCI 1'],
      inProgress: ['MATH 191'],
    });
    const outs = [
      await ok('list_options', {}, page),
      await ok('check_course_transfer', { course: 'MATH 190' }, page),
      await ok('audit_coursework', {}, page),
      await ok('compare_campuses', {}, page),
      await ok('explain_requirement', { requirement: 'MATH 31A' }, page),
    ];
    for (const out of outs) {
      assertHonest(out);
      expect(out.summary.length).toBeGreaterThan(20);
      expect(Array.isArray(out.citations)).toBe(true);
      expect(Array.isArray(out.caveats)).toBe(true);
    }
  });
});
