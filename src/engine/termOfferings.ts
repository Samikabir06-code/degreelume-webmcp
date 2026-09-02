// "Is this course actually offered that term?" — the planner's reality check.
//
// The term planner used to lay courses into terms purely by prerequisite order
// and unit load, which meant it could hand a student a Fall-only course in
// Winter. That plan reads as authoritative and is impossible to register for,
// which is the worst kind of wrong this product can be.
//
// Three answers, and the third is the important one:
//
//   'offered'     — the college lists this course in that term, or its own
//                   published cycle says it runs then.
//   'not-offered' — the college's published cycle excludes that term.
//   'unknown'     — we have no listing for that term AND no published cycle.
//
// An 'unknown' must never move a student's course. We would be replacing a
// guess with a more confident-looking guess, which is worse than leaving it be.

import type { CourseOffering, CourseOfferingStatus } from '../types';
import { TERM_OFFERINGS, TERMS_PULLED, TERM_OFFERING_SOURCE } from '../data/termOfferings';

export type OfferingStatus = CourseOfferingStatus;
export type OfferingAnswer = CourseOffering;

const UNKNOWN: OfferingAnswer = { status: 'unknown', detail: null, pattern: null };

// "Fall 2026" → the season word the college uses in its cycle strings.
function seasonOf(termLabel: string): 'Fall' | 'Winter' | 'Spring' | 'Summer' | null {
  const m = /^(Fall|Winter|Spring|Summer)\b/.exec(termLabel.trim());
  return m ? (m[1] as 'Fall' | 'Winter' | 'Spring' | 'Summer') : null;
}

// The letter this snapshot uses for a term label, when that exact term was one
// of the ones pulled. Matching on the LABEL (not just the season) matters:
// knowing about Fall 2026 tells you nothing about Fall 2027.
function pulledLetterFor(termLabel: string): string | null {
  for (const [letter, label] of Object.entries(TERMS_PULLED)) {
    if (label === termLabel) return letter;
  }
  return null;
}

// Does the college's published cycle include this season? The strings are a
// small, closed vocabulary from the course search, e.g. "Fall and Spring Only",
// "Summer, Fall and Spring Only", "Winter Term Only", "Every Term".
export function patternIncludes(pattern: string | null, season: string): boolean | null {
  if (!pattern) return null;
  const p = pattern.toLowerCase();
  if (p.includes('every term')) return true;
  // Only trust these strings when they look like the cycle vocabulary; an
  // unrecognized string is an unknown, not a "no".
  if (!p.includes('only')) return null;
  return p.includes(season.toLowerCase());
}

export function offeringFor(code: string, termLabel: string): OfferingAnswer {
  const season = seasonOf(termLabel);
  if (!season) return UNKNOWN;
  const record = TERM_OFFERINGS[code];
  if (!record) return UNKNOWN;

  // Hard evidence first: we pulled this exact term and looked.
  const letter = pulledLetterFor(termLabel);
  if (letter) {
    if (record.listed.includes(letter)) {
      return {
        status: 'offered',
        detail: `${code} is in ${termLabel}'s published schedule.`,
        pattern: record.pattern,
      };
    }
    return {
      status: 'not-offered',
      detail: record.pattern
        ? `${code} isn't in ${termLabel}'s published schedule — El Camino lists it as "${record.pattern}".`
        : `${code} isn't in ${termLabel}'s published schedule.`,
      pattern: record.pattern,
    };
  }

  // No listing for that term. Fall back to the college's own published cycle,
  // which is the only honest thing we have about an unpublished term.
  const included = patternIncludes(record.pattern, season);
  if (included === null) return { ...UNKNOWN, pattern: record.pattern };
  return included
    ? {
        status: 'offered',
        detail: `El Camino lists ${code} as "${record.pattern}", so it should run in ${termLabel} — the ${termLabel} schedule isn't published yet.`,
        pattern: record.pattern,
      }
    : {
        status: 'not-offered',
        detail: `El Camino lists ${code} as "${record.pattern}", so it isn't normally offered in ${season} terms.`,
        pattern: record.pattern,
      };
}

// Convenience for the planner: is placing this course in this term known to be
// impossible? Only ever true on real evidence — never on an unknown.
export function knownNotOffered(code: string, termLabel: string): boolean {
  return offeringFor(code, termLabel).status === 'not-offered';
}

export { TERM_OFFERING_SOURCE, TERMS_PULLED };
