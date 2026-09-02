import { describe, it, expect } from 'vitest';
import {
  resolveCampus, campusCandidates, resolveMajor, majorCandidates,
  resolveCourseCode, resolveCourseCodeDetailed, courseCandidates,
  normalizeCourseCode, resolveCourseList, duplicateCaveats,
} from './resolve';
import { SCHOOLS } from '../data/schools';

// Resolution is deterministic by construction — a scored match over a fixed
// alias table. These pin the spellings an agent actually sends.

describe('resolveCampus', () => {
  it('accepts registry ids verbatim', () => {
    expect(resolveCampus('ucla')?.id).toBe('ucla');
    expect(resolveCampus('cal-poly-pomona')?.id).toBe('cal-poly-pomona');
    expect(resolveCampus('san-diego-state')?.id).toBe('san-diego-state');
  });

  it('accepts short names, cased any way', () => {
    expect(resolveCampus('UCLA')?.id).toBe('ucla');
    expect(resolveCampus('CPP')?.id).toBe('cal-poly-pomona');
    expect(resolveCampus('SDSU')?.id).toBe('san-diego-state');
    expect(resolveCampus('Sac State')?.id).toBe('csu-sacramento');
    expect(resolveCampus('csulb')?.id).toBe('csulb');
  });

  it('accepts full names as the registry prints them', () => {
    expect(resolveCampus('UC Los Angeles')?.id).toBe('ucla');
    expect(resolveCampus('Cal State Long Beach')?.id).toBe('csulb');
    expect(resolveCampus('San José State')?.id).toBe('san-jose-state');
  });

  it('accepts the loose variants people actually type', () => {
    expect(resolveCampus('uc los angeles')?.id).toBe('ucla');
    expect(resolveCampus('University of California, Los Angeles')?.id).toBe('ucla');
    expect(resolveCampus('cal state long beach')?.id).toBe('csulb');
    expect(resolveCampus('long beach')?.id).toBe('csulb');
    expect(resolveCampus('berkeley')?.id).toBe('uc-berkeley');
    expect(resolveCampus('san diego state')?.id).toBe('san-diego-state');
    expect(resolveCampus('csu fullerton')?.id).toBe('csu-fullerton');
    expect(resolveCampus('fullerton')?.id).toBe('csu-fullerton');
    expect(resolveCampus('California State University, Fullerton')?.id).toBe('csu-fullerton');
  });

  it('never resolves a campus this build has no agreements for', () => {
    // Staged campuses (ready:false) hold no agreements — resolving one would
    // promise an answer the tools cannot give.
    expect(SCHOOLS.find((s) => s.id === 'uc-merced')!.ready).toBe(false);
    expect(resolveCampus('uc merced')).toBeNull();
    expect(resolveCampus('UCM')).toBeNull();
    expect(campusCandidates('uc merced').every((s) => s.ready)).toBe(true);
  });

  it('returns null for nonsense and for an empty string', () => {
    expect(resolveCampus('')).toBeNull();
    expect(resolveCampus('Hogwarts')).toBeNull();
  });

  it('offers candidates back for something it could not place', () => {
    const cands = campusCandidates('cal', 5);
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.every((s) => s.ready)).toBe(true);
  });
});

describe('resolveMajor', () => {
  it('accepts the ids and the words for them', () => {
    expect(resolveMajor('cs')?.id).toBe('cs');
    expect(resolveMajor('computer science')?.id).toBe('cs');
    expect(resolveMajor('comp sci')?.id).toBe('cs');
    expect(resolveMajor('Computer Science')?.id).toBe('cs');
    expect(resolveMajor('business')?.id).toBe('business');
    expect(resolveMajor('Business Administration')?.id).toBe('business');
    expect(resolveMajor('psych')?.id).toBe('psych');
    expect(resolveMajor('psychology')?.id).toBe('psych');
  });

  it('resolves only the three majors this build carries data for', () => {
    // The registry models 13 majors; the slice holds agreements for three.
    expect(resolveMajor('biology')).toBeNull();
    expect(resolveMajor('mechanical engineering')).toBeNull();
    expect(resolveMajor('economics')).toBeNull();
    expect(majorCandidates('bio')).toEqual([]);
  });

  it('returns null for an empty string', () => {
    expect(resolveMajor('')).toBeNull();
  });
});

