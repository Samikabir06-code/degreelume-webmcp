import type { Course, CourseGroup, MajorPrepReq, GeArea, GePatternId } from '../types';

export function groupCourses(
  catalog: Course[],
  majorPrep: MajorPrepReq[],
  geAreas: GeArea[],            // the student's transfer GE pattern, system-filtered
  geField: GePatternId,
): CourseGroup[] {
  const placed = new Set<string>();
  const groups: CourseGroup[] = [];

  // 1. Required major prep
  const requiredCodes = majorPrep
    .filter((r) => r.required)
    .flatMap((r) => r.options);
  const requiredCourses = catalog.filter((c) => requiredCodes.includes(c.code));
  if (requiredCourses.length > 0) {
    requiredCourses.forEach((c) => placed.add(c.code));
    groups.push({ id: 'req-prep', label: 'Required for Major', highlight: true, courses: requiredCourses });
  }

  // 2. Optional major prep
  const optionalCodes = majorPrep
    .filter((r) => !r.required)
    .flatMap((r) => r.options)
    .filter((code) => !placed.has(code));
  const optionalCourses = catalog.filter((c) => optionalCodes.includes(c.code));
  if (optionalCourses.length > 0) {
    optionalCourses.forEach((c) => placed.add(c.code));
    groups.push({ id: 'opt-prep', label: 'Recommended for Major', highlight: false, courses: optionalCourses });
  }

  // 3. Remaining courses grouped by the first GE area they satisfy, in the
  //    student's own pattern (Cal-GETC or IGETC)
  for (const area of geAreas) {
    const satisfying = catalog.filter(
      (c) => !placed.has(c.code) && c[geField].includes(area.id)
    );
    if (satisfying.length > 0) {
      satisfying.forEach((c) => placed.add(c.code));
      groups.push({
        id: `ge-${area.id}`,
        label: `Area ${area.id}: ${area.label}`,
        highlight: false,
        courses: satisfying,
      });
    }
  }

  // 4. Everything else
  const other = catalog.filter((c) => !placed.has(c.code));
  if (other.length > 0) {
    groups.push({ id: 'other', label: 'Other Courses', highlight: false, courses: other });
  }

  return groups;
}
