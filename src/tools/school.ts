// ─── School assistant tools (docs/PLAN.md §Tool semantics) ─────────────────
//
// get_current_courses, get_upcoming_work, get_grade_risk, get_deadlines — the
// four tools that read the student's OWN Canvas + calendar rather than the
// ASSIST engine. Every one of them reads `ctx.state.canvas`, never fetches
// anything itself (the page already synced it via ../lib/canvasClient), and
// treats a missing snapshot as an honest "not connected" rather than a guess.

import type { AuditResult, MajorPrepReq, StudentProfile } from '../types';
import type { Citation, ToolOutput, ToolError } from './contract';
import type { ToolContext, ToolImplMap } from './runtime';
import { toolError } from './runtime';
import type { CanvasAssignmentSnapshot, CanvasCourseSnapshot } from '../lib/store';
import { isSample, SAMPLE_CITATION } from '../lib/sampleStudent';
import { auditFor, profileFromState, schoolSystemOf } from '../lib/profile';
import { resolveCourseCode } from '../lib/resolve';
import type { RadarCourse, RadarFlag } from '../engine/riskRadar';
import { runRiskRadar } from '../engine/riskRadar';
import { buildRequirementResolver } from '../engine/liveRequirements';
import { upcomingDeadlines, genericDeadlines } from '../engine/deadlines';
import type { UpcomingDeadline } from '../engine/deadlines';
import { DEADLINE_RULES, CALENDAR_SOURCE } from '../data/deadlines';
import { getSchool } from '../data/schools';
import { gradeRuleFor } from '../data/gradeRules';
import { getRequirements } from '../data/requirements';

const DAY_MS = 86_400_000;

function daysUntil(iso: string, now: Date): number {
  const target = new Date(iso);
  const targetDateOnly = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((targetDateOnly.getTime() - nowDateOnly.getTime()) / DAY_MS);
}

function sampleExtras(sample: boolean, citations: Citation[], caveats: string[]): { citations: Citation[]; caveats: string[] } {
  if (!sample) return { citations, caveats };
  return {
    citations: citations.some((c) => c.verification === 'sample') ? citations : [...citations, SAMPLE_CITATION],
    caveats: caveats.includes('This is the labelled sample student, not a real Canvas.')
      ? caveats
      : [...caveats, 'This is the labelled sample student, not a real Canvas.'],
  };
}

const NOT_CONNECTED = () =>
  toolError(
    'canvas_not_connected',
    'Canvas is not connected on this page.',
    'The student connects Canvas on the page (paste a Canvas access token) or clicks "Load the sample student". An agent cannot enter the token.',
  );

// ─── get_current_courses ────────────────────────────────────────────────────

interface CurrentCoursesData {
  source: 'live' | 'sample';
  host: string;
  fetchedAt: string;
  active: CanvasCourseSnapshot[];
  completed: CanvasCourseSnapshot[];
}

function getCurrentCourses(_input: unknown, ctx: ToolContext): ToolOutput<CurrentCoursesData> | ToolError {
  const canvas = ctx.state.canvas;
  if (!canvas) return NOT_CONNECTED();

  const active = canvas.courses.filter((c) => c.enrollmentState === 'active');
  const completed = canvas.courses.filter((c) => c.enrollmentState === 'completed');
  const sample = isSample(ctx.state);
  const { citations, caveats } = sampleExtras(sample, [], []);

  return {
    summary: `${active.length} active course${active.length === 1 ? '' : 's'} and ${completed.length} completed, from ${sample ? 'the sample student' : `Canvas at ${canvas.host}`} (synced ${canvas.fetchedAt}).`,
    data: { source: canvas.source, host: canvas.host, fetchedAt: canvas.fetchedAt, active, completed },
    citations,
    caveats,
  };
}

// ─── get_upcoming_work ───────────────────────────────────────────────────────

interface UpcomingWorkInput {
  days?: number;
  course?: string;
  includeSubmitted?: boolean;
}

interface UpcomingWorkData {
  windowDays: number;
  from: string;
  to: string;
  items: CanvasAssignmentSnapshot[];
  overdue: CanvasAssignmentSnapshot[];
  counts: { total: number; overdue: number; missing: number; dueSoon: number };
}

function matchesCourseFilter(
  a: CanvasAssignmentSnapshot,
  filter: string,
  coursesById: Map<string, CanvasCourseSnapshot>,
): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;
  if (a.courseLabel.toLowerCase() === needle) return true;
  const course = coursesById.get(a.canvasCourseId);
  if (course?.courseCode && course.courseCode.toLowerCase() === needle) return true;
  if (course?.mappedCatalogCode && course.mappedCatalogCode.toLowerCase() === needle) return true;
  const resolved = resolveCourseCode(filter);
  if (resolved && course?.mappedCatalogCode === resolved.code) return true;
  return false;
}

