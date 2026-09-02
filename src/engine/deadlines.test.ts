import { describe, it, expect } from 'vitest';
import { upcomingDeadlines, nextOccurrence } from './deadlines';
import { DEADLINE_RULES } from '../data/deadlines';
import { runAudit, type AuditInputs } from './runAudit';
import { getRequirements } from '../data/requirements';
import { getAssociateDegree } from '../data/degrees';
import { getUpperDiv } from '../data/upperdiv';
import { ECC_COURSES } from '../data/courses';
import { GE_PATTERNS } from '../data/gePatterns';
import { ECC_GE_AREAS } from '../data/eccge';
import type { StudentProfile } from '../types';

// Deadline engine (D2) — fixed clocks, never wall time.

const BASE: StudentProfile = {
  college: 'ecc', status: 'current', goal: 'transfer', gradTrack: 'adt', school: 'ucr',
  major: 'business', fromMajor: null, completed: [], inProgress: [], exams: [],
  frenchBac: false, gpa: '3.0', startTerm: 'Fall 2026', termLoad: 'normal',
  ccEntryTerm: 'Fall 2024', gePatternChoice: 'auto',
};

const INPUTS: AuditInputs = {
  requirementSet: getRequirements('ucr', 'business'),
  associateDegree: getAssociateDegree('business'),
  upperDivSet: getUpperDiv('ucr', 'business'),
  collegeName: 'El Camino College',
  schoolName: 'UC Riverside',
  schoolSystem: 'UC',
  catalog: ECC_COURSES,
  gePattern: GE_PATTERNS.igetc,
  eccgeAreas: ECC_GE_AREAS,
  examCourses: [],
  dataVersion: 'deadline-test',
};

const JUNE_9 = new Date(2026, 5, 9);
const DEC_15 = new Date(2026, 11, 15);

const deadlinesFor = (profile: Partial<StudentProfile>, now: Date, system: 'UC' | 'CSU' = 'UC') => {
  const p = { ...BASE, ...profile };
  return upcomingDeadlines(p, runAudit(p, INPUTS), DEADLINE_RULES, system, now);
};

describe('nextOccurrence', () => {
  it('uses this year when the date is still ahead', () => {
    expect(nextOccurrence(7, 9, JUNE_9).getFullYear()).toBe(2026);
  });
  it('rolls to next year when the date has passed', () => {
    expect(nextOccurrence(7, 9, DEC_15).getFullYear()).toBe(2027);
  });
  it('counts today as upcoming, not passed', () => {
    const d = nextOccurrence(6, 9, JUNE_9);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
  });
});

describe('upcomingDeadlines — relevance filtering', () => {
  it('transfer goal at a UC: UC dates in order, no CSU, no graduation dates', () => {
    // From June 9, 2026: Aug 1 → Sep 1 → Sep 30 → Oct 1 → Nov 30 → Jan 31 (2027 TAU)
    const ids = deadlinesFor({ goal: 'transfer' }, JUNE_9).map((d) => d.id);
    expect(ids).toEqual(['uc-app-opens', 'uc-tag-opens', 'uc-tag-deadline', 'uc-filing-opens', 'uc-filing-deadline', 'uc-tau']);
  });
  it('the UC filing deadline is Nov 30 (Dec 1 was a fall-2026-only weekend extension)', () => {
    const filing = deadlinesFor({ goal: 'transfer' }, JUNE_9).find((d) => d.id === 'uc-filing-deadline')!;
    expect(filing.dateLabel).toBe('Nov 30, 2026');
  });
  it('graduation-only goal: college dates only', () => {
    const ids = deadlinesFor({ goal: 'graduate' }, JUNE_9).map((d) => d.id);
    expect(ids).toEqual(['ecc-grad-intent']);
  });
  it('"both" goal gets the union, sorted by date', () => {
    const ids = deadlinesFor({ goal: 'both' }, JUNE_9).map((d) => d.id);
    expect(ids[0]).toBe('ecc-grad-intent'); // Jul 9 comes before Aug 1
    expect(ids).toContain('uc-filing-deadline');
  });
  it('a CSU target sees CSU application dates, not UC ones', () => {
    const ids = deadlinesFor({ goal: 'transfer' }, JUNE_9, 'CSU').map((d) => d.id);
    expect(ids).toEqual(['csu-filing-deadline']);
  });
  it('does not tell a UCLA student to file TAG because UCLA does not participate', () => {
    const ids = deadlinesFor({ goal: 'transfer', school: 'ucla' }, JUNE_9).map((d) => d.id);
    expect(ids).not.toContain('uc-tag-opens');
    expect(ids).not.toContain('uc-tag-deadline');
    expect(ids).toContain('uc-filing-deadline');
  });
  it('keeps TAG dates for an eligible UCR major without campus-specific copy', () => {
    const tag = deadlinesFor({ goal: 'transfer', school: 'ucr', major: 'business' }, JUNE_9)
      .find((d) => d.id === 'uc-tag-deadline');
    expect(tag?.action).toBe('Submit your TAG application in UC TAP — the window closes today');
  });
});

describe('upcomingDeadlines — dates, context, limits', () => {
  it('computes days-left from the fixed clock', () => {
    const tag = deadlinesFor({}, JUNE_9).find((d) => d.id === 'uc-tag-deadline')!;
    expect(tag.dateLabel).toBe('Sep 30, 2026');
    expect(tag.daysLeft).toBe(113);
  });
  it('ties hard application deadlines to the student’s own gaps', () => {
    const filing = deadlinesFor({ completed: [] }, JUNE_9).find((d) => d.id === 'uc-filing-deadline')!;
    expect(filing.context).toMatch(/missing 6 required prep courses/);
  });
  it('the hard TAG cutoff carries the gap context too; soft window-opens dates do not', () => {
    const all = deadlinesFor({ completed: [] }, JUNE_9);
    expect(all.find((d) => d.id === 'uc-tag-deadline')!.context).toMatch(/missing 6/);
    expect(all.find((d) => d.id === 'uc-tag-opens')!.context).toBeNull();
    expect(all.find((d) => d.id === 'uc-app-opens')!.context).toBeNull();
  });
  it('drops the gap context once required prep is complete', () => {
    // Real Business agreement closure: four fixed rows + one pick per group.
    const done = ['BUS 101', 'BUS 150', 'ECON 101', 'ECON 102', 'MATH 165', 'STAT C1000'];
    const filing = deadlinesFor({ completed: done }, JUNE_9).find((d) => d.id === 'uc-filing-deadline')!;
    expect(filing.context).toBeNull();
  });
  it('respects the limit option', () => {
    const p = { ...BASE, goal: 'both' as const };
    const top = upcomingDeadlines(p, runAudit(p, INPUTS), DEADLINE_RULES, 'UC', JUNE_9, { limit: 3 });
    expect(top).toHaveLength(3);
    expect(top[0].id).toBe('ecc-grad-intent');
  });
  it('rolls past dates into next year instead of dropping them', () => {
    const ids = deadlinesFor({}, DEC_15).map((d) => d.id);
    expect(ids[0]).toBe('uc-tau'); // Jan 31, 2027 — soonest after Dec 15 (filing closed Nov 30)
    const first = deadlinesFor({}, DEC_15)[0];
    expect(first.date.getFullYear()).toBe(2027);
  });
});
