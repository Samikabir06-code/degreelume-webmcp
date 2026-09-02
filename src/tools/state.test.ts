import { describe, it, expect, beforeEach } from 'vitest';
import { STATE_IMPLS } from './state';
import { TRANSFER_IMPLS } from './transfer';
import { isToolError, type ToolContext } from './runtime';
import type { ToolOutput } from './contract';
import { INITIAL_STATE, type PageState } from '../lib/store';

// A live little store, so the state tools can actually write and the next call
// can read what they wrote — the same loop the page runs.
function makeCtx(initial: Partial<PageState> = {}) {
  let state: PageState = { ...INITIAL_STATE, ...initial };
  const ctx: ToolContext = {
    get state() { return state; },
    setState: (patch) => {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
    },
    now: new Date('2026-09-02T19:00:00Z'),
  };
  return { ctx, current: () => state };
}

async function ok(impls: typeof STATE_IMPLS, name: string, input: unknown, ctx: ToolContext): Promise<ToolOutput> {
  const out = await impls[name](input, ctx);
  if (isToolError(out)) throw new Error(`${name} errored: ${out.error} — ${out.message}`);
  return out;
}

let harness: ReturnType<typeof makeCtx>;
beforeEach(() => { harness = makeCtx(); });

describe('get_student_status', () => {
  it('an empty page reports empty — nothing is invented', async () => {
    const out = await ok(STATE_IMPLS, 'get_student_status', {}, harness.ctx);
    const d = out.data as {
      target: { campus: string | null; major: string | null };
      completed: string[]; canvas: unknown; headline: string | null;
      gePattern: { id: string; reason: string };
    };
    expect(d.target.campus).toBeNull();
    expect(d.target.major).toBeNull();
    expect(d.completed).toEqual([]);
    expect(d.canvas).toBeNull();
    expect(d.headline).toBeNull();
    // With no entry term on file, Cal-GETC — and the payload says why.
    expect(d.gePattern.id).toBe('calgetc');
    expect(d.gePattern.reason).toMatch(/no first community-college term on file/);
    expect(out.caveats.some((c) => /not a default/.test(c))).toBe(true);
  });

  it('a set target produces a headline in the engine\'s own vocabulary', async () => {
    const h = makeCtx({
      target: { campus: 'ucla', major: 'cs', entryTerm: 'Fall 2024' },
      completed: ['MATH 190', 'CSCI 1'],
    });
    const out = await ok(STATE_IMPLS, 'get_student_status', {}, h.ctx);
    const d = out.data as { headline: string; gePattern: { id: string } };
    expect(d.headline).toMatch(/required lower-division preparation slots complete/);
    expect(d.headline).toMatch(/eligible|competitive|reach/);
    expect(d.headline).not.toMatch(/guarantee|will be admitted/i);
    expect(d.gePattern.id).toBe('igetc');
  });
});

describe('set_student_target', () => {
  it('resolves loose names, writes the page, and returns the new status', async () => {
    const out = await ok(STATE_IMPLS, 'set_student_target', {
      campus: 'uc los angeles', major: 'computer science', entryTerm: 'Fall 2024',
      completedCourses: ['math190', 'CSCI 1'], inProgressCourses: ['MATH-191'],
    }, harness.ctx);
    expect(harness.current().target).toEqual({ campus: 'ucla', major: 'cs', entryTerm: 'Fall 2024' });
    expect(harness.current().completed).toEqual(['MATH 190', 'CSCI 1']);
    expect(harness.current().inProgress).toEqual(['MATH 191']);
    const d = out.data as { target: { campus: string; majorName: string }; headline: string };
    expect(d.target.campus).toBe('ucla');
    expect(d.target.majorName).toBe('Computer Science');
    expect(d.headline).toContain('UC Los Angeles');
    expect(out.summary).toMatch(/^Updated the student profile on the page/);
  });

  it('replaces a list rather than merging it', async () => {
    const h = makeCtx({ completed: ['MATH 190', 'CSCI 1'] });
    await ok(STATE_IMPLS, 'set_student_target', { completedCourses: ['PHYS 1A'] }, h.ctx);
    expect(h.current().completed).toEqual(['PHYS 1A']);
  });

  it('rejects an unknown course and changes nothing', async () => {
    const h = makeCtx({ completed: ['MATH 190'] });
    const out = await STATE_IMPLS.set_student_target({ completedCourses: ['MATH 190', 'BOGUS 7'] }, h.ctx);
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('unknown_course');
    expect(out.message).toContain('BOGUS 7');
    expect(out.message).toContain('Nothing was changed');
    expect(h.current().completed).toEqual(['MATH 190']);
  });

  it('rejects an unknown campus with candidates, and changes nothing', async () => {
    const out = await STATE_IMPLS.set_student_target({ campus: 'Hogwarts' }, harness.ctx);
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('unknown_campus');
    expect(harness.current().target.campus).toBe('');
  });

  it('rejects a major this build has no data for', async () => {
    const out = await STATE_IMPLS.set_student_target({ major: 'biology' }, harness.ctx);
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('unknown_major');
    expect(out.hint).toMatch(/business|cs|psych/);
  });

  it('an empty call is an error, not a silent no-op', async () => {
    const out = await STATE_IMPLS.set_student_target({}, harness.ctx);
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('nothing_to_set');
  });

  it('records a renamed course under today\'s number and says so', async () => {
    const out = await ok(STATE_IMPLS, 'set_student_target', { completedCourses: ['ECON 101'] }, harness.ctx);
    expect(harness.current().completed).toEqual(['ECON C2002']);
    expect(out.caveats.some((c) => c.includes('ECON 101') && c.includes('ECON C2002'))).toBe(true);
  });

  it('after set_student_target, audit_coursework with no arguments uses the page', async () => {
    await ok(STATE_IMPLS, 'set_student_target', {
      campus: 'UCLA', major: 'cs', entryTerm: 'Fall 2024',
      completedCourses: ['MATH 190', 'CSCI 1'], inProgressCourses: ['MATH 191'],
    }, harness.ctx);
    const audit = await ok(TRANSFER_IMPLS, 'audit_coursework', {}, harness.ctx);
    const d = audit.data as { campus: string; major: string; gePattern: string; rows: { id: string; status: string }[] };
    expect(d.campus).toBe('ucla');
    expect(d.major).toBe('cs');
    expect(d.gePattern).toBe('IGETC');
    expect(d.rows.find((r) => r.id === 'math-31a')!.status).toBe('done');
    expect(d.rows.find((r) => r.id === 'math-31b')!.status).toBe('in-progress');
  });
});

