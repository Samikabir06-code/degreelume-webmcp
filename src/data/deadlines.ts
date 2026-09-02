import type { DataProvenance } from '../types';


// Transfer-calendar rules (D2). Recurring annual dates for the fall-2027
// admission cycle (apply Oct–Dec 2026), REBUILT 2026-06-10 from official pages
// — every rule links its source. Status: 'verified' — each date re-checked
// against its linked official page on 2026-07-01 (go-live audit).
//
// Resolved during the 2026-06-10 research pass:
//   · UC filing deadline: Nov 30. The Dec 1 shown for the fall-2026 cycle was a
//     one-off (Nov 30, 2025 fell on a Sunday, so UC extended it); UCSC's dates
//     page states the ordinary deadline is November 30, and the fall-2027 pages
//     (Oct 1 – Nov 30, 2026) confirm it. Re-checked 2026-07-01.
//   · TAU (Transfer Academic Update) priority deadline Jan 31 — added.
//
// Annual-recurrence caveat: ECC intent-to-graduate deadlines are per-term
// (Summer 2026: July 9, hard, no exceptions — read off the graduation page).
// Fall 2026 / Spring 2027 dates are not yet published; check the graduation
// page when the fall term starts (SAMI_TODO item 12) and split this rule if
// the dates diverge.
//
// Scope note (C1): no FAFSA/financial-aid dates here. FA features — including
// reminders — stay frozen until there's a security posture to support them.

export type DeadlineCategory = 'application' | 'tag' | 'college';

export interface DeadlineRule {
  id: string;
  label: string;
  month: number; // 1–12, recurs annually
  day: number;
  category: DeadlineCategory;
  action: string; // the specific thing to do — every nudge must name an action + date (D3)
  appliesTo: 'transfer' | 'graduation' | 'all';
  system?: 'UC' | 'CSU'; // only shown when the student's target is in this system
  college?: string; // a college's OWN date (graduation petitions…) — only shown to students AT that college
  hard: boolean; // a real cutoff (drives the <7-day urgent-nudge exception)
  sourceUrl: string;
}

const UC_DATES_PAGE =
  'https://admission.universityofcalifornia.edu/how-to-apply/applying-as-a-transfer/dates-and-deadlines.html';

// Every rule below was re-checked against its linked official page on
// 2026-07-01 (UC dates page, UC TAG matrix, UC TAU page, Cal State Apply dates,
// ECC graduation page) — see GO_LIVE_CHECKLIST.md for the per-rule evidence.
export const CALENDAR_SOURCE: DataProvenance = {
  sourceName: 'UC transfer dates & deadlines / UC TAG matrix / Cal State Apply / ECC graduation calendar',
  sourceUrl: UC_DATES_PAGE,
  catalogYear: '2027–28',
  lastVerified: '2026-08-23',
  verification: 'verified',
};

export const DEADLINE_RULES: DeadlineRule[] = [
  {
    id: 'ecc-grad-intent',
    label: 'ECC degree / ADT intent deadline',
    month: 7,
    day: 9,
    category: 'college',
    college: 'ecc',
    action: 'File your intent to graduate (AA/AS or AS-T/AA-T petition) with Admissions & Records — July 9 is a hard deadline, no exceptions',
    appliesTo: 'graduation',
    hard: true,
    sourceUrl: 'https://www.elcamino.edu/support/counseling/graduation.php',
  },
  {
    id: 'uc-app-opens',
    label: 'UC application opens',
    month: 8,
    day: 1,
    category: 'application',
    action: 'Create your UC application account and start filling in coursework + activities',
    appliesTo: 'transfer',
    system: 'UC',
    hard: false,
    sourceUrl: UC_DATES_PAGE,
  },
  {
    id: 'uc-tag-opens',
    label: 'UC TAG filing window opens',
    month: 9,
    day: 1,
    category: 'tag',
    action: 'Start your Transfer Admission Guarantee application in UC TAP (window runs Sept 1–30)',
    appliesTo: 'transfer',
    system: 'UC',
    hard: false,
    sourceUrl: UC_DATES_PAGE,
  },
  {
    id: 'uc-tag-deadline',
    label: 'UC TAG submission deadline',
    month: 9,
    day: 30,
    category: 'tag',
    action: 'Submit your TAG application in UC TAP — the window closes today',
    appliesTo: 'transfer',
    system: 'UC',
    hard: true,
    sourceUrl:
      'https://admission.universityofcalifornia.edu/counselors/_files/documents/uc-tag-matrix.pdf',
  },
  {
    id: 'uc-filing-opens',
    label: 'UC application filing opens',
    month: 10,
    day: 1,
    category: 'application',
    action: 'Begin submitting your UC application (filing window: Oct 1 – Nov 30)',
    appliesTo: 'transfer',
    system: 'UC',
    hard: false,
    sourceUrl: UC_DATES_PAGE,
  },
  {
    id: 'uc-filing-deadline',
    label: 'UC application deadline',
    month: 11,
    day: 30,
    category: 'application',
    action: 'Submit your UC application — the filing window closes Nov 30',
    appliesTo: 'transfer',
    system: 'UC',
    hard: true,
    sourceUrl: UC_DATES_PAGE,
  },
  {
    id: 'uc-tau',
    label: 'UC Transfer Academic Update (TAU)',
    month: 1,
    day: 31,
    category: 'application',
    action: 'Submit your Transfer Academic Update with final fall grades and planned spring courses (TAG students must file it)',
    appliesTo: 'transfer',
    system: 'UC',
    hard: true,
    sourceUrl: UC_DATES_PAGE,
  },
  {
    id: 'csu-filing-deadline',
    label: 'CSU priority application deadline',
    month: 11,
    day: 30,
    category: 'application',
    action: 'Submit your Cal State Apply application',
    appliesTo: 'transfer',
    system: 'CSU',
    hard: true,
    sourceUrl: 'https://www.calstate.edu/apply',
  },
];
