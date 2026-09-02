import { describe, it, expect, beforeEach } from 'vitest';
import { INITIAL_STATE, __setStateForTests, getState } from './store';
import { SAMPLE_CITATION, isSample, loadSampleStudent } from './sampleStudent';
import { ECC_COURSES } from '../data/courses';

const CATALOG_CODES = new Set(ECC_COURSES.map((c) => c.code));
const NOW = new Date('2026-09-02T12:00:00Z');

beforeEach(() => {
  __setStateForTests({ ...INITIAL_STATE });
});

describe('SAMPLE_CITATION', () => {
  it('is labelled as sample, never as real data', () => {
    expect(SAMPLE_CITATION.verification).toBe('sample');
    expect(SAMPLE_CITATION.sourceName).toMatch(/sample/i);
  });
});

describe('isSample', () => {
  it('is false before the sample is loaded', () => {
    expect(isSample(getState())).toBe(false);
  });

  it('is true once the sample is loaded', () => {
    loadSampleStudent(NOW);
    expect(isSample(getState())).toBe(true);
  });
});

describe('loadSampleStudent', () => {
  it('uses only course codes that exist in the real catalog', () => {
    loadSampleStudent(NOW);
    const state = getState();
    for (const code of state.completed) expect(CATALOG_CODES.has(code)).toBe(true);
    for (const code of state.inProgress) expect(CATALOG_CODES.has(code)).toBe(true);
    for (const course of state.canvas?.courses ?? []) {
      if (course.mappedCatalogCode) expect(CATALOG_CODES.has(course.mappedCatalogCode)).toBe(true);
    }
  });

  it('sets the target to UCLA CS, Fall 2024 entry', () => {
    loadSampleStudent(NOW);
    expect(getState().target).toEqual({ campus: 'ucla', major: 'cs', entryTerm: 'Fall 2024' });
  });

  it('builds a labelled sample Canvas snapshot with no live connection', () => {
    loadSampleStudent(NOW);
    const state = getState();
    expect(state.canvas?.source).toBe('sample');
    expect(state.canvas?.host).toBe('sample');
    expect(state.canvas?.userName).toBe('Sample student');
    expect(state.canvasConnection).toBeNull();
  });

  it('has 6 completed and 4 in-progress courses, matching the Canvas snapshot', () => {
    loadSampleStudent(NOW);
    const state = getState();
    expect(state.completed).toHaveLength(6);
    expect(state.inProgress).toHaveLength(4);
    const active = state.canvas?.courses.filter((c) => c.enrollmentState === 'active') ?? [];
    const completed = state.canvas?.courses.filter((c) => c.enrollmentState === 'completed') ?? [];
    expect(active).toHaveLength(4);
    expect(completed).toHaveLength(6);
    expect(active.map((c) => c.mappedCatalogCode).sort()).toEqual([...state.inProgress].sort());
    expect(completed.map((c) => c.mappedCatalogCode).sort()).toEqual([...state.completed].sort());
  });

  it('gives every in-progress course a numeric score and a confirmed mapping', () => {
    loadSampleStudent(NOW);
    const active = getState().canvas?.courses.filter((c) => c.enrollmentState === 'active') ?? [];
    for (const course of active) {
      expect(typeof course.score).toBe('number');
      expect(course.mappedCatalogCode).not.toBeNull();
      expect(course.mappingCandidates).toEqual([]);
    }
  });

  it('builds exactly 10 assignments: 2 overdue/missing, 4 within 7 days, 4 more within 30 days', () => {
    loadSampleStudent(NOW);
    const assignments = getState().canvas?.assignments ?? [];
    expect(assignments).toHaveLength(10);

    const dayMs = 86_400_000;
    const overdue = assignments.filter((a) => a.dueAt && new Date(a.dueAt).getTime() < NOW.getTime());
    const within7 = assignments.filter((a) => {
      const t = a.dueAt ? new Date(a.dueAt).getTime() : NaN;
      return t >= NOW.getTime() && t <= NOW.getTime() + 7 * dayMs;
    });
    const within30NotWithin7 = assignments.filter((a) => {
      const t = a.dueAt ? new Date(a.dueAt).getTime() : NaN;
      return t > NOW.getTime() + 7 * dayMs && t <= NOW.getTime() + 30 * dayMs;
    });

    expect(overdue).toHaveLength(2);
    expect(overdue.every((a) => a.missing)).toBe(true);
    expect(within7).toHaveLength(4);
    expect(within30NotWithin7).toHaveLength(4);
  });

  it('sets two reminders, one of them done', () => {
    loadSampleStudent(NOW);
    const reminders = getState().reminders;
    expect(reminders).toHaveLength(2);
    expect(reminders.filter((r) => r.done)).toHaveLength(1);
    expect(reminders.filter((r) => !r.done)).toHaveLength(1);
  });
});