describe('reminders', () => {
  it('adds one, returns its id, and puts it on the page', async () => {
    const out = await ok(STATE_IMPLS, 'add_reminder', {
      title: 'File the UC TAG application', due: '2026-09-30', url: 'https://admission.universityofcalifornia.edu/',
    }, harness.ctx);
    const d = out.data as { reminder: { id: string; title: string; due: string; done: boolean; createdBy: string } };
    expect(d.reminder.title).toBe('File the UC TAG application');
    expect(d.reminder.due).toBe('2026-09-30');
    expect(d.reminder.done).toBe(false);
    expect(d.reminder.createdBy).toBe('agent');
    expect(harness.current().reminders).toHaveLength(1);
    expect(harness.current().reminders[0].id).toBe(d.reminder.id);
    expect(out.summary).toContain(d.reminder.id);
  });

  it('nudges for a source link when none was given', async () => {
    const out = await ok(STATE_IMPLS, 'add_reminder', { title: 'Ask a counselor', due: '2026-10-01' }, harness.ctx);
    expect(out.caveats.some((c) => /no source link/.test(c))).toBe(true);
  });

  it('refuses a date it cannot read rather than inventing one', async () => {
    const out = await STATE_IMPLS.add_reminder({ title: 'Something', due: 'next-ish Tuesday' }, harness.ctx);
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('bad_date');
    expect(harness.current().reminders).toHaveLength(0);
  });

  it('refuses an empty title', async () => {
    const out = await STATE_IMPLS.add_reminder({ due: '2026-10-01' }, harness.ctx);
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('missing_title');
  });

  it('completes and reopens one by id', async () => {
    const added = await ok(STATE_IMPLS, 'add_reminder', { title: 'Submit TAU', due: '2027-01-31' }, harness.ctx);
    const id = (added.data as { reminder: { id: string } }).reminder.id;

    const done = await ok(STATE_IMPLS, 'complete_reminder', { id }, harness.ctx);
    expect((done.data as { reminder: { done: boolean } }).reminder.done).toBe(true);
    expect(harness.current().reminders[0].done).toBe(true);

    const reopened = await ok(STATE_IMPLS, 'complete_reminder', { id, done: false }, harness.ctx);
    expect((reopened.data as { reminder: { done: boolean } }).reminder.done).toBe(false);
    expect(harness.current().reminders[0].done).toBe(false);
  });

  it('an unknown id is an error listing the open reminders', async () => {
    await ok(STATE_IMPLS, 'add_reminder', { title: 'Submit TAU', due: '2027-01-31' }, harness.ctx);
    const out = await STATE_IMPLS.complete_reminder({ id: 'nope' }, harness.ctx);
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('unknown_reminder');
    expect(out.hint).toContain('Submit TAU');
  });

  it('the status tool counts open and done separately', async () => {
    const a = await ok(STATE_IMPLS, 'add_reminder', { title: 'One', due: '2026-10-01' }, harness.ctx);
    await ok(STATE_IMPLS, 'add_reminder', { title: 'Two', due: '2026-11-01' }, harness.ctx);
    await ok(STATE_IMPLS, 'complete_reminder', { id: (a.data as { reminder: { id: string } }).reminder.id }, harness.ctx);
    const status = await ok(STATE_IMPLS, 'get_student_status', {}, harness.ctx);
    expect((status.data as { reminders: { open: number; done: number } }).reminders).toEqual({ open: 1, done: 1 });
  });
});

describe('no state summary claims a guarantee', () => {
  it('holds for every state tool', async () => {
    await ok(STATE_IMPLS, 'set_student_target', { campus: 'UCLA', major: 'cs', completedCourses: ['MATH 190'] }, harness.ctx);
    const added = await ok(STATE_IMPLS, 'add_reminder', { title: 'x', due: '2026-10-01' }, harness.ctx);
    const id = (added.data as { reminder: { id: string } }).reminder.id;
    const outs = [
      await ok(STATE_IMPLS, 'get_student_status', {}, harness.ctx),
      added,
      await ok(STATE_IMPLS, 'complete_reminder', { id }, harness.ctx),
    ];
    for (const out of outs) {
      expect(out.summary).not.toMatch(/guarantee|will be admitted/i);
    }
  });
});