function getUpcomingWork(input: UpcomingWorkInput, ctx: ToolContext): ToolOutput<UpcomingWorkData> | ToolError {
  const canvas = ctx.state.canvas;
  if (!canvas) return NOT_CONNECTED();

  const days = Math.min(120, Math.max(1, Math.round(input.days ?? 7)));
  const from = ctx.now;
  const to = new Date(from.getTime() + days * DAY_MS);
  const includeSubmitted = input.includeSubmitted ?? false;

  const coursesById = new Map(canvas.courses.map((c) => [c.canvasCourseId, c]));
  const courseFilter = input.course?.trim();

  const inScope = canvas.assignments.filter((a) => {
    if (courseFilter && !matchesCourseFilter(a, courseFilter, coursesById)) return false;
    if (!includeSubmitted && a.submitted) return false;
    return true;
  });

  const overdue = inScope
    .filter((a) => a.dueAt && new Date(a.dueAt).getTime() < from.getTime() && !a.submitted)
    .sort((x, y) => new Date(x.dueAt as string).getTime() - new Date(y.dueAt as string).getTime());

  const dueInWindow = inScope
    .filter((a) => {
      if (!a.dueAt) return false;
      const t = new Date(a.dueAt).getTime();
      return t >= from.getTime() && t <= to.getTime();
    })
    .sort((x, y) => new Date(x.dueAt as string).getTime() - new Date(y.dueAt as string).getTime());

  const items = [...overdue, ...dueInWindow];
  const missing = inScope.filter((a) => a.missing).length;

  const sample = isSample(ctx.state);
  const { citations, caveats } = sampleExtras(sample, [], []);

  return {
    summary: `${items.length} item${items.length === 1 ? '' : 's'} due in the next ${days} day${days === 1 ? '' : 's'}${overdue.length ? ` (${overdue.length} overdue)` : ''}.`,
    data: {
      windowDays: days,
      from: from.toISOString(),
      to: to.toISOString(),
      items,
      overdue,
      counts: { total: items.length, overdue: overdue.length, missing, dueSoon: dueInWindow.length },
    },
    citations,
    caveats,
  };
}

// ─── get_grade_risk ──────────────────────────────────────────────────────────

interface GradeRiskData {
  flags: RadarFlag[];
  summary: { ok: number; watch: number; risk: number };
  unmapped: string[];
}

function toRadarCourse(c: CanvasCourseSnapshot): RadarCourse {
  const mappingStatus: RadarCourse['mappingStatus'] = c.mappedCatalogCode
    ? 'confirmed'
    : c.mappingCandidates.length > 0
      ? 'suggested'
      : 'unmapped';
  return {
    canvasCourseId: c.canvasCourseId,
    canvasCourseCode: c.courseCode,
    canvasCourseName: c.name,
    mappedCatalogCode: c.mappedCatalogCode,
    mappingStatus,
    canvasGrade: c.grade,
    canvasScore: c.score,
    units: c.units,
    enrollmentState: c.enrollmentState,
    remainingWeight: c.remainingWeight,
  };
}

function getGradeRisk(_input: unknown, ctx: ToolContext): ToolOutput<GradeRiskData> | ToolError {
  const canvas = ctx.state.canvas;
  if (!canvas) return NOT_CONNECTED();

  const profile = profileFromState(ctx.state);
  const active = canvas.courses.filter((c) => c.enrollmentState === 'active');
  const radarCourses = active.map(toRadarCourse);
  const resolver = buildRequirementResolver(profile);
  const result = runRiskRadar(radarCourses, resolver);

  const unmapped = active
    .filter((c) => !c.mappedCatalogCode)
    .map((c) => c.courseCode ?? c.name);

  const citations: Citation[] = [];
  const seen = new Set<string>();
  const addCitation = (c: Citation | null | undefined) => {
    if (!c) return;
    const key = `${c.sourceName}|${c.sourceUrl}`;
    if (seen.has(key)) return;
    seen.add(key);
    citations.push(c);
  };
  for (const flag of result.flags) {
    if (flag.requirement.kind === 'no-requirement') continue;
    const rule = gradeRuleFor(profile.school, profile.major, flag.course.mappedCatalogCode);
    if (rule) addCitation(rule.meta);
  }
  if (profile.school && profile.major) {
    const reqSet = getRequirements(profile.school, profile.major, profile.college);
    if (reqSet) addCitation(reqSet.meta);
  }

  const caveats: string[] = [];
  if (!profile.school || !profile.major) {
    caveats.push('No target campus/major set, so no requirement could be attached; grades are shown without a verdict.');
  }

  const sample = isSample(ctx.state);
  const extras = sampleExtras(sample, citations, caveats);

  return {
    summary: `${result.summary.risk} at risk, ${result.summary.watch} to watch, ${result.summary.ok} on track${unmapped.length ? ` (${unmapped.length} course${unmapped.length === 1 ? '' : 's'} not yet matched to a catalog course)` : ''}.`,
    data: { flags: result.flags, summary: result.summary, unmapped },
    citations: extras.citations,
    caveats: extras.caveats,
  };
}

