import { describe, it, expect, beforeEach } from 'vitest';
import { runTool, exampleInput, renderForAgent, validateInput, TOOLS, TOOL_NAMES, isToolError } from './index';
import { toolDescriptor } from './contract';
import { getState, resetState } from '../lib/store';
import { loadSampleStudent } from '../lib/sampleStudent';

beforeEach(() => { resetState(); });

describe('runTool dispatch', () => {
  it('runs a tool and returns its output', async () => {
    const out = await runTool('list_options', {});
    expect(isToolError(out)).toBe(false);
    if (isToolError(out)) return;
    expect(out.summary).toContain('El Camino College');
    expect(out.citations.length).toBeGreaterThan(0);
  });

  it('an unknown tool is a ToolError naming the ones that exist', async () => {
    const out = await runTool('summon_a_counselor', {});
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('unknown_tool');
    expect(out.hint).toContain('list_options');
  });

  it('records every call in the activity feed, with how it was made', async () => {
    await runTool('list_options', {}, 'agent');
    await runTool('nope', {}, 'console');
    const activity = getState().activity;
    expect(activity).toHaveLength(2);
    // Newest first.
    expect(activity[0].tool).toBe('nope');
    expect(activity[0].ok).toBe(false);
    expect(activity[0].via).toBe('console');
    expect(activity[1].tool).toBe('list_options');
    expect(activity[1].ok).toBe(true);
    expect(activity[1].via).toBe('agent');
    expect(activity[1].summary.length).toBeGreaterThan(0);
  });

  it('a state tool called through runTool actually changes the page', async () => {
    const out = await runTool('set_student_target', { campus: 'UCLA', major: 'cs' }, 'agent');
    expect(isToolError(out)).toBe(false);
    expect(getState().target.campus).toBe('ucla');
    expect(getState().target.major).toBe('cs');
    // …and the next read-only call sees it.
    const audit = await runTool('audit_coursework', {});
    expect(isToolError(audit)).toBe(false);
    if (isToolError(audit)) return;
    expect((audit.data as { campus: string }).campus).toBe('ucla');
  });
});

describe('input validation', () => {
  it('rejects a wrong type instead of coercing it', async () => {
    const out = await runTool('check_course_transfer', { course: 190 });
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('invalid_input');
    expect(out.message).toContain('course must be a string');
  });

  it('rejects a missing required field', async () => {
    const out = await runTool('check_course_transfer', {});
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.error).toBe('invalid_input');
    expect(out.message).toContain('course is required');
  });

  it('rejects a non-object input', async () => {
    const out = await runTool('list_options', 'please');
    expect(isToolError(out)).toBe(true);
    if (!isToolError(out)) return;
    expect(out.message).toContain('input must be an object');
  });

  it('accepts undefined for a tool that takes nothing', async () => {
    const out = await runTool('list_options', undefined);
    expect(isToolError(out)).toBe(false);
  });

  it('checks array item types', () => {
    const schema = toolDescriptor('audit_coursework')!.inputSchema;
    expect(validateInput(schema, { courses: ['MATH 190'] }).ok).toBe(true);
    const bad = validateInput(schema, { courses: ['MATH 190', 7] });
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toContain('courses[1] must be a string');
  });

  it('checks integer bounds', () => {
    const schema = toolDescriptor('get_upcoming_work')!.inputSchema;
    expect(validateInput(schema, { days: 7 }).ok).toBe(true);
    expect(validateInput(schema, { days: 0 }).errors[0]).toContain('at least 1');
    expect(validateInput(schema, { days: 500 }).errors[0]).toContain('at most 120');
    expect(validateInput(schema, { days: 7.5 }).errors[0]).toContain('whole number');
  });

  it('checks an enum inside an array', () => {
    const schema = toolDescriptor('get_deadlines')!.inputSchema;
    expect(validateInput(schema, { kinds: ['application', 'reminder'] }).ok).toBe(true);
    expect(validateInput(schema, { kinds: ['weather'] }).errors[0]).toContain('must be one of');
  });

  it('drops an unknown key and says it did, rather than acting on it', async () => {
    const out = await runTool('compare_campuses', { major: 'cs', campusez: ['UCLA'] });
    expect(isToolError(out)).toBe(false);
    if (isToolError(out)) return;
    // A misspelled `campuses` must not quietly become "compare everything".
    expect(out.caveats.some((c) => c.includes('campusez'))).toBe(true);
  });
});