describe('course codes', () => {
  it('normalises the ways a code gets typed', () => {
    expect(normalizeCourseCode('math190')).toBe('MATH 190');
    expect(normalizeCourseCode('MATH-190')).toBe('MATH 190');
    expect(normalizeCourseCode('Math 190')).toBe('MATH 190');
    expect(normalizeCourseCode('  math   190 ')).toBe('MATH 190');
    expect(normalizeCourseCode('psyc c1000')).toBe('PSYC C1000');
    expect(normalizeCourseCode('psyc109a')).toBe('PSYC 109A');
  });

  it('resolves a real catalog course', () => {
    const c = resolveCourseCode('math190');
    expect(c?.code).toBe('MATH 190');
    expect(c?.units).toBeGreaterThan(0);
  });

  it('resolves a retired number to today\'s course and says that it did', () => {
    // AB 1111 renumbering: ECON 101 became ECON C2002 (courses.ts formerCode).
    const hit = resolveCourseCodeDetailed('ECON 101');
    expect(hit).not.toBeNull();
    expect(hit!.course.code).toBe('ECON C2002');
    expect(hit!.course.formerCode).toBe('ECON 101');
    expect(hit!.viaFormerCode).toBe('ECON 101');
  });

  it('returns null for a code the catalog does not carry', () => {
    expect(resolveCourseCode('MATH 9999')).toBeNull();
    expect(resolveCourseCode('')).toBeNull();
  });

  it('offers the nearest catalog codes as a hint', () => {
    const cands = courseCandidates('MATH 19', 3);
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.every((c) => c.code.startsWith('MATH'))).toBe(true);
  });
});

describe('resolveCourseList', () => {
  it('keeps unresolvable codes separate rather than silently dropping them', () => {
    const r = resolveCourseList(['math190', 'CSCI 1', 'NOPE 404']);
    expect(r.codes).toEqual(['MATH 190', 'CSCI 1']);
    expect(r.unknown).toEqual(['NOPE 404']);
  });

  it('records a renamed course instead of hiding the rename', () => {
    const r = resolveCourseList(['ECON 101']);
    expect(r.codes).toEqual(['ECON C2002']);
    expect(r.renamed).toEqual([{ given: 'ECON 101', code: 'ECON C2002' }]);
  });

  it('de-duplicates a course given twice under both of its numbers, and says so', () => {
    const r = resolveCourseList(['ECON 101', 'ECON C2002']);
    expect(r.codes).toEqual(['ECON C2002']);
    // Merging is right — one course is one course — but silence is not: a
    // student who listed both numbers believing them two classes needs to know.
    expect(r.duplicates).toEqual([{ code: 'ECON C2002', count: 2 }]);
    expect(duplicateCaveats(r.duplicates)).toEqual([
      'Duplicate entries merged: ECON C2002 ×2. Each course was counted once.',
    ]);
  });

  it('counts repeats across spelling variants of one code', () => {
    const r = resolveCourseList(['math190', 'MATH 190', 'MATH-190', 'CSCI 1']);
    expect(r.codes).toEqual(['MATH 190', 'CSCI 1']);
    expect(r.duplicates).toEqual([{ code: 'MATH 190', count: 3 }]);
  });

  it('reports no duplicates when there are none', () => {
    const r = resolveCourseList(['MATH 190', 'CSCI 1']);
    expect(r.duplicates).toEqual([]);
    expect(duplicateCaveats(r.duplicates)).toEqual([]);
  });
});
