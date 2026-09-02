import type {
  StudentProfile,
  Course,
  GeArea,
  MajorPrepReq,
  TermPlan,
  PlannedCourse,
  CourseCode,
} from '../types';
import { nextTerm } from './terms';
import { offeringFor } from './termOfferings';

export const UNIT_CAP: Record<string, number> = { light: 12, normal: 15, heavy: 18 };

// Normal/heavy loads accelerate by taking summer terms; light stays fall/spring.
export const usesSummer = (load: string): boolean => load !== 'light';

// Does this student's plan use the short Winter/Summer intersession terms? An
// explicit student opt-out/opt-in wins; otherwise it derives from the load.
export const planUsesIntersessions = (profile: StudentProfile): boolean =>
  profile.includeIntersessions ?? usesSummer(profile.termLoad);

// Summer and Winter are compressed intersessions — a few weeks, not a full
// semester — so they carry a lighter ceiling than the student's regular-term
// load: at most a couple of courses and fewer units, regardless of how
// aggressive their fall/spring load is. (No course in the catalog exceeds 5
// units, so SHORT_TERM_UNIT_CAP always leaves room for at least one course —
// a short term never fails to place anything.)
export const SHORT_TERM_MAX_COURSES = 2;
export const SHORT_TERM_UNIT_CAP = 8;
const SHORT_SEASONS = new Set(['Summer', 'Winter']);
export const isShortTerm = (termLabel: string): boolean =>
  SHORT_SEASONS.has(termLabel.split(' ')[0]);

// The unit ceiling for a given term: the regular load cap, knocked down to the
// intersession cap for Summer/Winter.
export const capForTerm = (termLabel: string, loadCap: number): number =>
  isShortTerm(termLabel) ? Math.min(SHORT_TERM_UNIT_CAP, loadCap) : loadCap;

// The course-count ceiling for a given term (intersessions are limited;
// fall/spring are bounded only by units).
export const maxCoursesForTerm = (termLabel: string): number =>
  isShortTerm(termLabel) ? SHORT_TERM_MAX_COURSES : Infinity;

export interface PlanTargets {
  requiredReqs: MajorPrepReq[];
  optionalReqs: MajorPrepReq[];
  geAreas: GeArea[];                 // transfer GE areas (already system-filtered)
  geField: 'igetc' | 'calgetc';      // per-course tag field for those areas
  geLabel: string;                   // student-facing label for plan rows (e.g. "General ed")
  eccgeAreas: GeArea[];
  unitFloor: number;
}

export interface PlanOutput {
  terms: TermPlan[];
  electiveUnitsNeeded: number;
}

interface ScheduleItem {
  code: CourseCode;
  fills: string;
  priority: number; // lower = scheduled earlier (0 required, 2 optional, 3 GE)
}

