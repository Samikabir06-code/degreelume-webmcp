// ─── Names → registry ids ────────────────────────────────────────────────────
//
// An agent will say "UCLA", "uc los angeles", "Cal State Long Beach", "long
// beach", "csulb", "cs", "comp sci", "math190". A student will say the same
// things. The registry knows exactly one spelling of each. This module is the
// one place that gap is closed, and it is closed DETERMINISTICALLY: a scored
// match over a fixed alias table, never a language model, so the same input
// always resolves to the same campus and the tests can pin it.
//
// Two rules the whole file follows:
//  · Only campuses with `ready: true` resolve. A staged campus has no
//    agreements, and handing one back would promise an answer we cannot give.
//  · A name we cannot place resolves to null, and the caller returns an error
//    listing candidates. Guessing the nearest campus is how a student ends up
//    planning for the wrong university.

import type { Course, MajorMeta, SchoolMeta } from '../types';
import { SCHOOLS } from '../data/schools';
import { MAJORS } from '../data/majors';
import { ECC_COURSES, getCourse } from '../data/courses';
import { canonicalCode } from '../engine/courseCodes';
import { campusesWithData } from './profile';

// ── normalisation ──
// Lower-cased, punctuation folded to spaces, "university of california" and
// "california state university" collapsed to the forms people actually type.
// Applied to BOTH sides of every comparison, so the table below can be written
// the way a person would say it.
export function normalize(input: string): string {
  return input
    .toLowerCase()
    // "San José State" and "San Jose State" are the same campus.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,'’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\buniversity of california\b/g, 'uc')
    .replace(/\bcalifornia state university\b/g, 'csu')
    .replace(/\bcal state\b/g, 'csu')
    .replace(/\bcalifornia state polytechnic university\b/g, 'cal poly')
    .replace(/\bstate university\b/g, 'state')
    .replace(/\buniversity\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extra spellings per campus, beyond the id / name / shortName the registry
// already carries. Only campuses this build can answer for are listed; the
// resolver still filters by `ready` so an alias can never outrank that.
//
// The place-name-only aliases ("long beach", "fullerton", "berkeley") are here
// because that is what people say out loud. They are unambiguous within this
// registry — checked in the tests — and a genuinely ambiguous one would be left
// out rather than resolved to a coin flip.
const CAMPUS_ALIASES: Record<string, string[]> = {
  ucla: ['ucla', 'uc los angeles', 'los angeles', 'ucl a'],
  ucr: ['ucr', 'uc riverside', 'riverside'],
  uci: ['uci', 'uc irvine', 'irvine'],
  'uc-berkeley': ['ucb', 'uc berkeley', 'berkeley', 'cal'],
  'uc-davis': ['ucd', 'uc davis', 'davis'],
  'uc-san-diego': ['ucsd', 'uc san diego', 'san diego'],
  'uc-santa-barbara': ['ucsb', 'uc santa barbara', 'santa barbara'],
  csulb: ['csulb', 'csu long beach', 'long beach', 'long beach state', 'csu longbeach'],
  csudh: ['csudh', 'csu dominguez hills', 'dominguez hills', 'dominguez'],
  csula: ['csula', 'csu los angeles', 'cal state la', 'csu la'],
  'csu-fullerton': ['csuf', 'csu fullerton', 'fullerton', 'titans'],
  'csu-northridge': ['csun', 'csu northridge', 'northridge'],
  'cal-poly-pomona': ['cpp', 'cal poly pomona', 'pomona', 'cal poly p'],
  'csu-sacramento': ['csus', 'sac state', 'csu sacramento', 'sacramento', 'sacramento state'],
  'san-diego-state': ['sdsu', 'san diego state', 'sd state'],
  'sf-state': ['sfsu', 'san francisco state', 'sf state', 'san francisco'],
  'san-jose-state': ['sjsu', 'san jose state', 'san jose', 'sj state'],
};

interface Candidate<T> { item: T; score: number }

// Scoring, highest first:
//   4  exact match on an alias, id, short name or full name
//   3  one is a whole-WORD prefix of the other ("sac" → "sac state")
//   2  one contains the other as a whole PHRASE ("fullerton" ⊂ "csu fullerton")
//   0  no match
//
// Every rule is word-anchored on purpose. A plain substring test looks
// harmless and is not: "economics" contains "cs", so a student asking about
// Economics would have been answered about Computer Science.
function scoreAgainst(needle: string, hay: string): number {
  if (!needle || !hay) return 0;
  if (needle === hay) return 4;
  if (hay.startsWith(`${needle} `) || needle.startsWith(`${hay} `)) return 3;
  if (` ${hay} `.includes(` ${needle} `) || ` ${needle} `.includes(` ${hay} `)) return 2;
  return 0;
}

function campusForms(s: SchoolMeta): string[] {
  return [
    normalize(s.id),
    normalize(s.name),
    normalize(s.shortName),
    ...(CAMPUS_ALIASES[s.id] ?? []).map(normalize),
  ].filter(Boolean);
}

function scoreCampus(needle: string, s: SchoolMeta): number {
  return Math.max(0, ...campusForms(s).map((f) => scoreAgainst(needle, f)));
}

// Every ready campus that plausibly matches, best first — the list an error
// message offers back ("did you mean…"). Ties break on registry order, which is
// UC-then-CSU, so the suggestion list reads the way the picker does.
export function campusCandidates(input: string, n = 5): SchoolMeta[] {
  const needle = normalize(input ?? '');
  if (!needle) return [];
  const scored: Candidate<SchoolMeta>[] = SCHOOLS
    .filter((s) => s.ready)
    .map((item, i) => ({ item, score: scoreCampus(needle, item) - i * 1e-4 }))
    .filter((c) => c.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map((c) => c.item);
}

// One campus, or null. A match must be unambiguous: if two campuses tie at the
// top score the answer is null and the caller shows both, because picking one
// would be picking for the student.
export function resolveCampus(input: string): SchoolMeta | null {
  const needle = normalize(input ?? '');
  if (!needle) return null;
  const ready = SCHOOLS.filter((s) => s.ready);
  const scored = ready.map((item) => ({ item, score: scoreCampus(needle, item) })).filter((c) => c.score > 0);
  if (scored.length === 0) return null;
  const best = Math.max(...scored.map((c) => c.score));
  const top = scored.filter((c) => c.score === best);
  return top.length === 1 ? top[0].item : null;
}

// ── majors ──
//
// The slice carries agreements for three majors only (docs/PLAN.md). A student
// asking about Biology gets an honest "not in this build" from the caller, not
// the nearest major we happen to hold.
export const SLICE_MAJOR_IDS = ['business', 'cs', 'psych'] as const;

const MAJOR_ALIASES: Record<string, string[]> = {
  business: ['business', 'business administration', 'business admin', 'bus', 'biz', 'management'],
  cs: ['cs', 'computer science', 'comp sci', 'compsci', 'computer sci', 'computing', 'software'],
  psych: ['psych', 'psychology', 'psy', 'psychological science'],
};

function majorForms(m: MajorMeta): string[] {
  return [normalize(m.id), normalize(m.name), ...(MAJOR_ALIASES[m.id] ?? []).map(normalize)].filter(Boolean);
}

export function majorCandidates(input: string, n = 3): MajorMeta[] {
  const needle = normalize(input ?? '');
  const pool = MAJORS.filter((m) => (SLICE_MAJOR_IDS as readonly string[]).includes(m.id));
  if (!needle) return [];
  return pool
    .map((item, i) => ({ item, score: Math.max(0, ...majorForms(item).map((f) => scoreAgainst(needle, f))) - i * 1e-4 }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((c) => c.item);
}

export function resolveMajor(input: string): MajorMeta | null {
  const needle = normalize(input ?? '');
  if (!needle) return null;
  const pool = MAJORS.filter((m) => (SLICE_MAJOR_IDS as readonly string[]).includes(m.id));
  const scored = pool
    .map((item) => ({ item, score: Math.max(0, ...majorForms(item).map((f) => scoreAgainst(needle, f))) }))
    .filter((c) => c.score > 0);
  if (scored.length === 0) return null;
  const best = Math.max(...scored.map((c) => c.score));
  const top = scored.filter((c) => c.score === best);
  return top.length === 1 ? top[0].item : null;
}

// ── course codes ──
//
// "math190", "MATH-190", "Math 190", "math 190h" all name catalog codes. The
// catalog prints exactly one form ("MATH 190"), so normalise to it: upper-case,
// one space between the department letters and the number.
// The plausible catalog spellings of what someone typed, best guess first.
// Two shapes have to coexist: the ordinary "MATH 190" and the common-course
// number "PSYC C1000", whose C belongs to the NUMBER, not the department. With
// no separator typed, "PSYC109A" and "PSYCC1000" are only distinguishable by
// asking the catalog which one exists — so we generate both and let the
// resolver decide.
function courseCodeVariants(input: string): string[] {
  const collapsed = (input ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  if (!collapsed) return [];
  const out: string[] = [];
  const push = (s: string) => { if (s && !out.includes(s)) out.push(s); };

  const parts = collapsed.split(' ');
  if (parts.length >= 2 && /^[A-Z]+$/.test(parts[0])) {
    push(`${parts[0]} ${parts.slice(1).join('')}`);
  }
  const joined = collapsed.replace(/\s+/g, '');
  const plain = joined.match(/^([A-Z]+)(\d+[A-Z]*)$/);
  if (plain) push(`${plain[1]} ${plain[2]}`);
  const commonNumber = joined.match(/^([A-Z]+)(C\d+[A-Z]*)$/);
  if (commonNumber) push(`${commonNumber[1]} ${commonNumber[2]}`);
  push(collapsed);
  return out;
}

// The catalog spelling of a course code. Falls back to the best-guess split
// when the catalog carries nothing like it, so an error message can still
// quote the code back the way the catalog would print it.
export function normalizeCourseCode(input: string): string {
  const variants = courseCodeVariants(input);
  const known = variants.find((v) => getCourse(v) || canonicalCode(ECC_COURSES, v) !== v);
  return known ?? variants[0] ?? '';
}

export interface ResolvedCourse {
  course: Course;
  // The student typed a number the college has since retired (AB 1111 common
  // course numbering). The course is the same one; the tools say so rather than
  // silently answering about a code the student did not write.
  viaFormerCode: string | null;
}

// One catalog course, or null. Honours `formerCode`: a transcript that still
// says ECON 101 resolves to ECON C2002, and the result records that it did.
export function resolveCourseCodeDetailed(input: string): ResolvedCourse | null {
  for (const variant of courseCodeVariants(input)) {
    const direct = getCourse(variant);
    if (direct) return { course: direct, viaFormerCode: null };
    // canonicalCode reads the catalog's own formerCode aliases — one source, so
    // it can never drift from the catalog it describes (engine/courseCodes.ts).
    const canonical = canonicalCode(ECC_COURSES, variant);
    if (canonical !== variant) {
      const renamed = getCourse(canonical);
      if (renamed) return { course: renamed, viaFormerCode: variant };
    }
  }
  return null;
}

export function resolveCourseCode(input: string): Course | null {
  return resolveCourseCodeDetailed(input)?.course ?? null;
}

// The nearest catalog codes to something that did not resolve — the hint an
// `unknown_course` error carries. Same department first (a typo'd number is the
// common case), then a prefix match on the whole code.
export function courseCandidates(input: string, n = 3): Course[] {
  const normalized = normalizeCourseCode(input);
  if (!normalized) return [];
  const [dept, number = ''] = normalized.split(' ');
  const scored = ECC_COURSES.map((course) => {
    const [cDept, cNum = ''] = course.code.split(' ');
    let score = 0;
    if (cDept === dept) score += 3;
    else if (cDept.startsWith(dept) || dept.startsWith(cDept)) score += 2;
    if (number && cNum === number) score += 2;
    else if (number && (cNum.startsWith(number) || number.startsWith(cNum))) score += 1;
    if (course.code.replace(' ', '') === normalized.replace(' ', '')) score += 5;
    if (course.formerCode && course.formerCode.replace(' ', '') === normalized.replace(' ', '')) score += 5;
    return { course, score };
  }).filter((c) => c.score > 0);
  scored.sort((a, b) => b.score - a.score || a.course.code.localeCompare(b.course.code));
  return scored.slice(0, n).map((c) => c.course);
}

// Resolve a whole list, keeping the unresolvable ones separate. Every tool that
// accepts coursework uses this: a list with one bad code is an error naming
// that code, never a silently shortened list.
export interface ResolvedCourseList {
  codes: string[];
  renamed: { given: string; code: string }[];
  unknown: string[];
  /** Codes given more than once — including under two spellings of the same
   *  course ("math190" and "MATH 190") or its old and new numbers. */
  duplicates: { code: string; count: number }[];
}

export function resolveCourseList(inputs: readonly string[]): ResolvedCourseList {
  const codes: string[] = [];
  const renamed: { given: string; code: string }[] = [];
  const unknown: string[] = [];
  const seen = new Map<string, number>();
  for (const raw of inputs) {
    const hit = resolveCourseCodeDetailed(raw);
    if (!hit) {
      unknown.push(String(raw).trim());
      continue;
    }
    if (hit.viaFormerCode) renamed.push({ given: hit.viaFormerCode, code: hit.course.code });
    const code = hit.course.code;
    seen.set(code, (seen.get(code) ?? 0) + 1);
    if (!codes.includes(code)) codes.push(code);
  }
  // Merging a repeat is right — a course taken once is one course — but doing
  // it silently is not: a student who pasted their transcript twice, or listed
  // ECON 101 and ECON C2002 believing them to be two classes, should be told
  // which entries collapsed rather than left wondering where their units went.
  const duplicates = [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([code, count]) => ({ code, count }));
  return { codes, renamed, unknown, duplicates };
}

// The caveat both callers show for merged repeats, so they word it the same.
export function duplicateCaveats(duplicates: { code: string; count: number }[]): string[] {
  if (duplicates.length === 0) return [];
  return [`Duplicate entries merged: ${duplicates.map((d) => `${d.code} ×${d.count}`).join(', ')}. Each course was counted once.`];
}

// Campuses that hold an agreement for this major — re-exported so a tool that
// resolves a campus can check coverage without importing two modules.
export { campusesWithData };
