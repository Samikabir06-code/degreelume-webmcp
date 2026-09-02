// ─── Page state ─────────────────────────────────────────────────────────────
//
// One small observable store shared by the UI, the tool implementations and
// the WebMCP registration layer. Persisted to localStorage so a student's
// profile, coursework, reminders and Canvas snapshot survive a reload. Nothing
// here is ever sent anywhere except the Canvas token, which goes from this
// browser through our read-only proxy to the student's own Canvas host.
//
// The starting state names NOTHING about the student (docs/PLAN.md, the
// no-fabrication rule): no campus, no major, no courses. "Unknown" is a real
// state every tool reports honestly.

import { useSyncExternalStore } from 'react';
import type { CourseCode, MajorChoice, SchoolId } from '../types';

export interface StudentTarget {
  campus: SchoolId | '';
  major: MajorChoice;
  entryTerm: string;        // first CCC term, "Fall 2024"; '' = unknown
}

export interface CanvasCourseSnapshot {
  canvasCourseId: string;
  courseCode: string | null;      // Canvas's own code, e.g. "MATH-190-2841"
  name: string;
  termName: string | null;
  enrollmentState: 'active' | 'completed' | 'invited' | 'other';
  grade: string | null;           // letter Canvas reports, if any
  score: number | null;           // current percent, if any
  finalGrade: string | null;      // for completed courses
  remainingWeight: number | null; // 0–1 share of the grade still ungraded; null = unknown
  mappedCatalogCode: CourseCode | null; // El Camino catalog code, when unambiguous
  mappingCandidates: CourseCode[];      // when ambiguous — the student picks on the page
  units: number | null;
  htmlUrl: string | null;
}

export interface CanvasAssignmentSnapshot {
  id: string;
  canvasCourseId: string;
  courseLabel: string;            // "MATH 190" if mapped, else Canvas name
  name: string;
  kind: 'assignment' | 'quiz' | 'discussion' | 'other';
  dueAt: string | null;           // ISO
  pointsPossible: number | null;
  submitted: boolean;
  graded: boolean;
  score: number | null;
  late: boolean;
  missing: boolean;
  htmlUrl: string | null;
}

export interface CanvasSnapshot {
  source: 'live' | 'sample';
  host: string;                   // "elcamino.instructure.com" or "sample"
  userName: string | null;
  fetchedAt: string;              // ISO
  courses: CanvasCourseSnapshot[];
  assignments: CanvasAssignmentSnapshot[];
}

export interface Reminder {
  id: string;
  title: string;
  due: string;                    // ISO date or date-time
  note?: string;
  url?: string;
  done: boolean;
  createdBy: 'student' | 'agent';
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  at: string;                     // ISO
  tool: string;
  input: unknown;
  ok: boolean;
  summary: string;                // ToolOutput.summary or the error message
  via: 'agent' | 'console';
}

export interface CanvasConnection {
  host: string;
  token: string;                  // stays in this browser only
}

export interface PageState {
  target: StudentTarget;
  completed: CourseCode[];
  inProgress: CourseCode[];
  canvas: CanvasSnapshot | null;
  canvasConnection: CanvasConnection | null;
  reminders: Reminder[];
  activity: ActivityEntry[];
}

export const INITIAL_STATE: PageState = {
  target: { campus: '', major: '', entryTerm: '' },
  completed: [],
  inProgress: [],
  canvas: null,
  canvasConnection: null,
  reminders: [],
  activity: [],
};

const STORAGE_KEY = 'degreelume-webmcp:v1';
const MAX_ACTIVITY = 60;

type Listener = () => void;

function load(): PageState {
  if (typeof localStorage === 'undefined') return INITIAL_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw) as Partial<PageState>;
    return { ...INITIAL_STATE, ...parsed, target: { ...INITIAL_STATE.target, ...(parsed.target ?? {}) } };
  } catch {
    return INITIAL_STATE;
  }
}

let state: PageState = load();
const listeners = new Set<Listener>();

function persist() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: the page still works for this session.
  }
}

export function getState(): PageState {
  return state;
}

export function setState(patch: Partial<PageState> | ((prev: PageState) => Partial<PageState>)) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  persist();
  listeners.forEach((l) => l());
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetState() {
  state = INITIAL_STATE;
  persist();
  listeners.forEach((l) => l());
}

export function recordActivity(entry: Omit<ActivityEntry, 'id' | 'at'>) {
  const full: ActivityEntry = { ...entry, id: newId(), at: new Date().toISOString() };
  setState((prev) => ({ activity: [full, ...prev.activity].slice(0, MAX_ACTIVITY) }));
  return full;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// React binding.
export function usePageState(): PageState {
  return useSyncExternalStore(subscribe, getState, getState);
}

// Test helper: swap the whole state without touching storage listeners' expectations.
export function __setStateForTests(next: PageState) {
  state = next;
  listeners.forEach((l) => l());
}
