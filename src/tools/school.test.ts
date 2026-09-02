import { describe, it, expect, beforeEach } from 'vitest';
import { SCHOOL_IMPLS } from './school';
import type { ToolContext } from './runtime';
import { isToolError } from './runtime';
import { INITIAL_STATE, __setStateForTests, getState, setState } from '../lib/store';
import type { CanvasAssignmentSnapshot, CanvasCourseSnapshot } from '../lib/store';
import { loadSampleStudent, SAMPLE_CITATION } from '../lib/sampleStudent';
import type { RadarFlag } from '../engine/riskRadar';

const FIXED_NOW = new Date('2026-09-02T12:00:00Z');

function ctx(now: Date = FIXED_NOW): ToolContext {
  return { state: getState(), setState, now };
}

beforeEach(() => {
  __setStateForTests({ ...INITIAL_STATE, activity: [], reminders: [] });
});

interface CurrentCoursesData {
  source: string;
  active: CanvasCourseSnapshot[];
  completed: CanvasCourseSnapshot[];
}

interface UpcomingWorkData {
  windowDays: number;
  items: CanvasAssignmentSnapshot[];
  overdue: CanvasAssignmentSnapshot[];
  counts: { total: number; overdue: number; missing: number; dueSoon: number };
}

interface GradeRiskData {
  flags: RadarFlag[];
  summary: { ok: number; watch: number; risk: number };
  unmapped: string[];
}

interface DeadlineItem {
  kind: 'application' | 'coursework' | 'canvas' | 'reminder';
  date: string | null;
  label: string;
  source?: { name: string; url: string };
}

interface DeadlinesData {
  before: string;
  items: DeadlineItem[];
}

// ─── get_current_courses ────────────────────────────────────────────────────

describe('get_current_courses', () => {
  it('errors with canvas_not_connected when there is no snapshot', async () => {
    const out = await SCHOOL_IMPLS.get_current_courses({}, ctx());
    expect(isToolError(out)).toBe(true);
    if (isToolError(out)) expect(out.error).toBe('canvas_not_connected');
  });

  it('lists active and completed courses for the sample student, labelled as sample', async () => {
    loadSampleStudent(FIXED_NOW);
    const out = await SCHOOL_IMPLS.get_current_courses({}, ctx());
    expect(isToolError(out)).toBe(false);
    if (isToolError(out)) return;
    const data = out.data as CurrentCoursesData;
    expect(data.source).toBe('sample');
    expect(data.active).toHaveLength(4);
    expect(data.completed).toHaveLength(6);
    expect(out.citations).toContainEqual(SAMPLE_CITATION);
    expect(out.caveats).toContain('This is the labelled sample student, not a real Canvas.');
    expect(out.summary).toMatch(/sample student/i);
  });
});

// ─── get_upcoming_work ───────────────────────────────────────────────────────

describe('get_upcoming_work', () => {
  it('errors with canvas_not_connected when there is no snapshot', async () => {
    const out = await SCHOOL_IMPLS.get_upcoming_work({}, ctx());
    expect(isToolError(out)).toBe(true);
  });

  it('defaults to a 7-day window: 2 overdue + 4 due soon = 6 items', async () => {
    loadSampleStudent(FIXED_NOW);
    const out = await SCHOOL_IMPLS.get_upcoming_work({}, ctx());
    expect(isToolError(out)).toBe(false);
    if (isToolError(out)) return;
    const data = out.data as UpcomingWorkData;
    expect(data.windowDays).toBe(7);
    expect(data.overdue).toHaveLength(2);
    expect(data.items).toHaveLength(6);
    expect(data.counts.missing).toBe(2);
    // Sorted by due date ascending: the most-overdue item comes first.
    const dates = data.items.map((i) => new Date(i.dueAt as string).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });

  it('widening the window to 30 days returns all 10 sample assignments', async () => {
    loadSampleStudent(FIXED_NOW);
    const out = await SCHOOL_IMPLS.get_upcoming_work({ days: 30 }, ctx());
    expect(isToolError(out)).toBe(false);
    if (isToolError(out)) return;
    const data = out.data as UpcomingWorkData;
    expect(data.items).toHaveLength(10);
    expect(data.overdue).toHaveLength(2);
  });

  it('restricts to one course by catalog code', async () => {
    loadSampleStudent(FIXED_NOW);
    const out = await SCHOOL_IMPLS.get_upcoming_work({ days: 30, course: 'MATH 191' }, ctx());
    expect(isToolError(out)).toBe(false);
    if (isToolError(out)) return;
    const data = out.data as UpcomingWorkData;
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items.every((i) => i.courseLabel === 'MATH 191')).toBe(true);
  });
});

