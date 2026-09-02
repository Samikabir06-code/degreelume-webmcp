// ─── The dispatcher ──────────────────────────────────────────────────────────
//
// One entry point for every tool call, whatever asked for it: the WebMCP
// registration layer (an agent in the browser), the page's tool console (a
// person), or the page's own panels. It looks the tool up in the contract,
// validates the input against that tool's declared schema, builds the context
// from the page store, dispatches, catches anything thrown, and records the
// call in the activity feed — which is the page's evidence of what the agent
// actually did.
//
// The validator is hand-written on purpose. The contract's schemas are small
// and fixed (strings, string arrays, booleans, one bounded integer, one enum),
// and a JSON-Schema library would be a dependency and a supply-chain surface
// for about forty lines of checks. It rejects rather than coerces: a tool that
// quietly reinterprets its input is a tool whose answer nobody can reproduce.

import {
  TOOLS, TOOL_NAMES, toolDescriptor,
  type JsonSchema, type ToolDescriptor, type ToolError, type ToolOutput,
} from './contract';
import { isToolError, toolError, type ToolContext, type ToolImplMap } from './runtime';
import { getState, recordActivity, setState } from '../lib/store';
import { TRANSFER_IMPLS } from './transfer';
import { STATE_IMPLS } from './state';
import { SCHOOL_IMPLS } from './school';

export { isToolError, TOOLS, TOOL_NAMES };
export type { ToolDescriptor, ToolError, ToolOutput };

const IMPLS: ToolImplMap = { ...TRANSFER_IMPLS, ...STATE_IMPLS, ...SCHOOL_IMPLS };

// ── input validation ─────────────────────────────────────────────────────────

interface PropSchema {
  type?: string;
  items?: { type?: string; enum?: string[] };
  enum?: string[];
  minimum?: number;
  maximum?: number;
}

function typeName(v: unknown): string {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v;
}

function checkValue(key: string, schema: PropSchema, value: unknown): string | null {
  const want = schema.type;
  if (want === 'array') {
    if (!Array.isArray(value)) return `${key} must be an array of ${schema.items?.type ?? 'values'}, got ${typeName(value)}`;
    for (const [i, item] of value.entries()) {
      const itemType = schema.items?.type;
      if (itemType && typeName(item) !== itemType) return `${key}[${i}] must be a ${itemType}, got ${typeName(item)}`;
      if (schema.items?.enum && !schema.items.enum.includes(item as string)) {
        return `${key}[${i}] must be one of ${schema.items.enum.join(', ')}`;
      }
    }
    return null;
  }
  if (want === 'integer') {
    if (typeof value !== 'number' || !Number.isInteger(value)) return `${key} must be a whole number, got ${typeName(value)}`;
    if (schema.minimum !== undefined && value < schema.minimum) return `${key} must be at least ${schema.minimum}`;
    if (schema.maximum !== undefined && value > schema.maximum) return `${key} must be at most ${schema.maximum}`;
    return null;
  }
  if (want && typeName(value) !== want) return `${key} must be a ${want}, got ${typeName(value)}`;
  if (schema.enum && !schema.enum.includes(value as string)) return `${key} must be one of ${schema.enum.join(', ')}`;
  return null;
}

export interface ValidationResult {
  ok: boolean;
  value: Record<string, unknown>;
  errors: string[];
  unknownKeys: string[];
}

export function validateInput(schema: JsonSchema, raw: unknown): ValidationResult {
  const errors: string[] = [];
  const unknownKeys: string[] = [];
  const value: Record<string, unknown> = {};

  if (raw === undefined || raw === null) {
    // A tool with no required fields is legitimately called with nothing.
    for (const key of schema.required ?? []) errors.push(`${key} is required`);
    return { ok: errors.length === 0, value, errors, unknownKeys };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, value, errors: [`input must be an object, got ${typeName(raw)}`], unknownKeys };
  }

  const input = raw as Record<string, unknown>;
  for (const [key, entry] of Object.entries(input)) {
    const prop = schema.properties[key] as PropSchema | undefined;
    if (!prop) {
      // additionalProperties:false everywhere in the contract. An unknown key
      // is reported and dropped rather than passed through: an agent that
      // misspells `campuses` should hear about it, not silently get a
      // comparison of every campus.
      unknownKeys.push(key);
      continue;
    }
    if (entry === undefined || entry === null) continue; // absent, not a value
    const problem = checkValue(key, prop, entry);
    if (problem) errors.push(problem);
    else value[key] = entry;
  }
  for (const key of schema.required ?? []) {
    if (value[key] === undefined) errors.push(`${key} is required`);
  }
  return { ok: errors.length === 0, value, errors, unknownKeys };
}

// ── run ──────────────────────────────────────────────────────────────────────

