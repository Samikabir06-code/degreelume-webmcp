import { describe, it, expect } from 'vitest';
import { geAreaPlan, type GeAreaSpec } from './geSelection';
import { ECC_COURSES } from '../data/courses';
import type { CourseCode } from '../types';

// Cal-GETC Area 4 in the real catalog: ECON C2001/C2002 (Economics, renumbered
// from ECON 102/101 for Fall 2026) and
// PSYC C1000 (Psychology) — two disciplines, exactly enough to exercise the
// rule: 2 courses from ≥2 disciplines.
const AREA4: GeAreaSpec = { id: '4', need: 2, minDepts: 2 };
const AREA1A: GeAreaSpec = { id: '1A', need: 1, minDepts: 1 };
const set = (...c: CourseCode[]) => new Set(c);
const none = () => new Set<CourseCode>();

describe('geAreaPlan · per-area state (Cal-GETC Area 4: 2 courses / 2 disciplines)', () => {
  it('one completed course → partial, owes one more from a new discipline', () => {
    const p = geAreaPlan(AREA4, ECC_COURSES, 'calgetc', set('ECON C2002'), none(), none());
    expect(p.status).toBe('partial');
    expect(p.planHave).toBe(1);
    expect(p.remaining).toBe(1);
    expect(p.needsNewDept).toBe(true);
    expect(p.options.find((o) => o.code === 'ECON C2002')!.state).toBe('done');
    expect(p.options.find((o) => o.code === 'PSYC C1000')!.state).toBe('available');
  });

  it('one done + one CHOSEN from a different discipline → planned (not done)', () => {
    const p = geAreaPlan(AREA4, ECC_COURSES, 'calgetc', set('ECON C2002'), none(), set('PSYC C1000'));
    expect(p.status).toBe('planned');
    expect(p.doneHave).toBe(1); // only the completed one is a fact
    expect(p.planHave).toBe(2);
    expect(p.remaining).toBe(0);
    expect(p.needsNewDept).toBe(false);
    expect(p.options.find((o) => o.code === 'PSYC C1000')!.state).toBe('chosen');
  });

  it('two completed across two disciplines → done (finished coursework alone)', () => {
    const p = geAreaPlan(AREA4, ECC_COURSES, 'calgetc', set('ECON C2002', 'PSYC C1000'), none(), none());
    expect(p.status).toBe('done');
    expect(p.doneHave).toBe(2);
    expect(p.doneDepts).toBe(2);
  });

  it('two courses from the SAME discipline → still partial (discipline rule bites)', () => {
    const p = geAreaPlan(AREA4, ECC_COURSES, 'calgetc', set('ECON C2002'), none(), set('ECON C2001'));
    expect(p.planHave).toBe(2);
    expect(p.planDepts).toBe(1);
    expect(p.status).toBe('partial');
    expect(p.needsNewDept).toBe(true);
  });

  it('an in-progress course counts toward the plan but never toward done', () => {
    const p = geAreaPlan(AREA4, ECC_COURSES, 'calgetc', set('ECON C2002'), set('PSYC C1000'), none());
    expect(p.status).toBe('planned');
    expect(p.doneHave).toBe(1);
    expect(p.options.find((o) => o.code === 'PSYC C1000')!.state).toBe('in-progress');
  });

  it('an engine-PLANNED default satisfies the area as "planned", and ranks below a chosen pick', () => {
    // Two engine-scheduled defaults from two disciplines → area reads planned.
    const p = geAreaPlan(AREA4, ECC_COURSES, 'calgetc', none(), none(), none(), set('ECON C2002', 'PSYC C1000'));
    expect(p.status).toBe('planned');
    expect(p.planHave).toBe(2);
    expect(p.options.find((o) => o.code === 'ECON C2002')!.state).toBe('planned');
    // A course that's both chosen and planned reads as the stronger "chosen".
    const q = geAreaPlan(AREA4, ECC_COURSES, 'calgetc', none(), none(), set('ECON C2002'), set('ECON C2002', 'PSYC C1000'));
    expect(q.options.find((o) => o.code === 'ECON C2002')!.state).toBe('chosen');
  });

  it('single-course area (1A) is done with one completed composition course', () => {
    const p = geAreaPlan(AREA1A, ECC_COURSES, 'calgetc', set('ENGL C1000'), none(), none());
    expect(p.status).toBe('done');
    expect(p.need).toBe(1);
  });
});
