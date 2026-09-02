// ─── State tools ─────────────────────────────────────────────────────────────
//
// What the page knows about the student, and the four ways it can change:
// read the profile, set the target and coursework, add a reminder, complete
// one. These are the only tools annotated as NOT read-only, and every change
// they make lands in the page immediately, in front of the student.
//
// The rule the whole file is built on (docs/PLAN.md, the no-fabrication rule):
// an empty profile reads as empty. "No campus chosen" is a real answer, and
// this build says it rather than defaulting to a campus nobody picked.

import type { CourseCode, MajorChoice, SchoolId } from '../types';
import type { ToolError, ToolOutput } from './contract';
import { toolError, type ToolContext, type ToolImplMap } from './runtime';
import { newId, type PageState, type Reminder } from '../lib/store';
import { auditFor, profileFromState } from '../lib/profile';
import { getMajor } from '../data/majors';
import { getSchool } from '../data/schools';
import { resolveGePattern } from '../data/gePatterns';
import { courseCandidates, resolveCourseList } from '../lib/resolve';
import { resolveCampusArg, resolveMajorArg } from './transfer';

function isErr(x: unknown): x is ToolError {
  return typeof x === 'object' && x !== null && 'error' in x;
}

// ── the status payload, shared by get_student_status and set_student_target ──

// One sentence about where the student stands, or null when there is nothing
// honest to say yet. Never a verdict the engine did not produce.
function headlineFor(state: PageState): string | null {
  const profile = profileFromState(state);
  if (!profile.school || !profile.major) return null;
  const audit = auditFor(profile);
  const t = audit?.transfer;
  if (!t) return null;
  const school = getSchool(profile.school);
  const major = getMajor(profile.major);
  return `${t.prepDone} of ${t.requiredCount} required lower-division preparation slots complete for ${major?.name ?? profile.major} at ${school?.name ?? profile.school}; the engine reads this as ${t.verdict}.`;
}

function statusData(state: PageState) {
  const school = state.target.campus ? getSchool(state.target.campus) : undefined;
  const major = state.target.major ? getMajor(state.target.major) : undefined;
  const profile = profileFromState(state);
  const pattern = resolveGePattern(profile);
  return {
    target: {
      campus: state.target.campus || null,
      campusName: school?.name ?? null,
      system: school?.system ?? null,
      major: state.target.major || null,
      majorName: major?.name ?? null,
    },
    entryTerm: state.target.entryTerm || null,
    // Which transfer GE pattern binds is a fact about the STUDENT's first
    // community-college term, not about the campus. With no entry term on file
    // this is Cal-GETC, the pattern valid for every entry term — and the tool
    // says that is why.
    gePattern: {
      id: pattern.id,
      name: pattern.name,
      reason: state.target.entryTerm
        ? `first community-college term ${state.target.entryTerm}`
        : 'no first community-college term on file — Cal-GETC is the pattern valid for every entry term',
    },
    completed: state.completed,
    inProgress: state.inProgress,
    canvas: state.canvas
      ? {
          connected: true,
          source: state.canvas.source,
          host: state.canvas.host,
          fetchedAt: state.canvas.fetchedAt,
          courses: state.canvas.courses.length,
        }
      : null,
    reminders: {
      open: state.reminders.filter((r) => !r.done).length,
      done: state.reminders.filter((r) => r.done).length,
    },
    headline: headlineFor(state),
  };
}

function statusSummary(state: PageState): string {
  const d = statusData(state);
  if (!d.target.campus && !d.target.major) {
    return `The page holds no target yet: no campus and no major. ${d.completed.length} completed and ${d.inProgress.length} in-progress courses are recorded${d.canvas ? `, and Canvas is connected (${d.canvas.source} data)` : ', and Canvas is not connected'}. Ask the student where they want to transfer, or call set_student_target.`;
  }
  const where = [d.target.campusName ?? 'no campus set', d.target.majorName ?? 'no major set'].join(' · ');
  return `Target: ${where}. ${d.completed.length} completed and ${d.inProgress.length} in-progress El Camino courses on file; general education runs on ${d.gePattern.name}. ` +
    `${d.canvas ? `Canvas is connected (${d.canvas.source} data, ${d.canvas.courses} courses).` : 'Canvas is not connected.'} ` +
    `${d.reminders.open} open reminder${d.reminders.open === 1 ? '' : 's'}.` +
    (d.headline ? ` ${d.headline}` : '');
}