export async function runTool(
  name: string,
  input: unknown,
  via: 'agent' | 'console' = 'console',
): Promise<ToolOutput | ToolError> {
  const descriptor = toolDescriptor(name);
  if (!descriptor) {
    const err = toolError(
      'unknown_tool',
      `There is no tool called "${name}" on this page.`,
      `Available tools: ${TOOL_NAMES.join(', ')}.`,
    );
    recordActivity({ tool: name, input, ok: false, summary: err.message, via });
    return err;
  }

  const validated = validateInput(descriptor.inputSchema, input);
  if (!validated.ok) {
    const err = toolError(
      'invalid_input',
      `${name}: ${validated.errors.join('; ')}.`,
      `Expected fields: ${Object.keys(descriptor.inputSchema.properties).join(', ') || 'none'}.`,
    );
    recordActivity({ tool: name, input, ok: false, summary: err.message, via });
    return err;
  }

  const impl = IMPLS[name];
  if (!impl) {
    const err = toolError(
      'not_implemented',
      `${name} is declared in the contract but not wired on this page.`,
      'This is a build problem, not something the student can fix.',
    );
    recordActivity({ tool: name, input, ok: false, summary: err.message, via });
    return err;
  }

  const ctx: ToolContext = { state: getState(), setState, now: new Date() };

  let out: ToolOutput | ToolError;
  try {
    out = await impl(validated.value, ctx);
  } catch (e) {
    // A thrown error is a bug in the tool, not an answer. It is reported as
    // one, with the message, rather than swallowed into a plausible-looking
    // empty result.
    out = toolError(
      'tool_failed',
      `${name} failed: ${e instanceof Error ? e.message : String(e)}`,
      'Nothing was changed. Try again, or ask for a different tool.',
    );
  }

  // An unknown key never silently changes an answer.
  if (!isToolError(out) && validated.unknownKeys.length > 0) {
    out = {
      ...out,
      caveats: [
        ...out.caveats,
        `Ignored input field${validated.unknownKeys.length === 1 ? '' : 's'} this tool does not accept: ${validated.unknownKeys.join(', ')}.`,
      ],
    };
  }

  recordActivity({
    tool: name,
    input: validated.value,
    ok: !isToolError(out),
    summary: isToolError(out) ? out.message : out.summary,
    via,
  });
  return out;
}

// ── console examples ─────────────────────────────────────────────────────────

// A realistic, immediately-runnable input per tool, so the page's console opens
// on something that works instead of an empty object.
const EXAMPLES: Record<string, Record<string, unknown>> = {
  list_options: {},
  get_student_status: {},
  check_course_transfer: { course: 'MATH 190', campus: 'UCLA', major: 'cs' },
  audit_coursework: {
    courses: ['MATH 190', 'CSCI 1', 'ENGL C1000'],
    inProgress: ['MATH 191', 'CSCI 2'],
    campus: 'UCLA',
    major: 'cs',
    entryTerm: 'Fall 2024',
  },
  compare_campuses: {
    courses: ['MATH 190', 'MATH 191', 'CSCI 1', 'CSCI 2'],
    major: 'cs',
  },
  explain_requirement: { requirement: 'MATH 31A', campus: 'UCLA', major: 'cs' },
  get_current_courses: {},
  get_upcoming_work: { days: 7 },
  get_grade_risk: {},
  get_deadlines: { kinds: ['application', 'coursework', 'canvas', 'reminder'] },
  set_student_target: {
    campus: 'UCLA',
    major: 'cs',
    entryTerm: 'Fall 2024',
    completedCourses: ['MATH 190', 'CSCI 1'],
    inProgressCourses: ['MATH 191'],
  },
  add_reminder: {
    title: 'File the UC TAG application',
    due: '2026-09-30',
    url: 'https://admission.universityofcalifornia.edu/admission-requirements/transfer-requirements/uc-transfer-programs/transfer-admission-guarantee-tag.html',
  },
  complete_reminder: { id: 'paste-a-reminder-id-from-get_student_status', done: true },
};

export function exampleInput(name: string): Record<string, unknown> {
  return EXAMPLES[name] ?? {};
}

// ── rendering for an agent ───────────────────────────────────────────────────

const MAX_CHARS = 12_000;
const MAX_ARRAY = 60;

// Long arrays are cut with a marker rather than dropped, so a model can tell
// the difference between "there were three" and "we showed you three".
function truncateArrays(value: unknown): unknown {
  if (Array.isArray(value)) {
    const kept = value.slice(0, MAX_ARRAY).map(truncateArrays);
    if (value.length > MAX_ARRAY) kept.push({ truncated: value.length - MAX_ARRAY });
    return kept;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = truncateArrays(v);
    return out;
  }
  return value;
}

export function renderForAgent(out: ToolOutput | ToolError): string {
  if (isToolError(out)) {
    const lines = [out.message];
    if (out.hint) lines.push(out.hint);
    return `${lines.join('\n')}\n\n${JSON.stringify({ error: out.error })}`;
  }
  const parts = [out.summary];
  if (out.caveats.length > 0) {
    parts.push(out.caveats.map((c) => `Note: ${c}`).join('\n'));
  }
  const payload = JSON.stringify({
    data: truncateArrays(out.data),
    citations: out.citations,
  });
  parts.push(payload);
  const text = parts.join('\n\n');
  if (text.length <= MAX_CHARS) return text;

  // Still over the cap after array truncation: keep the prose and the
  // citations — the parts a model relays — and say the payload was cut.
  const head = parts.slice(0, -1).join('\n\n');
  const room = Math.max(0, MAX_CHARS - head.length - 80);
  return `${head}\n\n${payload.slice(0, room)}\n\n[payload truncated at ${MAX_CHARS} characters — call the tool with narrower arguments for the full result]`;
}
