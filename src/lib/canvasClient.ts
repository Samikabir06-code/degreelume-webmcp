// ─── Canvas client (browser side) ──────────────────────────────────────────
//
// Everything here goes through `/api/canvas/proxy` (worker/canvas.js) — never
// straight to a Canvas host (docs/PLAN.md rule 4: read-only, GET only, token
// forwarded per request, never stored server-side). The token lives only in
// this browser's localStorage, inside `PageState.canvasConnection`.
//
// The course mapper (`catalogCandidates`/`suggestCatalogMatch`) is copied
// from the main product's worker/canvas.js — same subject+number matching, no
// substring/name-overlap guessing. A single unambiguous candidate is treated
// as the mapping outright (`mappedCatalogCode`); more than one candidate is
// left for the student to pick via `setCourseMapping` (`mappingCandidates`).

import type { Course, CourseCode } from '../types';
import { ECC_COURSES } from '../data/courses';
import { CANVAS_INSTITUTIONS } from '../data/canvasInstitutions';
import { getState, setState } from './store';
import type { CanvasAssignmentSnapshot, CanvasCourseSnapshot, CanvasSnapshot } from './store';

const MAX_COURSES_PER_SYNC = 50;
const MAX_COMPLETED_PER_SYNC = 50;
const MAX_ASSIGNMENT_COURSES = 12;
const MAX_ASSIGNMENTS_PER_COURSE = 200;

export interface CanvasHostOption {
  id: string;
  name: string;
  kind: 'college' | 'university';
  host: string;
}

// ─── Course mapper — copied from transferpro/worker/canvas.js ─────────────

function normalizeCode(value: unknown): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function codeParts(value: unknown): { subject: string; number: string } | null {
  const tokens = normalizeCode(value).split(' ').filter(Boolean);
  if (tokens.length < 2) return null;
  const subject = tokens[0];
  if (!/^[A-Z]{2,6}$/.test(subject)) return null;
  const number = tokens.slice(1).find((t) => /^[A-Z]?\d{1,4}[A-Z]{0,2}$/.test(t));
  return number ? { subject, number } : null;
}

export function catalogCandidates(
  canvasCourseCode: string | null,
  canvasCourseName: string,
  catalog: Course[],
): CourseCode[] {
  if (!Array.isArray(catalog)) return [];
  const parts = codeParts(canvasCourseCode) ?? codeParts(canvasCourseName);
  if (!parts) return [];
  const wanted = `${parts.subject} ${parts.number}`;

  const exact = catalog.filter((c) => normalizeCode(c.code) === wanted);
  if (exact.length > 0) return exact.map((c) => c.code);

  const base = parts.number.replace(/[A-Z]+$/, '');
  return catalog
    .filter((c) => {
      const cp = codeParts(c.code);
      return cp && cp.subject === parts.subject && cp.number.replace(/[A-Z]+$/, '') === base;
    })
    .map((c) => c.code)
    .slice(0, 5);
}

export function suggestCatalogMatch(
  canvasCourseCode: string | null,
  canvasCourseName: string,
  catalog: Course[],
): CourseCode | null {
  const candidates = catalogCandidates(canvasCourseCode, canvasCourseName, catalog);
  return candidates.length === 1 ? candidates[0] : null;
}

function mapCourse(code: string | null, name: string): { mappedCatalogCode: CourseCode | null; mappingCandidates: CourseCode[] } {
  const candidates = catalogCandidates(code, name, ECC_COURSES);
  if (candidates.length === 1) return { mappedCatalogCode: candidates[0], mappingCandidates: [] };
  return { mappedCatalogCode: null, mappingCandidates: candidates };
}

// ─── Proxy plumbing ─────────────────────────────────────────────────────────

interface ProxyResult {
  ok: boolean;
  status: number;
  body: unknown;
  linkHeader: string | null;
}

