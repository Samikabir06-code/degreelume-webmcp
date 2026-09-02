import type { Course, CourseCode } from '../types';

// ─── GE self-service selection (student-built general education) ───
//
// The result screen lets students pick which courses satisfy each GE area
// themselves; major prep stays engine-planned and locked. This module is the
// pure core behind that surface: per-area plan state for the picker.
//
// Trust boundary (B1/B2): a course the student has COMPLETED is a fact; a course
// they've CHOSEN, are taking, or that the engine pre-scheduled is part of their
// PLAN. The two are kept distinct — an area is only "done" when finished
// coursework alone satisfies it; "planned" means the plan (their picks, their
// in-progress courses, or an engine suggestion) will satisfy it. We never
// collapse a plan into a completed-coursework claim.

export type GeField = 'igetc' | 'calgetc' | 'eccge';

// Precedence high→low when a course qualifies for an area in several ways:
//  done > in-progress > chosen > planned > available.
//  · done / in-progress — facts about the student's record
//  · chosen — the student explicitly picked it here (profile.gePlan)
//  · planned — the engine pre-scheduled it (a suggested default, or a major-prep
//    course that also clears this area); it's in the term plan, not yet a pick
//  · available — qualifies but isn't in the plan
export type GeOptionState = 'done' | 'in-progress' | 'chosen' | 'planned' | 'available';

// The minimal area shape this module needs — AuditedArea satisfies it.
export interface GeAreaSpec {
  id: string;
  need: number;
  minDepts: number;
}

export interface GeOption {
  code: CourseCode;
  name: string;
  units: number;
  dept: string;
  state: GeOptionState;
}

export type GeAreaStatus = 'done' | 'planned' | 'partial' | 'empty';

export interface GeAreaPlan {
  id: string;
  need: number;
  minDepts: number;
  options: GeOption[];
  doneHave: number;   // distinct COMPLETED courses counted toward the area
  doneDepts: number;
  planHave: number;   // distinct done ∪ in-progress ∪ chosen ∪ planned counted
  planDepts: number;
  status: GeAreaStatus;
  remaining: number;     // more courses to add to reach `need` (plan view)
  needsNewDept: boolean; // count may be met but disciplines still short
}

const distinctOver = (options: GeOption[], pred: (o: GeOption) => boolean) => {
  const hits = options.filter(pred);
  return { have: hits.length, depts: new Set(hits.map((o) => o.dept)).size };
};

// Per-area state for one GE area, given the student's completed/in-progress
// facts, their chosen GE courses, and the courses currently in their term plan.
export function geAreaPlan(
  area: GeAreaSpec,
  catalog: Course[],
  field: GeField,
  completed: Set<CourseCode>,
  inProgress: Set<CourseCode>,
  chosen: Set<CourseCode>,
  planned: Set<CourseCode> = new Set(),
): GeAreaPlan {
  const { need, minDepts } = area;

  const options: GeOption[] = catalog
    .filter((c) => c[field].includes(area.id))
    .map((c) => {
      const state: GeOptionState = completed.has(c.code)
        ? 'done'
        : inProgress.has(c.code)
          ? 'in-progress'
          : chosen.has(c.code)
            ? 'chosen'
            : planned.has(c.code)
              ? 'planned'
              : 'available';
      return { code: c.code, name: c.name, units: c.units, dept: c.dept, state };
    })
    .sort((a, b) => a.dept.localeCompare(b.dept) || a.code.localeCompare(b.code));

  const done = distinctOver(options, (o) => o.state === 'done');
  const plan = distinctOver(options, (o) => o.state !== 'available');

  const doneSatisfied = done.have >= need && done.depts >= minDepts;
  const planSatisfied = plan.have >= need && plan.depts >= minDepts;
  const status: GeAreaStatus = doneSatisfied
    ? 'done'
    : planSatisfied
      ? 'planned'
      : plan.have > 0
        ? 'partial'
        : 'empty';

  return {
    id: area.id,
    need,
    minDepts,
    options,
    doneHave: done.have,
    doneDepts: done.depts,
    planHave: plan.have,
    planDepts: plan.depts,
    status,
    remaining: Math.max(0, need - plan.have),
    needsNewDept: plan.depts < minDepts,
  };
}
