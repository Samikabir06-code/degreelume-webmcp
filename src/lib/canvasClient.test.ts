import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { INITIAL_STATE, __setStateForTests, getState } from './store';
import {
  canvasHosts,
  catalogCandidates,
  connectCanvas,
  disconnectCanvas,
  refreshCanvas,
  setCourseMapping,
  suggestCatalogMatch,
} from './canvasClient';
import { ECC_COURSES } from '../data/courses';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function pathOf(input: unknown): string {
  const url = new URL(String(input), 'http://localhost');
  return url.searchParams.get('path') ?? '';
}

const SELF = { id: 42, name: 'Sample Student' };

const ACTIVE_COURSES = [
  {
    id: 501,
    course_code: 'MATH-191-9001',
    name: 'MATH 191 · Calc II',
    term: { name: 'Fall 2026' },
    html_url: 'https://elcamino.instructure.com/courses/501',
    enrollments: [{ computed_current_grade: null, computed_current_score: 71 }],
  },
  {
    id: 502,
    course_code: 'XYZLANG-999-9002',
    name: 'A course with no catalog match',
    term: { name: 'Fall 2026' },
    html_url: 'https://elcamino.instructure.com/courses/502',
    enrollments: [{ computed_current_grade: null, computed_current_score: 88 }],
  },
];

const COMPLETED_COURSES = [
  {
    id: 400,
    course_code: 'ENGL-C1000-8001',
    name: 'ENGL C1000 · Academic Reading and Writing',
    term: { name: 'Spring 2026' },
    enrollments: [{ computed_final_grade: 'A-', computed_final_score: 91 }],
  },
];

const ASSIGNMENTS_501 = [
  {
    id: 9001,
    name: 'Problem Set 6',
    due_at: '2026-09-10T07:59:00Z',
    points_possible: 20,
    submission_types: ['online_upload'],
    submission: { workflow_state: 'graded', score: 18, graded_at: '2026-09-05T00:00:00Z' },
  },
  {
    id: 9002,
    name: 'Midterm 2',
    due_at: '2026-09-20T07:59:00Z',
    points_possible: 100,
    submission_types: ['online_quiz'],
    is_quiz_assignment: true,
    submission: { workflow_state: 'unsubmitted', missing: true },
  },
];

