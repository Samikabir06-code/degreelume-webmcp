import type { StudentProfile } from '../types';

// The empty student. Nothing here asserts a fact the student has not given us.
// (Carried from the main product's lib/initialProfile.ts, minus the current-term
// helper; the start term is derived below from today's date.)

function upcomingTerm(now = new Date()): string {
  const m = now.getMonth(); // 0-based
  const y = now.getFullYear();
  if (m <= 0) return `Spring ${y}`;
  if (m <= 4) return `Summer ${y}`;
  if (m <= 7) return `Fall ${y}`;
  return `Spring ${y + 1}`;
}

export const INITIAL_PROFILE: StudentProfile = {
  college: 'ecc',          // this build covers ONE sending college by design (docs/PLAN.md)
  status: 'current',
  goal: 'transfer',
  gradTrack: 'adt',
  school: '',
  major: '',
  fromMajor: null,
  completed: [],
  inProgress: [],
  exams: [],
  frenchBac: false,
  gpa: '',
  startTerm: upcomingTerm(),
  termLoad: 'normal',
  entrySource: 'manual',
  ccEntryTerm: '',
  gePatternChoice: 'auto',
  gePlan: [],
  exploring: false,
  interests: [],
  avoidCourses: [],
};