export function buildTermPlan(
  profile: StudentProfile,
  targets: PlanTargets,
  catalog: Course[]
): PlanOutput {
  const unitCap = UNIT_CAP[profile.termLoad] ?? 15;
  const doneSet = new Set<CourseCode>([...profile.completed, ...profile.inProgress]);
  // Courses the student asked to skip (exploration "avoid" step). Empty for
  // everyone else, so this whole mechanism is inert on the normal path.
  const avoid = new Set<CourseCode>(profile.avoidCourses ?? []);

  const items: ScheduleItem[] = [];
  const addedCodes = new Set<CourseCode>();

  const courseOf = (code: CourseCode) => catalog.find((c) => c.code === code);

  const missingPrereqCount = (code: CourseCode) =>
    (courseOf(code)?.prereqs ?? []).filter((p) => !doneSet.has(p)).length;

  function addItem(code: CourseCode, fills: string, priority: number) {
    if (doneSet.has(code) || addedCodes.has(code) || avoid.has(code)) return;
    const course = courseOf(code);
    if (!course) return;
    addedCodes.add(code);
    items.push({ code, fills, priority });
    for (const prereq of course.prereqs ?? []) {
      if (!doneSet.has(prereq)) addItem(prereq, `Prereq for ${code}`, priority);
    }
  }

  // How many done/planned courses cover an area, and which departments they span.
  function areaCoverage(areaId: string, field: 'igetc' | 'calgetc' | 'eccge') {
    const depts = new Set<string>();
    let count = 0;
    for (const c of catalog) {
      if ((doneSet.has(c.code) || addedCodes.has(c.code)) && c[field].includes(areaId)) {
        count++;
        depts.add(c.dept);
      }
    }
    return { count, depts };
  }

  // Fill an area up to its required course count and discipline spread.
  function fillGeArea(area: GeArea, field: 'igetc' | 'calgetc' | 'eccge', patternLabel: string) {
    const need = area.count ?? 1;
    const minDepts = area.minDistinctDepts ?? 1;
    const { count, depts } = areaCoverage(area.id, field);
    let have = count;

    const candidates = catalog
      .filter((c) => c[field].includes(area.id) && !doneSet.has(c.code) && !addedCodes.has(c.code) && !avoid.has(c.code))
      .sort((a, b) => missingPrereqCount(a.code) - missingPrereqCount(b.code));

    while (candidates.length > 0) {
      const needMore = have < need;
      const needDept = depts.size < minDepts;
      if (!needMore && !needDept) break;

      // When we still owe disciplines, prefer a course from a new department.
      let idx = needDept ? candidates.findIndex((c) => !depts.has(c.dept)) : -1;
      if (idx === -1) {
        if (!needMore) break; // count is met and no new department is available
        idx = 0;
      }
      const cand = candidates.splice(idx, 1)[0];
      // Plan rows talk like a person: "General ed · Arts", not pattern jargon.
      addItem(cand.code, `${patternLabel} · ${area.label}`, 3);
      have++;
      depts.add(cand.dept);
    }
  }

  // 1+2. Major prep / core, group-aware and CONSUMPTION-consistent with the
  // audit: one done/planned course satisfies at most one requirement (row, or
  // member of a select-N group), so the plan never under-plans rows that share
  // options (e.g. "two additional courses"), and a select-N group plans only
  // as many members as are still needed.
  const planClaimed = new Set<CourseCode>();
  const seenReq = new Set<string>();

  // The unclaimed done/queued course that already satisfies this row, if any.
  const satisfier = (req: MajorPrepReq): CourseCode | null =>
    req.options.find((o) => (doneSet.has(o) || addedCodes.has(o)) && !planClaimed.has(o)) ?? null;

  // Cheapest plannable option for a row, respecting claims.
  const plannableOption = (req: MajorPrepReq): CourseCode | null =>
    req.options
      .filter((c) => courseOf(c) && !planClaimed.has(c) && !doneSet.has(c))
      .sort((a, b) => missingPrereqCount(a) - missingPrereqCount(b))[0] ?? null;

  const planPlainRow = (req: MajorPrepReq, fills: string, priority: number) => {
    const have = satisfier(req);
    if (have) {
      planClaimed.add(have);
      return;
    }
    const code = plannableOption(req);
    if (code) {
      planClaimed.add(code);
      addItem(code, fills, priority);
    }
  };

  const groupedReqs = new Map<string, MajorPrepReq[]>();
  for (const req of targets.requiredReqs) {
    if (seenReq.has(req.id)) continue;
    seenReq.add(req.id);
    if (req.group) {
      const rows = groupedReqs.get(req.group.id) ?? [];
      if (rows.length === 0) groupedReqs.set(req.group.id, rows);
      rows.push(req);
      continue;
    }
    planPlainRow(req, `Required: ${req.label}`, 0);
  }

  for (const rows of groupedReqs.values()) {
    const group = rows[0].group!;
    const members = new Map<string, MajorPrepReq[]>();
    for (const r of rows) {
      const m = members.get(r.group!.memberId) ?? [];
      if (m.length === 0) members.set(r.group!.memberId, m);
      m.push(r);
    }
    // A member is covered when every row has a done/queued unclaimed option;
    // one course may cover several rows of the SAME member, never two members.
    const coveredCourses = (memberRows: MajorPrepReq[]): CourseCode[] | null => {
      const picked = new Set<CourseCode>();
      for (const r of memberRows) {
        const pick =
          r.options.find((c) => picked.has(c)) ??
          r.options.find((c) => (doneSet.has(c) || addedCodes.has(c)) && !planClaimed.has(c) && !picked.has(c));
        if (!pick) return null;
        picked.add(pick);
      }
      return [...picked];
    };
    let needed = group.count;
    const unmet: MajorPrepReq[][] = [];
    for (const memberRows of members.values()) {
      const cover = needed > 0 ? coveredCourses(memberRows) : null;
      if (cover) {
        cover.forEach((c) => planClaimed.add(c));
        needed--;
      } else if (needed > 0) {
        unmet.push(memberRows);
      }
    }
    if (needed <= 0) continue;
    // Plan the cheapest still-needed members: plannable (every row resolvable
    // in the catalog), fewest missing prereqs first.
    const planFor = (memberRows: MajorPrepReq[]): CourseCode[] | null => {
      const picked = new Set<CourseCode>();
      for (const r of memberRows) {
        if (r.options.some((c) => picked.has(c))) continue;
        const cand = r.options
          .filter((c) => courseOf(c) && !planClaimed.has(c) && !picked.has(c) && !doneSet.has(c))
          .sort((a, b) => missingPrereqCount(a) - missingPrereqCount(b))[0];
        if (!cand) return null;
        picked.add(cand);
      }
      return [...picked];
    };
    const ranked = unmet
      .map((memberRows) => ({ memberRows, plan: planFor(memberRows) }))
      .filter((m): m is { memberRows: MajorPrepReq[]; plan: CourseCode[] } => m.plan !== null)
      .sort((a, b) =>
        a.plan.reduce((s, c) => s + missingPrereqCount(c), 0) -
        b.plan.reduce((s, c) => s + missingPrereqCount(c), 0));
    for (const m of ranked.slice(0, needed)) {
      for (const c of m.plan) {
        planClaimed.add(c);
        addItem(c, `Required: ${group.label}`, 0);
      }
    }
  }

  // Optional rows: same consumption rule, lower priority.
  for (const req of targets.optionalReqs) {
    if (seenReq.has(req.id)) continue;
    seenReq.add(req.id);
    planPlainRow(req, `Recommended: ${req.label}`, 2);
  }

  // 3. GE. The student may have CHOSEN specific courses for some areas on the
  // result screen ("build your own GE" — profile.gePlan). Pin those first. An
  // area the student has put any pick into is "theirs": the plan carries exactly
  // their picks and we don't auto-fill that area. Areas they haven't touched
  // still auto-fill, so a student who never opens the picker gets the same
  // complete plan as before (empty gePlan → this whole block is inert).
  const chosenGe = (profile.gePlan ?? []).filter((code) => !doneSet.has(code) && courseOf(code));

  // The label a pinned GE pick shows in the term board — the first area it
  // satisfies, in the student's own pattern (else the local degree pattern).
  const geAreaLabelFor = (code: CourseCode): string => {
    const course = courseOf(code)!;
    const inTransfer = targets.geAreas.find((a) => course[targets.geField].includes(a.id));
    if (inTransfer) return `${targets.geLabel} · ${inTransfer.label}`;
    const inLocal = targets.eccgeAreas.find((a) => course.eccge.includes(a.id));
    if (inLocal) return `Degree GE · ${inLocal.label}`;
    return targets.geLabel;
  };
  for (const code of chosenGe) addItem(code, geAreaLabelFor(code), 3);

  // Did the student explicitly choose a course for this area, in this pattern?
  const touchedArea = (areaId: string, field: 'igetc' | 'calgetc' | 'eccge') =>
    chosenGe.some((code) => courseOf(code)![field].includes(areaId));

  // Transfer pattern first, then ECC GE (overlaps auto-deduped by addItem).
  for (const area of targets.geAreas) {
    // IGETC Area 6 (language) is the French-Bac unknown — don't plan courses for
    // it while a credential claim is pending. Cal-GETC has no language area.
    if (targets.geField === 'igetc' && area.id === '6' && profile.frenchBac) continue;
    if (touchedArea(area.id, targets.geField)) continue;
    fillGeArea(area, targets.geField, targets.geLabel);
  }
  for (const area of targets.eccgeAreas) {
    if (touchedArea(area.id, 'eccge')) continue;
    fillGeArea(area, 'eccge', 'Degree GE');
  }

  // 4. Topological scheduling into terms
  const scheduled = new Set<CourseCode>(doneSet);
  const terms: TermPlan[] = [];
  let remaining = [...items];
  let termLabel = profile.startTerm;
  const summer = planUsesIntersessions(profile);
  let emptyTerms = 0;
  // code → the first term the college was known not to run it in, and why.
  const deferredFrom = new Map<CourseCode, { term: string; detail: string }>();

  while (remaining.length > 0 && terms.length < 8) {
    const available = remaining
      .filter((item) => (courseOf(item.code)?.prereqs ?? []).every((p) => scheduled.has(p)))
      .sort((a, b) => a.priority - b.priority);

    if (available.length === 0) break;

    const termCourses: PlannedCourse[] = [];
    let termUnits = 0;
    const addedThisTerm: CourseCode[] = [];
    // Intersessions (Summer/Winter) take a lighter ceiling than fall/spring.
    const termUnitCap = capForTerm(termLabel, unitCap);
    const termMaxCourses = maxCoursesForTerm(termLabel);

    for (const item of available) {
      if (termCourses.length >= termMaxCourses) break;
      const course = courseOf(item.code)!;
      // Don't put a course in a term the college doesn't run it in. This only
      // skips on real evidence — a listing we pulled for this exact term, or
      // the college's own published cycle. An UNKNOWN never blocks a
      // placement: we would just be swapping one guess for a more
      // confident-looking one (see src/engine/termOfferings.ts).
      const offering = offeringFor(item.code, termLabel);
      if (offering.status === 'not-offered') {
        // Remember the FIRST term we had to skip, and why. A plan that quietly
        // shuffles a course a year later reads as a scheduling quirk; saying
        // "El Camino only runs this in Spring" turns it into information.
        if (!deferredFrom.has(item.code)) {
          deferredFrom.set(item.code, {
            term: termLabel,
            detail: offering.detail ?? `${item.code} isn't offered in ${termLabel}.`,
          });
        }
        continue;
      }
      if (termUnits + course.units <= termUnitCap) {
        termCourses.push({
          code: item.code,
          name: course.name,
          units: course.units,
          fills: item.fills,
          prereqs: course.prereqs ?? [],
          offering,
          ...(deferredFrom.has(item.code) ? { deferredFrom: deferredFrom.get(item.code)! } : {}),
        });
        termUnits += course.units;
        addedThisTerm.push(item.code);
      }
    }

    // Nothing fitted this term. That can now happen because everything left is
    // out of season rather than because the plan is finished, so only stop
    // when there is genuinely nothing left to place; otherwise roll forward.
    if (termCourses.length === 0) {
      if (remaining.length === 0) break;
      emptyTerms += 1;
      // A guard against an unplaceable remainder spinning forever: after a
      // year of empty terms, stop and let the audit report the gap.
      if (emptyTerms > 4) break;
      termLabel = nextTerm(termLabel, summer);
      continue;
    }
    emptyTerms = 0;

    terms.push({ label: termLabel, courses: termCourses, totalUnits: termUnits });
    addedThisTerm.forEach((c) => scheduled.add(c));
    remaining = remaining.filter((item) => !addedThisTerm.includes(item.code));
    termLabel = nextTerm(termLabel, summer);
  }

  // 5. Elective units toward the degree unit floor
  const unitsOf = (codes: Set<CourseCode> | CourseCode[]) => {
    let total = 0;
    for (const code of codes) total += courseOf(code)?.units ?? 0;
    return total;
  };
  let electiveUnitsNeeded = 0;
  if (targets.unitFloor > 0) {
    const doneUnits = unitsOf(doneSet);
    const plannedUnits = unitsOf(addedCodes);
    electiveUnitsNeeded = Math.max(0, targets.unitFloor - (doneUnits + plannedUnits));
  }

  return { terms, electiveUnitsNeeded };
}