async function proxyGet(host: string, token: string, path: string): Promise<ProxyResult> {
  const url = `/api/canvas/proxy?host=${encodeURIComponent(host)}&path=${encodeURIComponent(path)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error('canvas_proxy_unreachable');
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body, linkHeader: res.headers.get('x-canvas-link') };
}

// The proxy's Link header carries absolute Canvas URLs ("rel=next"); the next
// call still has to go back through OUR proxy, and our proxy requires paths
// starting with /api/v1/, so this keeps that prefix rather than stripping it.
function parseNextPath(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = /<([^>]+)>;\s*rel="next"/.exec(linkHeader);
  if (!match) return null;
  try {
    const u = new URL(match[1]);
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

async function fetchSelf(host: string, token: string): Promise<{ userName: string }> {
  const { ok, status, body } = await proxyGet(host, token, '/api/v1/users/self');
  if (!ok) {
    if (status === 401 || status === 403) throw new Error('canvas_token_invalid');
    if (body && typeof body === 'object' && (body as { error?: string }).error === 'host_not_allowed') {
      throw new Error('host_not_allowed');
    }
    throw new Error('canvas_unreachable');
  }
  const me = body as { id?: unknown; name?: unknown } | null;
  if (typeof me?.name !== 'string' || !me.name) throw new Error('canvas_token_invalid');
  return { userName: me.name };
}

// Follows the proxy's x-canvas-link pagination header, capped for safety.
// Best-effort past the first page: a failed later page keeps what was
// already fetched instead of losing the whole list.
async function fetchList(host: string, token: string, path: string, cap: number): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let next: string | null = path;
  let first = true;
  while (next && items.length < cap) {
    const { ok, status, body, linkHeader } = await proxyGet(host, token, next);
    if (!ok) {
      if (first) throw new Error(`canvas_api_${status}`);
      break;
    }
    if (Array.isArray(body)) items.push(...(body as Record<string, unknown>[]));
    next = parseNextPath(linkHeader);
    first = false;
  }
  return items.slice(0, cap);
}

// ─── Assignment mapping ─────────────────────────────────────────────────────

function buildAssignmentSnapshot(
  raw: Record<string, unknown>,
  canvasCourseId: string,
  courseLabel: string,
): CanvasAssignmentSnapshot {
  const submission = (raw.submission ?? null) as Record<string, unknown> | null;
  const submissionTypes = Array.isArray(raw.submission_types) ? (raw.submission_types as string[]) : [];
  const kind: CanvasAssignmentSnapshot['kind'] =
    raw.is_quiz_assignment === true || submissionTypes.includes('online_quiz')
      ? 'quiz'
      : Boolean(raw.discussion_topic) || submissionTypes.includes('discussion_topic')
        ? 'discussion'
        : submissionTypes.length > 0
          ? 'assignment'
          : 'other';
  const workflowState = typeof submission?.workflow_state === 'string' ? (submission.workflow_state as string) : null;
  const submitted =
    workflowState === 'submitted' ||
    workflowState === 'graded' ||
    workflowState === 'pending_review' ||
    Boolean(submission?.submitted_at);
  const score = typeof submission?.score === 'number' ? (submission.score as number) : null;

  return {
    id: String(raw.id ?? ''),
    canvasCourseId,
    courseLabel,
    name: typeof raw.name === 'string' ? raw.name : 'Untitled assignment',
    kind,
    dueAt: typeof raw.due_at === 'string' ? raw.due_at : null,
    pointsPossible: typeof raw.points_possible === 'number' ? (raw.points_possible as number) : null,
    submitted,
    graded: score !== null,
    score,
    late: submission?.late === true,
    missing: submission?.missing === true,
    htmlUrl: typeof raw.html_url === 'string' ? raw.html_url : null,
  };
}

// Fraction of the grade still ungraded, from the same assignments call — see
// src/engine/riskRadar.ts: null (not 0) whenever there is nothing to compute
// from, since zero means "everything is graded" and that is a different,
// stronger claim.
function computeRemainingWeight(assignments: Record<string, unknown>[]): number | null {
  const counted = assignments.filter(
    (a) =>
      typeof a.points_possible === 'number' &&
      (a.points_possible as number) > 0 &&
      a.omit_from_final_grade !== true &&
      a.grading_type !== 'not_graded',
  );
  const total = counted.reduce((sum, a) => sum + (a.points_possible as number), 0);
  if (total <= 0) return null;
  const stillUngraded = counted
    .filter((a) => {
      const s = a.submission as Record<string, unknown> | undefined;
      if (!s) return true;
      return s.graded_at == null && s.score == null;
    })
    .reduce((sum, a) => sum + (a.points_possible as number), 0);
  return Math.min(1, Math.max(0, stillUngraded / total));
}

// ─── Course row mapping ─────────────────────────────────────────────────────

function courseSnapshotFromRaw(
  raw: Record<string, unknown>,
  enrollmentState: 'active' | 'completed',
  remainingWeight: number | null,
): CanvasCourseSnapshot {
  const id = String(raw.id ?? '');
  const code = typeof raw.course_code === 'string' ? (raw.course_code as string) : null;
  const name = typeof raw.name === 'string' ? (raw.name as string) : '';
  const term = raw.term as Record<string, unknown> | undefined;
  const termName =
    typeof term?.name === 'string' && term.name !== 'Default Term' ? (term.name as string) : null;
  const enrollments = Array.isArray(raw.enrollments) ? (raw.enrollments as Record<string, unknown>[]) : [];
  const enrollment = enrollments[0] ?? null;

  const currentGrade =
    typeof enrollment?.computed_current_grade === 'string' && enrollment.computed_current_grade
      ? (enrollment.computed_current_grade as string)
      : null;
  const finalGradeRaw =
    typeof enrollment?.computed_final_grade === 'string' && enrollment.computed_final_grade
      ? (enrollment.computed_final_grade as string)
      : null;
  const currentScore =
    typeof enrollment?.computed_current_score === 'number' ? (enrollment.computed_current_score as number) : null;
  const finalScore =
    typeof enrollment?.computed_final_score === 'number' ? (enrollment.computed_final_score as number) : null;

  const { mappedCatalogCode, mappingCandidates } = mapCourse(code, name);

  const isCompleted = enrollmentState === 'completed';
  return {
    canvasCourseId: id,
    courseCode: code,
    name,
    termName,
    enrollmentState,
    grade: isCompleted ? null : (currentGrade ?? finalGradeRaw),
    score: isCompleted ? (finalScore ?? currentScore) : (currentScore ?? finalScore),
    finalGrade: isCompleted ? (finalGradeRaw ?? currentGrade) : null,
    remainingWeight: isCompleted ? null : remainingWeight,
    mappedCatalogCode,
    mappingCandidates,
    units: null,
    htmlUrl: typeof raw.html_url === 'string' ? (raw.html_url as string) : null,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

async function syncCanvas(host: string, token: string): Promise<CanvasSnapshot> {
  const trimmedHost = host.trim().toLowerCase();
  const trimmedToken = token.trim();
  if (!trimmedHost) throw new Error('host_required');
  if (!trimmedToken) throw new Error('token_required');

  const { userName } = await fetchSelf(trimmedHost, trimmedToken);

  const active = await fetchList(
    trimmedHost,
    trimmedToken,
    '/api/v1/courses?enrollment_state=active&include[]=total_scores&include[]=term&per_page=50',
    MAX_COURSES_PER_SYNC,
  );

  let completed: Record<string, unknown>[];
  try {
    completed = await fetchList(
      trimmedHost,
      trimmedToken,
      '/api/v1/courses?enrollment_state=completed&include[]=total_scores&include[]=term&per_page=50',
      MAX_COMPLETED_PER_SYNC,
    );
  } catch {
    // Past enrollments are a nice-to-have; some Canvas instances refuse the
    // call, and that must not fail the whole connect.
    completed = [];
  }

  const courses: CanvasCourseSnapshot[] = [];
  const assignments: CanvasAssignmentSnapshot[] = [];
  let assignmentCourseCalls = 0;

  for (const raw of active) {
    const id = String(raw.id ?? '');
    if (!id) continue;

    let remainingWeight: number | null = null;
    if (assignmentCourseCalls < MAX_ASSIGNMENT_COURSES) {
      assignmentCourseCalls += 1;
      try {
        const list = await fetchList(
          trimmedHost,
          trimmedToken,
          `/api/v1/courses/${encodeURIComponent(id)}/assignments?per_page=50&include[]=submission`,
          MAX_ASSIGNMENTS_PER_COURSE,
        );
        const code = typeof raw.course_code === 'string' ? (raw.course_code as string) : null;
        const name = typeof raw.name === 'string' ? (raw.name as string) : '';
        const { mappedCatalogCode } = mapCourse(code, name);
        const courseLabel = mappedCatalogCode ?? code ?? name;
        for (const a of list) assignments.push(buildAssignmentSnapshot(a, id, courseLabel));
        remainingWeight = computeRemainingWeight(list);
      } catch {
        // Assignment weight/list is best-effort; the connect still succeeds
        // without it, and the caller treats the resulting null as unknown.
      }
    }

    courses.push(courseSnapshotFromRaw(raw, 'active', remainingWeight));
  }

  for (const raw of completed) {
    const id = String(raw.id ?? '');
    if (!id) continue;
    courses.push(courseSnapshotFromRaw(raw, 'completed', null));
  }

  const snapshot: CanvasSnapshot = {
    source: 'live',
    host: trimmedHost,
    userName,
    fetchedAt: new Date().toISOString(),
    courses,
    assignments,
  };

  setState({ canvasConnection: { host: trimmedHost, token: trimmedToken }, canvas: snapshot });
  return snapshot;
}

export async function connectCanvas(host: string, token: string): Promise<CanvasSnapshot> {
  return syncCanvas(host, token);
}

export async function refreshCanvas(): Promise<CanvasSnapshot> {
  const connection = getState().canvasConnection;
  if (!connection) throw new Error('canvas_not_connected');
  return syncCanvas(connection.host, connection.token);
}

export function disconnectCanvas(): void {
  setState({ canvasConnection: null, canvas: null });
}

export async function canvasHosts(): Promise<CanvasHostOption[]> {
  try {
    const res = await fetch('/api/canvas/hosts');
    if (res.ok) {
      const body = (await res.json()) as { hosts?: CanvasHostOption[] };
      if (Array.isArray(body?.hosts)) return body.hosts;
    }
  } catch {
    // fall through to the static fallback below
  }
  return CANVAS_INSTITUTIONS.map((i) => ({ id: String(i.id), name: i.name, kind: i.kind, host: i.host }));
}

// The student confirms (or clears, with catalogCode = null) an ambiguous
// Canvas → catalog mapping on the page. An agent cannot call this — it isn't
// a WebMCP tool — because the mapping decision belongs to the student.
export function setCourseMapping(canvasCourseId: string, catalogCode: string | null): void {
  const state = getState();
  if (!state.canvas) return;
  const code = catalogCode ? catalogCode.trim().toUpperCase() : null;
  const courses = state.canvas.courses.map((c) =>
    c.canvasCourseId === canvasCourseId ? { ...c, mappedCatalogCode: code, mappingCandidates: [] } : c,
  );
  setState({ canvas: { ...state.canvas, courses } });
}