function statusCaveats(state: PageState): string[] {
  const out: string[] = [];
  if (!state.target.campus || !state.target.major) {
    out.push('Nothing here is assumed. A campus or major shown as null is one the student has not chosen — not a default.');
  }
  if (!state.target.entryTerm) {
    out.push('No first community-college term is on file, so general education is read against Cal-GETC, the pattern valid for every entry term. A student who first enrolled before fall 2025 may also complete IGETC.');
  }
  if (state.canvas?.source === 'sample') {
    out.push('The Canvas data on this page is the labelled fictional sample student, not a real Canvas account.');
  }
  return out;
}

const SAMPLE_CITATION = {
  sourceName: 'Sample student (fictional)',
  sourceUrl: 'https://github.com/Samikabir06-code/degreelume-webmcp',
  catalogYear: '—',
  verification: 'sample' as const,
};

function statusOutput(state: PageState): ToolOutput {
  return {
    summary: statusSummary(state),
    data: statusData(state),
    citations: state.canvas?.source === 'sample' ? [SAMPLE_CITATION] : [],
    caveats: statusCaveats(state),
  };
}

// ── get_student_status ───────────────────────────────────────────────────────

const get_student_status = (_input: unknown, ctx: ToolContext): ToolOutput => statusOutput(ctx.state);

// ── set_student_target ───────────────────────────────────────────────────────

// A coursework list is replaced wholesale when given, and every code in it must
// resolve. A list where one code is dropped silently is a transcript the
// student did not give us.
function validateList(label: string, given: string[]): { codes: CourseCode[]; renamed: { given: string; code: string }[] } | ToolError {
  const r = resolveCourseList(given);
  if (r.unknown.length > 0) {
    const hints = r.unknown
      .map((u) => `${u} → ${courseCandidates(u, 3).map((c) => c.code).join(', ') || 'no near match'}`)
      .join('; ');
    return toolError(
      'unknown_course',
      `These ${label} codes are not in the El Camino 2025–26 catalog snapshot: ${r.unknown.join(', ')}. Nothing was changed.`,
      `Nearest catalog codes — ${hints}.`,
    );
  }
  return { codes: r.codes, renamed: r.renamed };
}

const set_student_target = (
  input: { campus?: string; major?: string; entryTerm?: string; completedCourses?: string[]; inProgressCourses?: string[] },
  ctx: ToolContext,
): ToolOutput | ToolError => {
  const patch: Partial<PageState> = {};
  const target = { ...ctx.state.target };
  const changes: string[] = [];
  const renamed: { given: string; code: string }[] = [];

  if (input.campus !== undefined && String(input.campus).trim() !== '') {
    const campus = resolveCampusArg(input.campus, '');
    if (isErr(campus)) return campus;
    target.campus = campus.id as SchoolId;
    changes.push(`campus → ${campus.name}`);
  }
  if (input.major !== undefined && String(input.major).trim() !== '') {
    const major = resolveMajorArg(input.major, '');
    if (isErr(major)) return major;
    target.major = major.id as MajorChoice;
    changes.push(`major → ${major.name}`);
  }
  if (input.entryTerm !== undefined) {
    const term = String(input.entryTerm).trim();
    // Stored as the student wrote it; the GE resolver parses "Fall 2024"-style
    // labels itself and treats anything it cannot parse as unknown, which is
    // the honest reading rather than a guess.
    target.entryTerm = term;
    changes.push(term ? `first community-college term → ${term}` : 'first community-college term cleared');
  }

  if (input.completedCourses !== undefined) {
    const r = validateList('completed', input.completedCourses);
    if (isErr(r)) return r;
    patch.completed = r.codes;
    renamed.push(...r.renamed);
    changes.push(`completed coursework replaced with ${r.codes.length} course${r.codes.length === 1 ? '' : 's'}`);
  }
  if (input.inProgressCourses !== undefined) {
    const r = validateList('in-progress', input.inProgressCourses);
    if (isErr(r)) return r;
    patch.inProgress = r.codes;
    renamed.push(...r.renamed);
    changes.push(`in-progress coursework replaced with ${r.codes.length} course${r.codes.length === 1 ? '' : 's'}`);
  }

  if (changes.length === 0) {
    return toolError(
      'nothing_to_set',
      'No profile fields were given, so nothing changed.',
      'Pass at least one of campus, major, entryTerm, completedCourses or inProgressCourses.',
    );
  }

  patch.target = target;
  ctx.setState(patch);

  const next = { ...ctx.state, ...patch };
  const out = statusOutput(next);
  return {
    ...out,
    summary: `Updated the student profile on the page: ${changes.join('; ')}. ${out.summary}`,
    caveats: [...out.caveats, ...renamed.map((r) => `${r.given} is now numbered ${r.code} at El Camino; it was recorded as ${r.code}.`)],
  };
};

