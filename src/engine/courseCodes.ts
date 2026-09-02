// One course, two numbers — resolving a renumbered course to today's code.
//
// California's AB 1111 renumbers courses in phases: El Camino's ECON 101
// became ECON C2002 in Fall 2026, ECON 102 became ECON C2001, and seven more
// changed with them. The course did not change. Only the number did.
//
// That leaves the product holding two vocabularies at once:
//
//   · TODAY'S codes — the catalog, the class schedule, the college's own
//     search. This is what a student registers with, so it is what the engine
//     computes in and what the UI shows.
//   · YESTERDAY'S codes — a transcript from Spring 2026, a plan saved before
//     the renumbering, a shared link, and the 2025-26 ASSIST agreements, which
//     printed ECON 101 because that is what ASSIST published that year.
//
// Rewriting the older documents was never an option: an agreement JSON is
// evidence of what a source said on a date. So the codes stay as printed and
// are translated here, against the catalog's own `formerCode` — no separate
// mapping table to drift out of sync with the catalog it describes.
//
// The failure this prevents is specific and expensive: a returning student
// whose transcript says ECON 101 gets told to take Macroeconomics again,
// because a catalog that only knows ECON C2002 cannot see that they've
// already passed it.

import type { Course, CourseCode } from '../types';

// old code → today's code, for every renumbered course in this catalog.
// Built per catalog: colleges renumber on their own schedules, and one
// college's former code can be another's live one.
export function codeAliases(catalog: Course[]): Map<CourseCode, CourseCode> {
  const aliases = new Map<CourseCode, CourseCode>();
  for (const c of catalog) {
    if (c.formerCode) aliases.set(c.formerCode, c.code);
  }
  return aliases;
}

// Today's code for a course code that may be written either way.
//
// A code the catalog still carries is returned untouched even if some other
// course claims it as a former code — a live course always outranks a stale
// alias, so a college that recycles a number can never shadow a real course.
// An unrecognized code is returned as-is: unknown must stay unknown.
export function canonicalCode(catalog: Course[], code: CourseCode): CourseCode {
  if (catalog.some((c) => c.code === code)) return code;
  return codeAliases(catalog).get(code) ?? code;
}

// Same, for a list — deduped, because a plan holding both ECON 101 and
// ECON C2002 is holding one course twice.
export function canonicalCodes(catalog: Course[], codes: readonly CourseCode[]): CourseCode[] {
  const live = new Set(catalog.map((c) => c.code));
  const aliases = codeAliases(catalog);
  const out: CourseCode[] = [];
  const seen = new Set<CourseCode>();
  for (const code of codes) {
    const canonical = live.has(code) ? code : aliases.get(code) ?? code;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

// The number this course used to carry, if it was renumbered. The UI shows it
// so a student holding an older printout, an advisor's note or a transcript
// can tell that ECON C2002 is the course they know as ECON 101.
export function formerCodeOf(catalog: Course[], code: CourseCode): CourseCode | null {
  return catalog.find((c) => c.code === code)?.formerCode ?? null;
}

export const hasRenumberedCourses = (catalog: Course[]): boolean =>
  catalog.some((c) => c.formerCode);
