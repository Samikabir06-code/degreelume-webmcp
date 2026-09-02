import { describe, expect, it } from 'vitest';
import type { Course } from '../types';
import { ECC_COURSES, getCourse } from '../data/courses';
import {
  canonicalCode, canonicalCodes, codeAliases, formerCodeOf, hasRenumberedCourses,
} from './courseCodes';

// AB 1111 Common Course Numbering, El Camino's Fall 2026 (Phase II) batch.
// The mapping direction is sourced from the college's own crosswalk — see
// data-sources/ecc-catalog/ccn-crosswalk.csv. Getting Economics BACKWARDS
// would send a business student to the wrong required course, so it is pinned
// here by title, not just by code.
describe('renumbered courses resolve to the number the college publishes today', () => {
  it('carries the Fall 2026 numbers, with the old ones recorded', () => {
    expect(hasRenumberedCourses(ECC_COURSES)).toBe(true);
    // Micro and macro, each asserted against its TITLE. A test that only
    // compared codes would pass just as happily with the two inverted.
    const micro = getCourse('ECON C2001')!;
    expect(micro.name).toMatch(/Micro/i);
    expect(micro.formerCode).toBe('ECON 102');
    const macro = getCourse('ECON C2002')!;
    expect(macro.name).toMatch(/Macro/i);
    expect(macro.formerCode).toBe('ECON 101');
    expect(macro.formerCodeEffectiveTerm).toBe('Fall 2026');
    // The old numbers are gone from the catalog itself — a student searching
    // El Camino's schedule for "ECON 101" in Fall 2026 finds nothing.
    expect(getCourse('ECON 101')).toBeUndefined();
    expect(getCourse('ECON 102')).toBeUndefined();
  });

  it('resolves every old number in the batch', () => {
    const expected: Record<string, string> = {
      'ECON 101': 'ECON C2002', 'ECON 101H': 'ECON C2002H', 'ECON 102': 'ECON C2001',
      'ENGL 1B': 'ENGL C1002', 'ENGL 1BH': 'ENGL C1002H',
      'HIST 101': 'HIST C1001', 'HIST 101H': 'HIST C1001H',
      'HIST 102': 'HIST C1002', 'HIST 102H': 'HIST C1002H',
      'AHIS 102A': 'ARTH C1100', 'AHIS 102B': 'ARTH C1200',
      'COMS 130': 'COMM C1004', 'COMS 130H': 'COMM C1004H',
      'SLAN 111': 'ASL 111',
    };
    for (const [old, current] of Object.entries(expected)) {
      expect(canonicalCode(ECC_COURSES, old), `${old} should resolve to ${current}`).toBe(current);
    }
  });

  it('every alias points at a course that actually exists', () => {
    // Deliberately an invariant rather than a row count: the crosswalk grows
    // as the college publishes more of the CCN rollout, and a test that broke
    // on every sourced addition would just get its number bumped without
    // anyone reading it. What must never happen is an alias pointing nowhere.
    const live = new Set(ECC_COURSES.map((c) => c.code));
    for (const [former, current] of codeAliases(ECC_COURSES)) {
      expect(live.has(current), `${former} resolves to ${current}, which is not a catalog course`).toBe(true);
      expect(live.has(former), `${former} is both a live code and an alias`).toBe(false);
    }
  });

  it('leaves a code it does not recognize exactly as it found it', () => {
    // Unknown must stay unknown. Quietly mapping a code we don't hold to the
    // nearest-looking course is how a student is told they've met a
    // requirement they haven't.
    expect(canonicalCode(ECC_COURSES, 'ZZZZ 999')).toBe('ZZZZ 999');
    expect(canonicalCode(ECC_COURSES, 'MATH 190')).toBe('MATH 190');
  });

  it('lets a LIVE course outrank a stale alias', () => {
    // A college that recycles a retired number must not have the real course
    // shadowed by the alias of a different one.
    const recycled: Course[] = [
      { code: 'ECON 101', name: 'Something Else Entirely', dept: 'Economics', units: 3, igetc: [], calgetc: [], eccge: [] },
      { code: 'ECON C2002', name: 'Principles of Macroeconomics', dept: 'Economics', units: 3, igetc: [], calgetc: [], eccge: [], formerCode: 'ECON 101' },
    ];
    expect(canonicalCode(recycled, 'ECON 101')).toBe('ECON 101');
  });

  it('collapses a list that holds one course under both of its numbers', () => {
    // A saved plan can hold ECON 101 from before the renumbering and ECON
    // C2002 from after. That is one course, and counting it twice would
    // inflate the student's units.
    expect(canonicalCodes(ECC_COURSES, ['ECON 101', 'ECON C2002', 'MATH 190']))
      .toEqual(['ECON C2002', 'MATH 190']);
  });

  it('reports the former number so the UI can show both', () => {
    expect(formerCodeOf(ECC_COURSES, 'ECON C2002')).toBe('ECON 101');
    expect(formerCodeOf(ECC_COURSES, 'MATH 190')).toBeNull();
  });

  it('is inert for a catalog nobody has renumbered', () => {
    const plain: Course[] = [
      { code: 'MATH 1', name: 'Math', dept: 'Mathematics', units: 3, igetc: [], calgetc: [], eccge: [] },
    ];
    expect(hasRenumberedCourses(plain)).toBe(false);
    expect(codeAliases(plain).size).toBe(0);
    expect(canonicalCode(plain, 'ECON 101')).toBe('ECON 101');
  });
});