// ─── get_grade_risk ──────────────────────────────────────────────────────────

describe('get_grade_risk', () => {
  it('errors with canvas_not_connected when there is no snapshot', async () => {
    const out = await SCHOOL_IMPLS.get_grade_risk({}, ctx());
    expect(isToolError(out)).toBe(true);
  });

  it('flags the sample student watch/ok/risk/ok, matching the real engine math', async () => {
    loadSampleStudent(FIXED_NOW);
    const out = await SCHOOL_IMPLS.get_grade_risk({}, ctx());
    expect(isToolError(out)).toBe(false);
    if (isToolError(out)) return;
    const data = out.data as GradeRiskData;
    expect(data.summary).toEqual({ ok: 2, watch: 1, risk: 1 });
    expect(data.unmapped).toEqual([]);
    const byId = Object.fromEntries(data.flags.map((f) => [f.course.canvasCourseId, f.level]));
    expect(byId['sample-math191']).toBe('watch');
    expect(byId['sample-csci2']).toBe('ok');
    expect(byId['sample-phys1b']).toBe('risk');
    expect(byId['sample-psyc1000']).toBe('ok');
    expect(out.citations).toContainEqual(SAMPLE_CITATION);
    expect(out.citations.length).toBeGreaterThan(1); // grade rule + requirement source too
  });

  it('caveats an unset target and returns no-requirement flags for every course', async () => {
    loadSampleStudent(FIXED_NOW);
    setState({ target: { campus: '', major: '', entryTerm: '' } });
    const out = await SCHOOL_IMPLS.get_grade_risk({}, ctx());
    expect(isToolError(out)).toBe(false);
    if (isToolError(out)) return;
    expect(out.caveats).toContain(
      'No target campus/major set, so no requirement could be attached; grades are shown without a verdict.',
    );
    const data = out.data as GradeRiskData;
    expect(data.flags.every((f) => f.requirement.kind === 'no-requirement')).toBe(true);
  });
});

// ─── get_deadlines ───────────────────────────────────────────────────────────