// ── reminders ────────────────────────────────────────────────────────────────

function reminderShape(r: Reminder) {
  return { id: r.id, title: r.title, due: r.due, note: r.note ?? null, url: r.url ?? null, done: r.done, createdBy: r.createdBy, createdAt: r.createdAt };
}

// "2026-09-30" and "2026-09-30T17:00:00Z" both parse; anything else is an
// error rather than a reminder that silently never comes due.
function normalizeDue(input: string): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const add_reminder = (
  input: { title?: string; due?: string; note?: string; url?: string },
  ctx: ToolContext,
): ToolOutput | ToolError => {
  const title = String(input.title ?? '').trim();
  if (!title) return toolError('missing_title', 'A reminder needs a title.', 'Pass title and due.');
  const due = normalizeDue(input.due ?? '');
  if (!due) {
    return toolError(
      'bad_date',
      `"${input.due ?? ''}" is not a date I can read.`,
      'Pass an ISO date, e.g. "2026-09-30", or a full ISO date-time.',
    );
  }
  const reminder: Reminder = {
    id: newId(),
    title,
    due,
    ...(input.note ? { note: String(input.note) } : {}),
    ...(input.url ? { url: String(input.url) } : {}),
    done: false,
    // Reminders created through a tool are attributed to the assistant. The
    // page records separately (state.activity) whether the call came from an
    // agent or from the tool console, so provenance is not lost.
    createdBy: 'agent',
    createdAt: ctx.now.toISOString(),
  };
  ctx.setState((prev) => ({ reminders: [...prev.reminders, reminder] }));
  return {
    summary: `Added a reminder: "${title}", due ${due.slice(0, 10)}. It is on the page now, and its id is ${reminder.id}.`,
    data: { reminder: reminderShape(reminder) },
    citations: [],
    caveats: input.url ? [] : ['This reminder carries no source link. A deadline worth remembering is usually worth citing — pass `url` when the date came from an official page.'],
  };
};

const complete_reminder = (
  input: { id?: string; done?: boolean },
  ctx: ToolContext,
): ToolOutput | ToolError => {
  const id = String(input.id ?? '').trim();
  if (!id) return toolError('missing_id', 'No reminder id given.', 'Call get_student_status or add_reminder for ids.');
  const existing = ctx.state.reminders.find((r) => r.id === id);
  if (!existing) {
    const open = ctx.state.reminders.filter((r) => !r.done).map((r) => `${r.id} (${r.title})`);
    return toolError(
      'unknown_reminder',
      `No reminder with id "${id}" on this page.`,
      open.length ? `Open reminders: ${open.join('; ')}.` : 'There are no reminders on this page yet.',
    );
  }
  const done = input.done === undefined ? true : Boolean(input.done);
  const updated: Reminder = { ...existing, done };
  ctx.setState((prev) => ({ reminders: prev.reminders.map((r) => (r.id === id ? updated : r)) }));
  return {
    summary: done
      ? `Marked "${updated.title}" done.`
      : `Reopened "${updated.title}"; it is due ${updated.due.slice(0, 10)}.`,
    data: { reminder: reminderShape(updated) },
    citations: [],
    caveats: [],
  };
};

export const STATE_IMPLS: ToolImplMap = {
  get_student_status,
  set_student_target,
  add_reminder,
  complete_reminder,
};
