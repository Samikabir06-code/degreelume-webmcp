import { describe, expect, it } from 'vitest';
import type { Course, StudentProfile } from '../types';
import { offeringFor, knownNotOffered, patternIncludes, TERMS_PULLED } from './termOfferings';
import { buildTermPlan } from './buildTermPlan';
import { TERM_OFFERINGS } from '../data/termOfferings';

describe('term offerings — what the college actually runs when', () => {
  it('knows the terms it actually pulled, and claims nothing about others', () => {
    // Summer is deliberately absent: we never read a Summer schedule, so the
    // engine must not imply anything about one.
    expect(Object.values(TERMS_PULLED)).toEqual(['Fall 2026', 'Winter 2027', 'Spring 2027']);
  });

  it('confirms a course listed in a term we pulled', () => {
    // MATH 190 is listed in all three pulled terms.
    const answer = offeringFor('MATH 190', 'Fall 2026');
    expect(answer.status).toBe('offered');
    expect(answer.detail).toMatch(/published schedule/i);
  });

  it('rules out a course the published schedule for that term does not list', () => {
    // CHEM 1A is "Summer, Fall and Spring Only" — it is NOT in Winter 2027,
    // and Winter 2027 is a term we actually read.
    expect(TERM_OFFERINGS['CHEM 1A'].listed).not.toContain('W');
    const answer = offeringFor('CHEM 1A', 'Winter 2027');
    expect(answer.status).toBe('not-offered');
    expect(knownNotOffered('CHEM 1A', 'Winter 2027')).toBe(true);
    expect(answer.detail).toContain('Summer, Fall and Spring Only');
  });

  it('falls back to the college\'s published cycle for a term nobody has published', () => {
    // Fall 2027's schedule does not exist yet. "Fall and Spring Only" still
    // tells us something honest about it.
    const fall = offeringFor('BIOL 110', 'Fall 2027');
    expect(fall.status).toBe('offered');
    expect(fall.detail).toMatch(/isn't published yet/i);
    const winter = offeringFor('BIOL 110', 'Winter 2028');
    expect(winter.status).toBe('not-offered');
  });

  it('a course with no published cycle in an unpulled term is UNKNOWN, not a no', () => {
    // ANTH 11 carries no cycle string at all.
    expect(TERM_OFFERINGS['ANTH 11'].pattern).toBeNull();
    const answer = offeringFor('ANTH 11', 'Fall 2027');
    expect(answer.status).toBe('unknown');
    expect(knownNotOffered('ANTH 11', 'Fall 2027')).toBe(false);
  });

  it('a course we have no record of at all is UNKNOWN', () => {
    expect(offeringFor('ZZZZ 999', 'Fall 2026').status).toBe('unknown');
    expect(knownNotOffered('ZZZZ 999', 'Fall 2026')).toBe(false);
  });

  it('reads the cycle vocabulary, and refuses to read anything else', () => {
    expect(patternIncludes('Every Term', 'Winter')).toBe(true);
    expect(patternIncludes('Fall and Spring Only', 'Winter')).toBe(false);
    expect(patternIncludes('Fall and Spring Only', 'Spring')).toBe(true);
    expect(patternIncludes('Summer, Fall and Spring Only', 'Summer')).toBe(true);
    expect(patternIncludes('Winter Term Only', 'Winter')).toBe(true);
    // Not a recognised cycle string → unknown, never a silent "no".
    expect(patternIncludes('Offered when funded', 'Fall')).toBeNull();
    expect(patternIncludes(null, 'Fall')).toBeNull();
  });

  it('a malformed term label is unknown rather than an assumption', () => {
    expect(offeringFor('MATH 190', 'sometime next year').status).toBe('unknown');
  });
});

// What the PLAN carries out of this, because "the planner only schedules
// classes we know are available" is a claim the UI makes on the engine's
// behalf, and it is only half true: the planner refuses a term it KNOWS is
// wrong, and stays silent about the ones it doesn't know. The board has to be
// able to tell those two apart, so every planned course carries its evidence.
describe('the term plan carries its own evidence', () => {
  const catalog: Course[] = [
    // 'CHEM 1A' is real, and really is "Summer, Fall and Spring Only" — so a
    // Winter placement is one the college's own cycle rules out.
    { code: 'CHEM 1A', name: 'General Chemistry I', dept: 'Chemistry', units: 5, igetc: [], calgetc: [], eccge: [] },
    // 'MATH 190' is listed in all three pulled terms.
    { code: 'MATH 190', name: 'Calculus I', dept: 'Mathematics', units: 5, igetc: [], calgetc: [], eccge: [] },
    // No offering record at all → unknown, and unknown never blocks.
    { code: 'ZZZZ 999', name: 'Unrecorded Course', dept: 'Nowhere', units: 3, igetc: [], calgetc: [], eccge: [] },
  ];
  const targets = {
    requiredReqs: [
      { id: 'r-chem', label: 'Chemistry', options: ['CHEM 1A'], required: true },
      { id: 'r-math', label: 'Calculus', options: ['MATH 190'], required: true },
      { id: 'r-zzz', label: 'Unrecorded', options: ['ZZZZ 999'], required: true },
    ],
    optionalReqs: [],
    geAreas: [],
    geField: 'igetc' as const,
    geLabel: 'General ed',
    eccgeAreas: [],
    unitFloor: 0,
  };
  const profile = {
    college: 'ecc', status: 'new', goal: 'transfer', gradTrack: 'adt',
    school: 'ucr', major: 'business', fromMajor: null,
    completed: [], inProgress: [], exams: [], frenchBac: false, gpa: '',
    // Start in Winter so the very first term is one CHEM 1A cannot run in.
    startTerm: 'Winter 2027', termLoad: 'normal', ccEntryTerm: 'Fall 2024',
    gePatternChoice: 'auto', includeIntersessions: true,
  } as unknown as StudentProfile;

  const plan = buildTermPlan(profile, targets, catalog);
  const rows = plan.terms.flatMap((t) => t.courses.map((c) => ({ ...c, term: t.label })));

  it('never places a course in a term the college is known not to run it in', () => {
    const chem = rows.find((c) => c.code === 'CHEM 1A')!;
    expect(chem.term).not.toBe('Winter 2027');
    expect(chem.offering?.status).toBe('offered');
  });

  it('says WHICH term it had to skip, and why', () => {
    const chem = rows.find((c) => c.code === 'CHEM 1A')!;
    expect(chem.deferredFrom?.term).toBe('Winter 2027');
    expect(chem.deferredFrom?.detail).toContain('Summer, Fall and Spring Only');
  });

  it('marks a confirmed course as offered and an unrecorded one as unknown', () => {
    // The distinction the board draws. A course we simply have no data for is
    // still planned — an unknown must never move a student's course — but it
    // is labelled differently, so "we checked" is never implied.
    expect(rows.find((c) => c.code === 'MATH 190')!.offering?.status).toBe('offered');
    const unrecorded = rows.find((c) => c.code === 'ZZZZ 999')!;
    expect(unrecorded.offering?.status).toBe('unknown');
    expect(unrecorded.term).toBe('Winter 2027'); // placed anyway, in the first term
    expect(unrecorded.deferredFrom).toBeUndefined();
  });
});
