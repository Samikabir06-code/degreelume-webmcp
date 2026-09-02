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

  it('a course that does not articulate says so plainly, not as an error', async () => {
    // A humanities course against a CS agreement: transferable, but not major prep.
    const out = await ok('check_course_transfer', { course: 'HIST 101', ...UCLA_CS });
    const d = out.data as { articulated: boolean; satisfies: unknown[] };
    expect(d.articulated).toBe(false);
    expect(d.satisfies).toEqual([]);
    expect(out.summary).toMatch(/does not satisfy any lower-division major-preparation requirement/);
    assertHonest(out);
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

  it('no match is requirement_not_found with candidate labels', async () => {
    const out = await TRANSFER_IMPLS.explain_requirement({ requirement: 'underwater basket weaving', ...UCLA_CS }, ctx());
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('requirement_not_found');
    expect(out.hint!.length).toBeGreaterThan(20);
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
