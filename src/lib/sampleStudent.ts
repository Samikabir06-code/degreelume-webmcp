// ─── The sample student (docs/PLAN.md § "The sample student") ─────────────
//
// A labelled, fictional UCLA-CS-bound El Camino student, loaded with one
// click so a judge without a Canvas account still sees the whole product.
// Every course code below is checked against src/data/courses.ts — two of
// the codes PLAN.md sketched don't exist in the real catalog, so they are
// substituted with a real course in the same role:
//   · "HIST 101" was El Camino's US-History-to-1877 course; the 2025-26
//     catalog renumbered it to HIST C1001 (Course.formerCode) — the sample
//     uses the code a student would actually find in the class search today.
//   · "COMS C1000" does not exist in the catalog at all; COMS 120 (Critical
//     Thinking Through Argumentation and Debate, IGETC 1C) fills the same
//     "gen-ed communication course" role.
//
// The in-progress Canvas scores/remaining-weights are chosen so the REAL
// deterministic engines (riskRadar + liveRequirements) land on the flags the
// demo storyline needs — not copied blindly from PLAN.md's illustrative
// numbers, which (worked through the actual C-or-better math) would not all
// reproduce the levels the storyline describes. See runRiskRadar in
// src/engine/riskRadar.ts for the exact arithmetic.

import type { Citation } from '../tools/contract';
import type { CanvasAssignmentSnapshot, CanvasCourseSnapshot, CanvasSnapshot, PageState, Reminder } from './store';
import { setState } from './store';

export const SAMPLE_CITATION: Citation = {
  sourceName: 'Sample student (fictional)',
  sourceUrl: '',
  catalogYear: 'n/a',
  verification: 'sample',
};

export function isSample(state: Pick<PageState, 'canvas'>): boolean {
  return state.canvas?.source === 'sample';
}