function installFetchMock() {
  const fetchMock = vi.fn(async (input: unknown) => {
    const path = pathOf(input);
    if (path === '/api/v1/users/self') return jsonResponse(SELF);
    if (path.startsWith('/api/v1/courses?enrollment_state=active')) return jsonResponse(ACTIVE_COURSES);
    if (path.startsWith('/api/v1/courses?enrollment_state=completed')) return jsonResponse(COMPLETED_COURSES);
    if (path.startsWith('/api/v1/courses/501/assignments')) return jsonResponse(ASSIGNMENTS_501);
    if (path.startsWith('/api/v1/courses/502/assignments')) return jsonResponse([]);
    return jsonResponse({ error: 'not_found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  __setStateForTests({ ...INITIAL_STATE, activity: [], reminders: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('catalogCandidates / suggestCatalogMatch', () => {
  it('finds the single exact subject+number match', () => {
    const candidates = catalogCandidates('MATH-191-9001', 'Calc II', ECC_COURSES);
    expect(candidates).toEqual(['MATH 191']);
    expect(suggestCatalogMatch('MATH-191-9001', 'Calc II', ECC_COURSES)).toBe('MATH 191');
  });

  it('returns no candidates for a course with no catalog match', () => {
    expect(catalogCandidates('XYZLANG-999-9002', 'nothing like this', ECC_COURSES)).toEqual([]);
    expect(suggestCatalogMatch('XYZLANG-999-9002', 'nothing', ECC_COURSES)).toBeNull();
  });
});

describe('connectCanvas', () => {
  it('builds a live snapshot with mapped courses, assignments and remaining weight', async () => {
    installFetchMock();
    const snapshot = await connectCanvas('elcamino.instructure.com', 'tok-123');

    expect(snapshot.source).toBe('live');
    expect(snapshot.host).toBe('elcamino.instructure.com');
    expect(snapshot.userName).toBe('Sample Student');
    expect(snapshot.courses).toHaveLength(3); // 2 active + 1 completed

    const math191 = snapshot.courses.find((c) => c.canvasCourseId === '501');
    expect(math191?.mappedCatalogCode).toBe('MATH 191');
    expect(math191?.mappingCandidates).toEqual([]);
    expect(math191?.enrollmentState).toBe('active');
    expect(math191?.score).toBe(71);
    // 20 pts graded, 100 pts missing => 100/120 still ungraded.
    expect(math191?.remainingWeight).toBeCloseTo(100 / 120, 5);

    const unmapped = snapshot.courses.find((c) => c.canvasCourseId === '502');
    expect(unmapped?.mappedCatalogCode).toBeNull();
    expect(unmapped?.mappingCandidates).toEqual([]);
    expect(unmapped?.remainingWeight).toBeNull(); // no counted assignments returned

    const completed = snapshot.courses.find((c) => c.canvasCourseId === '400');
    expect(completed?.enrollmentState).toBe('completed');
    expect(completed?.finalGrade).toBe('A-');
    expect(completed?.remainingWeight).toBeNull();

    expect(snapshot.assignments).toHaveLength(2);
    const midterm = snapshot.assignments.find((a) => a.id === '9002');
    expect(midterm?.kind).toBe('quiz');
    expect(midterm?.missing).toBe(true);
    expect(midterm?.submitted).toBe(false);
    expect(midterm?.graded).toBe(false);
    const pset = snapshot.assignments.find((a) => a.id === '9001');
    expect(pset?.kind).toBe('assignment');
    expect(pset?.submitted).toBe(true);
    expect(pset?.graded).toBe(true);
    expect(pset?.score).toBe(18);
    expect(pset?.courseLabel).toBe('MATH 191');

    // The connection and snapshot are saved to the page store.
    const state = getState();
    expect(state.canvasConnection).toEqual({ host: 'elcamino.instructure.com', token: 'tok-123' });
    expect(state.canvas?.source).toBe('live');
  });

  it('rejects an empty token', async () => {
    installFetchMock();
    await expect(connectCanvas('elcamino.instructure.com', '')).rejects.toThrow('token_required');
  });

  it('surfaces an invalid token as canvas_token_invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'canvas_token_invalid' }, 401)),
    );
    await expect(connectCanvas('elcamino.instructure.com', 'bad-token')).rejects.toThrow('canvas_token_invalid');
  });
});

describe('refreshCanvas', () => {
  it('throws canvas_not_connected with no stored connection', async () => {
    await expect(refreshCanvas()).rejects.toThrow('canvas_not_connected');
  });

  it('re-syncs using the stored connection', async () => {
    const fetchMock = installFetchMock();
    await connectCanvas('elcamino.instructure.com', 'tok-123');
    fetchMock.mockClear();

    const snapshot = await refreshCanvas();
    expect(snapshot.source).toBe('live');
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe('disconnectCanvas', () => {
  it('clears the connection and the snapshot', async () => {
    installFetchMock();
    await connectCanvas('elcamino.instructure.com', 'tok-123');
    expect(getState().canvas).not.toBeNull();

    disconnectCanvas();
    expect(getState().canvasConnection).toBeNull();
    expect(getState().canvas).toBeNull();
  });
});

describe('canvasHosts', () => {
  it('returns the worker list when the fetch succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ hosts: [{ id: 'ecc', name: 'El Camino College', kind: 'college', host: 'elcamino.instructure.com' }] }),
      ),
    );
    const hosts = await canvasHosts();
    expect(hosts).toEqual([{ id: 'ecc', name: 'El Camino College', kind: 'college', host: 'elcamino.instructure.com' }]);
  });

  it('falls back to the static registry when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const hosts = await canvasHosts();
    expect(hosts.length).toBeGreaterThan(0);
    expect(hosts.find((h) => h.id === 'ucla')).toMatchObject({ host: 'bruinlearn.ucla.edu' });
  });
});

describe('setCourseMapping', () => {
  it('confirms a mapping the student picked and clears the candidate list', async () => {
    installFetchMock();
    await connectCanvas('elcamino.instructure.com', 'tok-123');

    setCourseMapping('502', 'CSCI 1');
    const course = getState().canvas?.courses.find((c) => c.canvasCourseId === '502');
    expect(course?.mappedCatalogCode).toBe('CSCI 1');
    expect(course?.mappingCandidates).toEqual([]);
  });

  it('clears a mapping when given null', async () => {
    installFetchMock();
    await connectCanvas('elcamino.instructure.com', 'tok-123');

    setCourseMapping('501', null);
    const course = getState().canvas?.courses.find((c) => c.canvasCourseId === '501');
    expect(course?.mappedCatalogCode).toBeNull();
  });

  it('is a no-op with no Canvas snapshot', () => {
    expect(() => setCourseMapping('999', 'MATH 190')).not.toThrow();
    expect(getState().canvas).toBeNull();
  });
});