describe('get_deadlines', () => {
  it('never errors, even with no Canvas connected and no target', async () => {
    const out = await SCHOOL_IMPLS.get_deadlines({}, ctx());
    expect(isToolError(out)).toBe(false);
  });

  it('merges application, canvas and reminder items for the sample student, sorted by date', async () => {
    loadSampleStudent(FIXED_NOW);
    const out = await SCHOOL_IMPLS.get_deadlines({}, ctx());
    expect(isToolError(out)).toBe(false);
    if (isToolError(out)) return;
    const data = out.data as DeadlinesData;

    const kinds = new Set(data.items.map((i) => i.kind));
    expect(kinds.has('canvas')).toBe(true);
    expect(kinds.has('reminder')).toBe(true);
    expect(kinds.has('application')).toBe(true);

    // Not-submitted Canvas assignments: all 10 sample items, none submitted.
    expect(data.items.filter((i) => i.kind === 'canvas')).toHaveLength(10);
    // Only the OPEN reminder, not the done one.
    expect(data.items.filter((i) => i.kind === 'reminder')).toHaveLength(1);

    const dated = data.items.filter((i) => i.date !== null);
    const times = dated.map((i) => new Date(i.date as string).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('filters by kinds', async () => {
    loadSampleStudent(FIXED_NOW);
    const out = await SCHOOL_IMPLS.get_deadlines({ kinds: ['reminder'] }, ctx());
    expect(isToolError(out)).toBe(false);
    if (isToolError(out)) return;
    const data = out.data as DeadlinesData;
    expect(data.items.every((i) => i.kind === 'reminder')).toBe(true);
    expect(data.items).toHaveLength(1);
  });

  it('respects `before`: every dated item falls on or before it', async () => {
    loadSampleStudent(FIXED_NOW);
    const out = await SCHOOL_IMPLS.get_deadlines({ before: '2026-09-10' }, ctx());
    expect(isToolError(out)).toBe(false);
    if (isToolError(out)) return;
    const data = out.data as DeadlinesData;
    const cutoff = new Date('2026-09-10T23:59:59').getTime();
    for (const item of data.items) {
      if (item.date) expect(new Date(item.date).getTime()).toBeLessThanOrEqual(cutoff);
    }
  });

  it('accepts an unpadded calendar day instead of crashing on it', async () => {
    // "2026-9-5" passes the JSON schema (it is a string), and used to become
    // new Date("2026-9-5T23:59:59") — an Invalid Date whose .toISOString()
    // threw a RangeError the agent saw as a generic tool_failed.
    loadSampleStudent(FIXED_NOW);
    const out = await SCHOOL_IMPLS.get_deadlines({ before: '2026-9-5' }, ctx());
    expect(isToolError(out)).toBe(false);
    if (isToolError(out)) return;
    const data = out.data as DeadlinesData;
    // Normalised to the END of that day, so things due on the 5th are included.
    expect(data.before).toBe(new Date(2026, 8, 5, 23, 59, 59, 999).toISOString());
    const cutoff = new Date(data.before).getTime();
    for (const item of data.items) {
      if (item.date) expect(new Date(item.date).getTime()).toBeLessThanOrEqual(cutoff);
    }
  });

  it('a date it cannot read is bad_date with a hint, not tool_failed', async () => {
    for (const before of ['soonish', '2026-02-31', '09/05/2026', '']) {
      const out = await SCHOOL_IMPLS.get_deadlines({ before }, ctx());
      if (before === '') {
        // An empty string is "no window given", not a broken one.
        expect(isToolError(out), before).toBe(false);
        continue;
      }
      expect(isToolError(out), before).toBe(true);
      if (!isToolError(out)) continue;
      expect(out.error, before).toBe('bad_date');
      expect(out.hint, before).toContain('YYYY-MM-DD');
    }
  });

  it('falls back to the generic UC+CSU calendar with no target set, and caveats it', async () => {
    const out = await SCHOOL_IMPLS.get_deadlines({}, ctx());
    expect(isToolError(out)).toBe(false);
    if (isToolError(out)) return;
    expect(out.caveats.some((c) => c.includes('generic UC and CSU calendar'))).toBe(true);
    const data = out.data as DeadlinesData;
    expect(data.items.some((i) => i.kind === 'application')).toBe(true);
  });

  it('names the publisher in source.name, not the item label', async () => {
    const out = await SCHOOL_IMPLS.get_deadlines({}, ctx());
    expect(isToolError(out)).toBe(false);
    if (isToolError(out)) return;
    const data = out.data as DeadlinesData;
    const application = data.items.filter((i) => i.kind === 'application');
    expect(application.length).toBeGreaterThan(0);
    for (const item of application) {
      expect(item.source).toBeDefined();
      expect(item.source?.name).not.toBe(item.label);
      expect(item.source?.name).not.toMatch(/^https?:/);
    }
    const uc = application.find((i) => i.source?.url.includes('admission.universityofcalifornia.edu'));
    expect(uc?.source?.name).toBe('UC admissions: dates and deadlines');
    const csu = application.find((i) => i.source?.url.includes('calstate.edu'));
    expect(csu?.source?.name).toBe('Cal State Apply');
  });

  it('includes SAMPLE_CITATION and the sample caveat for the sample student', async () => {
    loadSampleStudent(FIXED_NOW);
    const out = await SCHOOL_IMPLS.get_deadlines({}, ctx());
    expect(isToolError(out)).toBe(false);
    if (isToolError(out)) return;
    expect(out.citations).toContainEqual(SAMPLE_CITATION);
    expect(out.caveats).toContain('This is the labelled sample student, not a real Canvas.');
  });
});
