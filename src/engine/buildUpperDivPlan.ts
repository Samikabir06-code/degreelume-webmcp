import type {
  UpperDivRequirementSet,
  UpperDivAudit,
  TermPlan,
  PlannedCourse,
  TermLoad,
} from '../types';

// Quarter schools (UC) fit ~4 courses/term; semester schools (CSU) ~5.
const UD_CAP: Record<'quarter' | 'semester', Record<TermLoad, number>> = {
  quarter: { light: 12, normal: 16, heavy: 20 },
  semester: { light: 12, normal: 15, heavy: 18 },
};

const QUARTER_SLOTS = [
  'Junior · Fall', 'Junior · Winter', 'Junior · Spring',
  'Senior · Fall', 'Senior · Winter', 'Senior · Spring',
];
const SEMESTER_SLOTS = [
  'Junior · Fall', 'Junior · Spring',
  'Senior · Fall', 'Senior · Spring',
];

export function buildUpperDivPlan(
  reqSet: UpperDivRequirementSet,
  schoolName: string,
  system: 'UC' | 'CSU',
  termLoad: TermLoad
): UpperDivAudit {
  const isQuarter = system === 'UC';
  const cap = UD_CAP[isQuarter ? 'quarter' : 'semester'][termLoad];
  const slots = isQuarter ? QUARTER_SLOTS : SEMESTER_SLOTS;

  const codeSet = new Set(reqSet.courses.map((c) => c.code));
  const scheduled = new Set<string>();
  let remaining = [...reqSet.courses];
  const terms: TermPlan[] = [];

  for (const label of slots) {
    if (remaining.length === 0) break;

    // Only enforce prereqs that live within the upper-div set (lower-div is done at transfer)
    const available = remaining.filter((c) =>
      (c.prereqs ?? []).filter((p) => codeSet.has(p)).every((p) => scheduled.has(p))
    );
    if (available.length === 0) break;

    const termCourses: PlannedCourse[] = [];
    let units = 0;
    const added: string[] = [];

    for (const c of available) {
      if (units + c.units <= cap) {
        termCourses.push({ code: c.code, name: c.name, units: c.units, fills: 'Upper-division major', prereqs: c.prereqs ?? [] });
        units += c.units;
        added.push(c.code);
      }
    }
    if (termCourses.length === 0) break;

    terms.push({ label, courses: termCourses, totalUnits: units });
    added.forEach((code) => scheduled.add(code));
    remaining = remaining.filter((c) => !added.includes(c.code));
  }

  const plannedUnits = terms.reduce((s, t) => s + t.totalUnits, 0);
  const electiveUnitsNeeded =
    reqSet.totalUnits > 0 ? Math.max(0, reqSet.totalUnits - plannedUnits) : 0;

  return {
    degreeName: reqSet.degreeName,
    schoolName,
    totalUnits: reqSet.totalUnits,
    plannedUnits,
    electiveUnitsNeeded,
    confidence: reqSet.confidence,
    notes: reqSet.notes,
    terms,
  };
}