// ─── get_deadlines ───────────────────────────────────────────────────────────

interface DeadlinesInput {
  before?: string;
  kinds?: string[];
}

type ItemKind = 'application' | 'coursework' | 'canvas' | 'reminder';

interface DeadlineItem {
  kind: ItemKind;
  date: string | null;
  label: string;
  action: string;
  hard: boolean;
  daysLeft: number | null;
  source?: { name: string; url: string };
  context?: string | null;
}

interface DeadlinesData {
  before: string;
  items: DeadlineItem[];
}

// A citation names the publisher, not the thing being cited: `source.name` set
// to the item's own label made the page print the label twice ("UC TAG
// deadline · UC TAG deadline"). Name the site the rule came from instead.
const DEADLINE_SOURCE_NAMES: Array<[string, string]> = [
  ['admission.universityofcalifornia.edu', 'UC admissions: dates and deadlines'],
  ['calstate.edu', 'Cal State Apply'],
  ['elcamino.edu', 'El Camino College'],
];

export function deadlineSourceName(sourceUrl: string): string {
  let host: string;
  try {
    host = new URL(sourceUrl).hostname;
  } catch {
    return sourceUrl;
  }
  const bare = host.replace(/^www\./, '');
  for (const [suffix, name] of DEADLINE_SOURCE_NAMES) {
    if (bare === suffix || bare.endsWith(`.${suffix}`)) return name;
  }
  return bare;
}

// DeadlineRule.category is 'application' | 'tag' | 'college' — every one of
// them is a calendar cutoff the student files somewhere, and the contract's
// item kinds have no separate 'tag'/'college' bucket, so all three collapse
// to 'application' here.
function engineItemToDeadlineItem(d: UpcomingDeadline): DeadlineItem {
  return {
    kind: 'application',
    date: d.date.toISOString(),
    label: d.label,
    action: d.action,
    hard: d.hard,
    daysLeft: d.daysLeft,
    source: { name: deadlineSourceName(d.sourceUrl), url: d.sourceUrl },
    context: d.context,
  };
}

function termStartDate(label: string | null | undefined): Date | null {
  if (!label) return null;
  const m = /^(fall|winter|spring|summer)\s+(\d{4})$/i.exec(label.trim());
  if (!m) return null;
  const season = m[1].toLowerCase();
  const year = Number(m[2]);
  const month = season === 'winter' ? 0 : season === 'spring' ? 2 : season === 'summer' ? 5 : 7;
  return new Date(year, month, 1);
}

// audit.transfer's required, still-missing major-prep rows, matched against
// where buildTermPlan actually scheduled one of that row's options (it labels
// planned rows `Required: ${row.label}` — see src/engine/buildTermPlan.ts —
// but matching by CODE membership in row.options is robust to that changing).
function courseworkItems(profile: StudentProfile, audit: AuditResult): DeadlineItem[] {
  if (!audit.transfer) return [];
  const school = getSchool(profile.school);
  const schoolLabel = school?.shortName ?? profile.school;
  const items: DeadlineItem[] = [];

  const missingRequired = audit.transfer.majorPrep.filter(
    (row: MajorPrepReq & { status: string }) => row.required && row.status === 'missing',
  );

  for (const row of missingRequired) {
    let plannedCode: string | null = null;
    let plannedTerm: string | null = null;
    for (const term of audit.termPlan) {
      const hit = term.courses.find((c) => row.options.includes(c.code));
      if (hit) {
        plannedCode = hit.code;
        plannedTerm = term.label;
        break;
      }
    }
    const label = plannedCode
      ? `Take ${plannedCode} (planned ${plannedTerm}) — satisfies ${row.label} at ${schoolLabel}`
      : `${row.label} at ${schoolLabel} — not yet scheduled`;
    items.push({
      kind: 'coursework',
      date: termStartDate(plannedTerm)?.toISOString() ?? null,
      label,
      action: plannedCode ? `Register for ${plannedCode} in ${plannedTerm}` : 'Not yet placed in the term plan — talk to a counselor about scheduling it',
      hard: false,
      daysLeft: null,
      context: plannedCode ? null : 'The planner could not place this course in the current term plan.',
    });
  }
  return items;
}

