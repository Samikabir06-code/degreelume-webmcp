import { describe, it, expect } from 'vitest';
import { auditFor, campusesWithData, profileFromState, schoolSystemOf, COLLEGE_ID } from './profile';
import { INITIAL_STATE, type PageState } from './store';
import { getRequirements } from '../data/requirements';
import { SCHOOLS } from '../data/schools';

const state = (over: Partial<PageState> = {}): PageState => ({ ...INITIAL_STATE, ...over });

describe('profileFromState', () => {
  it('an empty page produces an empty profile — nothing is defaulted', () => {
    const p = profileFromState(state());
    expect(p.school).toBe('');
    expect(p.major).toBe('');
    expect(p.ccEntryTerm).toBe('');
    expect(p.completed).toEqual([]);
    expect(p.inProgress).toEqual([]);
    // The one thing this build DOES know: it covers El Camino only.
    expect(p.college).toBe(COLLEGE_ID);
  });

  it('reads the page target when no override is given', () => {
    const p = profileFromState(state({
      target: { campus: 'ucla', major: 'cs', entryTerm: 'Fall 2024' },
      completed: ['MATH 190'],
      inProgress: ['MATH 191'],
    }));
    expect(p.school).toBe('ucla');
    expect(p.major).toBe('cs');
    expect(p.ccEntryTerm).toBe('Fall 2024');
    expect(p.completed).toEqual(['MATH 190']);
    expect(p.inProgress).toEqual(['MATH 191']);
  });

  it('an override wins over the page, field by field', () => {
    const base = state({ target: { campus: 'ucla', major: 'cs', entryTerm: 'Fall 2024' }, completed: ['MATH 190'] });
    const p = profileFromState(base, { campus: 'csulb', completed: ['CSCI 1'] });
    expect(p.school).toBe('csulb');
    expect(p.major).toBe('cs');            // untouched
    expect(p.completed).toEqual(['CSCI 1']);
  });
});

describe('auditFor', () => {
  it('returns null when the student has not chosen a campus or a major', () => {
    expect(auditFor(profileFromState(state()))).toBeNull();
    expect(auditFor(profileFromState(state({ target: { campus: 'ucla', major: '', entryTerm: '' } })))).toBeNull();
    expect(auditFor(profileFromState(state({ target: { campus: '', major: 'cs', entryTerm: '' } })))).toBeNull();
  });

  it('returns null when this build holds no agreement for the pair', () => {
    // A staged campus has no agreements in the slice.
    expect(getRequirements('uc-merced', 'cs', COLLEGE_ID)).toBeNull();
    const p = profileFromState(state({ target: { campus: 'uc-merced', major: 'cs', entryTerm: '' } }));
    expect(auditFor(p)).toBeNull();
  });

  it('runs the engine and reports the ASSIST agreement it used', () => {
    const p = profileFromState(state({
      target: { campus: 'ucla', major: 'cs', entryTerm: 'Fall 2024' },
      completed: ['MATH 190', 'CSCI 1'],
      inProgress: ['MATH 191'],
    }));
    const audit = auditFor(p)!;
    expect(audit.transfer).not.toBeNull();
    expect(audit.transfer!.requiredCount).toBeGreaterThan(0);
    expect(audit.transfer!.prepDone).toBeGreaterThan(0);
    // Entry fall 2024 = pre-AB-928, so IGETC catalog rights apply.
    expect(audit.transfer!.gePatternName).toBe('IGETC');
    expect(audit.sources.some((s) => s.sourceName.includes('ASSIST'))).toBe(true);
  });

  it('a fall-2025-or-later entry term forces Cal-GETC', () => {
    const p = profileFromState(state({ target: { campus: 'ucla', major: 'cs', entryTerm: 'Fall 2025' } }));
    expect(auditFor(p)!.transfer!.gePatternName).toBe('Cal-GETC');
  });

  it('carries no degree or upper-division audit — the slice holds none', () => {
    const p = profileFromState(state({ target: { campus: 'ucla', major: 'cs', entryTerm: '' } }));
    const audit = auditFor(p)!;
    expect(audit.degree).toBeNull();
    expect(audit.upperDiv).toBeNull();
  });
});

describe('campusesWithData', () => {
  it('returns nothing for an unchosen major rather than everything', () => {
    expect(campusesWithData('')).toEqual([]);
  });

  it('lists only ready campuses that hold an agreement, in registry order', () => {
    const list = campusesWithData('cs');
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((s) => s.ready)).toBe(true);
    expect(list.every((s) => getRequirements(s.id, 'cs', COLLEGE_ID) != null)).toBe(true);
    const registryOrder = SCHOOLS.filter((s) => list.some((l) => l.id === s.id)).map((s) => s.id);
    expect(list.map((s) => s.id)).toEqual(registryOrder);
  });

  it('this slice happens to cover all 17 ready campuses in all three majors', () => {
    // Worth pinning: the 4-step wiring recipe leaves holes when a major is not
    // offered somewhere, and here there are none — every ready campus has all
    // three. If a future data pull drops one, this fails loudly.
    const ready = SCHOOLS.filter((s) => s.ready).length;
    for (const major of ['business', 'cs', 'psych'] as const) {
      expect(campusesWithData(major)).toHaveLength(ready);
    }
  });
});

describe('schoolSystemOf', () => {
  it('reads the system off the registry', () => {
    expect(schoolSystemOf('ucla')).toBe('UC');
    expect(schoolSystemOf('csulb')).toBe('CSU');
    expect(schoolSystemOf('cal-poly-pomona')).toBe('CSU');
  });
});