function addDays(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

function activeCourse(
  canvasCourseId: string,
  courseCode: string,
  name: string,
  mappedCatalogCode: string,
  score: number,
  remainingWeight: number | null,
): CanvasCourseSnapshot {
  return {
    canvasCourseId,
    courseCode,
    name,
    termName: 'Fall 2026',
    enrollmentState: 'active',
    grade: null, // Canvas hasn't posted a letter yet — score is estimated, honestly.
    score,
    finalGrade: null,
    remainingWeight,
    mappedCatalogCode,
    mappingCandidates: [],
    units: null,
    htmlUrl: null,
  };
}

function completedCourse(
  canvasCourseId: string,
  courseCode: string,
  name: string,
  mappedCatalogCode: string,
  finalGrade: string,
  score: number,
): CanvasCourseSnapshot {
  return {
    canvasCourseId,
    courseCode,
    name,
    termName: 'Spring 2026',
    enrollmentState: 'completed',
    grade: null,
    score,
    finalGrade,
    remainingWeight: null,
    mappedCatalogCode,
    mappingCandidates: [],
    units: null,
    htmlUrl: null,
  };
}

function assignment(
  id: string,
  canvasCourseId: string,
  courseLabel: string,
  name: string,
  kind: CanvasAssignmentSnapshot['kind'],
  dueAt: string,
  pointsPossible: number,
  opts: { submitted?: boolean; graded?: boolean; score?: number | null; late?: boolean; missing?: boolean } = {},
): CanvasAssignmentSnapshot {
  return {
    id,
    canvasCourseId,
    courseLabel,
    name,
    kind,
    dueAt,
    pointsPossible,
    submitted: opts.submitted ?? false,
    graded: opts.graded ?? false,
    score: opts.score ?? null,
    late: opts.late ?? false,
    missing: opts.missing ?? false,
    htmlUrl: null,
  };
}

export function loadSampleStudent(now: Date = new Date()): void {
  const courses: CanvasCourseSnapshot[] = [
    // In progress. Scores/remainingWeight tuned against the real engine math
    // (src/engine/riskRadar.ts) so the demo's flags are genuinely correct,
    // not merely narrated:
    //   MATH 191 (C- estimate, half the grade outstanding) -> watch
    //   CSCI 2   (B+ estimate)                             -> ok
    //   PHYS 1B  (D estimate, most of the grade outstanding) -> risk
    //   PSYC C1000 (A estimate)                             -> ok
    activeCourse('sample-math191', 'MATH-191-01', 'MATH 191 · Calculus II', 'MATH 191', 71, 0.5),
    activeCourse('sample-csci2', 'CSCI-002-01', 'CSCI 2 · Data Structures', 'CSCI 2', 88, 0.2),
    activeCourse('sample-phys1b', 'PHYS-1B-01', 'PHYS 1B · Fluids, Heat and Sound', 'PHYS 1B', 66, 0.35),
    activeCourse('sample-psyc1000', 'PSYC-C1000-01', 'PSYC C1000 · Introduction to Psychology', 'PSYC C1000', 93, 0.15),
    // Completed, with final grades.
    completedCourse('sample-math190', 'MATH-190-01', 'MATH 190 · Calculus I', 'MATH 190', 'B+', 88),
    completedCourse('sample-csci1', 'CSCI-001-01', 'CSCI 1 · Problem Solving & Program Design', 'CSCI 1', 'A-', 91),
    completedCourse('sample-engl1000', 'ENGL-C1000-01', 'ENGL C1000 · Academic Reading and Writing', 'ENGL C1000', 'A', 95),
    completedCourse('sample-phys1a', 'PHYS-1A-01', 'PHYS 1A · Mechanics of Solids', 'PHYS 1A', 'B', 85),
    completedCourse('sample-hist1001', 'HIST-C1001-01', 'HIST C1001 · United States History to 1877', 'HIST C1001', 'A-', 92),
    completedCourse('sample-coms120', 'COMS-120-01', 'COMS 120 · Critical Thinking Through Argumentation and Debate', 'COMS 120', 'B+', 87),
  ];

  const assignments: CanvasAssignmentSnapshot[] = [
    // Overdue / missing (2).
    assignment('sample-a1', 'sample-math191', 'MATH 191', 'Problem Set 5', 'assignment', addDays(now, -4), 20, { missing: true }),
    assignment('sample-a2', 'sample-phys1b', 'PHYS 1B', 'Lab 3 report', 'assignment', addDays(now, -6), 15, { missing: true }),
    // Due within 7 days (4).
    assignment('sample-a3', 'sample-csci2', 'CSCI 2', 'Programming Assignment 3', 'assignment', addDays(now, 2), 25),
    assignment('sample-a4', 'sample-math191', 'MATH 191', 'Problem Set 6', 'assignment', addDays(now, 3), 20),
    assignment('sample-a5', 'sample-psyc1000', 'PSYC C1000', 'Reading Quiz 7', 'quiz', addDays(now, 5), 10),
    assignment('sample-a6', 'sample-phys1b', 'PHYS 1B', 'Lab 4 report', 'assignment', addDays(now, 6), 15),
    // Due within 30 days, past the 7-day window (4).
    assignment('sample-a7', 'sample-csci2', 'CSCI 2', 'Midterm 2', 'quiz', addDays(now, 12), 100),
    assignment('sample-a8', 'sample-math191', 'MATH 191', 'Problem Set 7', 'assignment', addDays(now, 15), 20),
    assignment('sample-a9', 'sample-psyc1000', 'PSYC C1000', 'Research paper draft', 'assignment', addDays(now, 20), 40),
    assignment('sample-a10', 'sample-phys1b', 'PHYS 1B', 'Unit 3 exam', 'quiz', addDays(now, 25), 100),
  ];

  const canvas: CanvasSnapshot = {
    source: 'sample',
    host: 'sample',
    userName: 'Sample student',
    fetchedAt: now.toISOString(),
    courses,
    assignments,
  };

  const reminders: Reminder[] = [
    {
      id: 'sample-reminder-1',
      title: 'File UC TAG before Sep 30',
      due: `${now.getFullYear()}-09-30`,
      note: 'UC TAG window closes Sep 30 — submit in UC TAP.',
      done: false,
      createdBy: 'student',
      createdAt: now.toISOString(),
    },
    {
      id: 'sample-reminder-2',
      title: 'Ask a counselor about PHYS 1B options',
      due: addDays(now, -2).slice(0, 10),
      note: 'Talked to the Transfer Center about repeat-vs-alternate options.',
      done: true,
      createdBy: 'student',
      createdAt: addDays(now, -5),
    },
  ];

  setState({
    target: { campus: 'ucla', major: 'cs', entryTerm: 'Fall 2024' },
    completed: ['MATH 190', 'CSCI 1', 'ENGL C1000', 'PHYS 1A', 'HIST C1001', 'COMS 120'],
    inProgress: ['MATH 191', 'CSCI 2', 'PHYS 1B', 'PSYC C1000'],
    canvas,
    canvasConnection: null, // sample data is never "connected" — nothing to refresh from a real host
    reminders,
  });
}