describe('exampleInput', () => {
  it('gives a runnable example for every tool in the contract', () => {
    for (const name of TOOL_NAMES) {
      const example = exampleInput(name);
      expect(example, name).toBeTypeOf('object');
      const check = validateInput(toolDescriptor(name)!.inputSchema, example);
      expect(check.ok, `${name}: ${check.errors.join('; ')}`).toBe(true);
      expect(check.unknownKeys, name).toEqual([]);
    }
  });

  it('the check_course_transfer example is the one from the plan', () => {
    expect(exampleInput('check_course_transfer')).toEqual({ course: 'MATH 190', campus: 'UCLA', major: 'cs' });
  });

  it('the examples actually run', async () => {
    for (const name of ['list_options', 'check_course_transfer', 'audit_coursework', 'compare_campuses', 'explain_requirement']) {
      const out = await runTool(name, exampleInput(name));
      expect(isToolError(out), `${name}: ${isToolError(out) ? out.message : ''}`).toBe(false);
    }
  });
});

describe('renderForAgent', () => {
  it('is summary, then notes, then the JSON payload', async () => {
    const out = await runTool('check_course_transfer', { course: 'MATH 190', campus: 'CSULB', major: 'cs' });
    const text = renderForAgent(out);
    const blocks = text.split('\n\n');
    expect(blocks[0]).toBe(isToolError(out) ? out.message : out.summary);
    expect(blocks[1]).toMatch(/^Note: /m);
    const payload = JSON.parse(blocks[blocks.length - 1]) as { data: unknown; citations: unknown[] };
    expect(payload.data).toBeTruthy();
    expect(Array.isArray(payload.citations)).toBe(true);
  });

  it('omits the notes block when there is nothing to caveat', () => {
    const text = renderForAgent({ summary: 'All good.', data: { a: 1 }, citations: [], caveats: [] });
    expect(text).toBe('All good.\n\n{"data":{"a":1},"citations":[]}');
  });

  it('renders an error as its message, its hint and its code', () => {
    const text = renderForAgent({ error: 'target_not_set', message: 'No target.', hint: 'Call set_student_target.' });
    expect(text).toContain('No target.');
    expect(text).toContain('Call set_student_target.');
    expect(text).toContain('"error":"target_not_set"');
  });

  it('truncates a long array with a count instead of dropping it silently', () => {
    const text = renderForAgent({
      summary: 's', data: { rows: Array.from({ length: 200 }, (_, i) => i) }, citations: [], caveats: [],
    });
    const payload = JSON.parse(text.split('\n\n')[1]) as { data: { rows: unknown[] } };
    expect(payload.data.rows).toHaveLength(61);
    expect(payload.data.rows[60]).toEqual({ truncated: 140 });
  });

  it('stays under the size cap even for the widest comparison', async () => {
    // Exactly the cap, not "about" it: the truncation used to reserve a fixed
    // 80 characters for a marker 99 characters long, so a "capped" render came
    // back at 12,023 — past the budget the WebMCP layer was promised.
    const out = await runTool('compare_campuses', { courses: ['MATH 190', 'MATH 191', 'CSCI 1', 'CSCI 2'], major: 'cs' });
    const text = renderForAgent(out);
    expect(text.length).toBeLessThanOrEqual(12_000);
    expect(text.startsWith(isToolError(out) ? out.message : out.summary)).toBe(true);
  });

  it('every tool, on the sample student, renders within the cap', async () => {
    loadSampleStudent(new Date('2026-09-02T19:00:00Z'));
    for (const name of TOOL_NAMES) {
      const out = await runTool(name, exampleInput(name));
      const text = renderForAgent(out);
      expect(text.length, `${name} rendered ${text.length}`).toBeLessThanOrEqual(12_000);
      expect(text.length, name).toBeGreaterThan(0);
    }
  });

  it('keeps the prose when it has to cut the payload', () => {
    const text = renderForAgent({
      summary: 'A very wide result.',
      data: { blob: 'x'.repeat(40_000) },
      citations: [],
      caveats: ['Cut short.'],
    });
    expect(text).toContain('A very wide result.');
    expect(text).toContain('Note: Cut short.');
    expect(text).toContain('payload truncated');
    expect(text.length).toBeLessThanOrEqual(12_200);
  });
});

describe('the contract and the implementations agree', () => {
  it('every declared tool either runs or says it is not wired', async () => {
    for (const t of TOOLS) {
      const out = await runTool(t.name, exampleInput(t.name));
      if (isToolError(out)) {
        // A tool another agent owns may not be wired yet; what must never
        // happen is a tool that is missing without saying so.
        expect(out.error, t.name).not.toBe('unknown_tool');
      }
    }
  });

  it('read-only tools leave the page alone', async () => {
    await runTool('set_student_target', { campus: 'UCLA', major: 'cs', completedCourses: ['MATH 190'] });
    const before = JSON.stringify({ ...getState(), activity: [] });
    for (const t of TOOLS.filter((x) => x.readOnly)) {
      await runTool(t.name, exampleInput(t.name));
    }
    expect(JSON.stringify({ ...getState(), activity: [] })).toBe(before);
  });
});