function canvasItems(assignments: CanvasAssignmentSnapshot[], now: Date, before: Date): DeadlineItem[] {
  return assignments
    .filter((a) => !a.submitted && a.dueAt && new Date(a.dueAt).getTime() <= before.getTime())
    .map((a) => ({
      kind: 'canvas' as const,
      date: a.dueAt,
      label: `${a.courseLabel}: ${a.name}`,
      action: `Submit "${a.name}" for ${a.courseLabel}`,
      hard: true,
      daysLeft: a.dueAt ? daysUntil(a.dueAt, now) : null,
      source: a.htmlUrl ? { name: a.courseLabel, url: a.htmlUrl } : undefined,
      context: a.missing ? 'Marked missing in Canvas.' : a.late ? 'Marked late in Canvas.' : null,
    }));
}

function reminderItems(reminders: ToolContext['state']['reminders'], now: Date, before: Date): DeadlineItem[] {
  return reminders
    .filter((r) => !r.done && new Date(r.due).getTime() <= before.getTime())
    .map((r) => ({
      kind: 'reminder' as const,
      date: r.due,
      label: r.title,
      action: r.note ?? 'Complete this reminder.',
      hard: false,
      daysLeft: daysUntil(r.due, now),
      source: r.url ? { name: r.title, url: r.url } : undefined,
      context: r.note ?? null,
    }));
}

function getDeadlines(input: DeadlinesInput, ctx: ToolContext): ToolOutput<DeadlinesData> | ToolError {
  const profile = profileFromState(ctx.state);
  const before = input.before ? new Date(`${input.before}T23:59:59`) : new Date(ctx.now.getTime() + 365 * DAY_MS);
  const audit = profile.school && profile.major ? auditFor(profile) : null;

  const caveats: string[] = [];
  let calendarItems: DeadlineItem[];

  if (audit) {
    const system = schoolSystemOf(profile.school);
    const horizonDays = Math.max(0, Math.ceil((before.getTime() - ctx.now.getTime()) / DAY_MS));
    const engineItems = upcomingDeadlines(profile, audit, DEADLINE_RULES, system, ctx.now, { horizonDays });
    calendarItems = engineItems.map(engineItemToDeadlineItem);
  } else {
    caveats.push('No target campus/major set, so this shows the generic UC and CSU calendar rather than one built from your own plan.');
    const uc = genericDeadlines(profile.goal, 'UC', DEADLINE_RULES, ctx.now, 20);
    const csu = genericDeadlines(profile.goal, 'CSU', DEADLINE_RULES, ctx.now, 20);
    calendarItems = [...uc, ...csu]
      .filter((d) => d.date.getTime() <= before.getTime())
      .map(engineItemToDeadlineItem);
  }

  const canvas = ctx.state.canvas;
  if (!canvas) caveats.push("Canvas isn't connected, so no assignment due dates are included.");
  const canvasDue = canvas ? canvasItems(canvas.assignments, ctx.now, before) : [];

  const reminderDue = reminderItems(ctx.state.reminders, ctx.now, before);

  const coursework = audit ? courseworkItems(profile, audit) : [];

  let items = [...calendarItems, ...canvasDue, ...reminderDue, ...coursework]
    // A single uniform cutoff: any item with a known date must fall on or
    // before `before`. Items with no date (a coursework row the planner
    // could not place in a term) carry no date to compare and stay in — the
    // gap is real regardless of the window asked for.
    .filter((i) => i.date === null || new Date(i.date).getTime() <= before.getTime());

  if (input.kinds && input.kinds.length > 0) {
    const allow = new Set(input.kinds);
    items = items.filter((i) => allow.has(i.kind));
  }

  items.sort((a, b) => {
    if (a.date === null && b.date === null) return 0;
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  const citations: Citation[] = [CALENDAR_SOURCE];
  if (audit && profile.school && profile.major) {
    const reqSet = getRequirements(profile.school, profile.major, profile.college);
    if (reqSet) citations.push(reqSet.meta);
  }

  const sample = isSample(ctx.state);
  const extras = sampleExtras(sample, citations, caveats);

  const next = items.find((i) => i.date !== null);
  const summary = items.length === 0
    ? 'Nothing due in the window.'
    : `${items.length} thing${items.length === 1 ? '' : 's'} due before ${before.toDateString()}${next ? `; the nearest is "${next.label}"${next.date ? ` on ${new Date(next.date).toDateString()}` : ''}` : ''}.`;

  return {
    summary,
    data: { before: before.toISOString(), items },
    citations: extras.citations,
    caveats: extras.caveats,
  };
}

export const SCHOOL_IMPLS: ToolImplMap = {
  get_current_courses: getCurrentCourses,
  get_upcoming_work: getUpcomingWork,
  get_grade_risk: getGradeRisk,
  get_deadlines: getDeadlines,
};
