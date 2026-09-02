// ─── Page state → StudentProfile → AuditResult ───────────────────────────────
//
// One conversion, used by every tool. The page holds a small, honest record of
// what the student has told it (lib/store.ts); the engine wants the main
// product's full StudentProfile. This is the only place the two meet, so the
// page, the tool console and the agent can never be looking at different
// profiles.
//
// `auditFor` runs `runAudit` exactly the way the main product's `computeAudit`
// does — same inputs, same order, same college resolution — because the whole
// claim of this build is that the agent gets the product's real answer and not
// a re-implementation of it.

import type {
  AuditResult, Course, MajorChoice, SchoolMeta, StudentProfile,
} from '../types';
import type { PageState } from './store';
import { INITIAL_PROFILE } from './initialProfile';
import { runAudit } from '../engine/runAudit';
import { getRequirements } from '../data/requirements';
import { getSchool, SCHOOLS } from '../data/schools';
import { getCollege, DEFAULT_COLLEGE_ID } from '../data/colleges';
import { resolveGePattern } from '../data/gePatterns';
import { ECC_COURSES } from '../data/courses';
import { ECC_GE_AREAS } from '../data/eccge';
import { DATA_VERSION } from '../data/meta';

// This build covers ONE sending college by design (docs/PLAN.md). Every audit
// runs against El Camino's catalog and GE pattern; there is no other college to
// resolve, and defaulting an unknown one would be the fabrication PLAN_LOGIC.md
// forbids.
export const COLLEGE_ID = DEFAULT_COLLEGE_ID;

export interface ProfileOverrides {
  campus?: string;      // registry id, already resolved (see ./resolve.ts)
  major?: string;       // 'business' | 'cs' | 'psych'
  entryTerm?: string;   // "Fall 2024"
  completed?: string[]; // canonical catalog codes
  inProgress?: string[];
}

// Build the engine's StudentProfile from the page plus whatever the caller
// passed explicitly. Overrides arrive ALREADY resolved to registry ids and
// canonical course codes — resolving names is resolve.ts's job, and doing it
// twice is how the two would drift apart.
//
// Nothing here invents a fact: an unset campus stays '', an unset major stays
// '', and an unknown entry term stays '' (which the GE resolver reads as
// "Cal-GETC, valid for everyone" rather than as a claim about this student).
export function profileFromState(state: PageState, overrides: ProfileOverrides = {}): StudentProfile {
  const campus = overrides.campus ?? state.target.campus;
  const major = (overrides.major ?? state.target.major) as MajorChoice;
  const entryTerm = overrides.entryTerm ?? state.target.entryTerm;
  return {
    ...INITIAL_PROFILE,
    college: COLLEGE_ID,
    school: campus,
    major,
    ccEntryTerm: entryTerm,
    completed: overrides.completed ?? state.completed,
    inProgress: overrides.inProgress ?? state.inProgress,
    // A student's goal on this page is transfer. The degree track is left at
    // the profile default; the slice carries no degree templates, so it never
    // produces a degree audit either way (src/data/degrees).
    goal: 'transfer',
  };
}

// The main product's computeAudit, for this build's one college.
//
// Returns null — never an empty audit — when there is nothing to audit: no
// campus, no major, or no agreement for the pair. "We hold no agreement for
// that combination" is a real answer, and the tools say it in words.
export function auditFor(profile: StudentProfile): AuditResult | null {
  if (!profile.school || !profile.major) return null;
  const requirementSet = getRequirements(profile.school, profile.major, profile.college);
  if (!requirementSet) return null;
  const schoolMeta = getSchool(profile.school);
  const college = getCollege(profile.college);
  return runAudit(profile, {
    requirementSet,
    // The slice carries no degree, ADT or upper-division data — see the stubs
    // in src/data/degrees and src/data/upperdiv for why that is honest rather
    // than missing.
    associateDegree: null,
    adtTemplate: null,
    upperDivSet: null,
    collegeName: college?.name ?? 'El Camino College',
    schoolName: schoolMeta?.name ?? profile.school,
    schoolSystem: schoolMeta?.system ?? 'UC',
    catalog: college?.catalog ?? ECC_COURSES,
    // Cal-GETC vs IGETC is the student's own fact (entry term + catalog rights).
    gePattern: resolveGePattern(profile),
    eccgeAreas: college?.localGeAreas ?? ECC_GE_AREAS,
    examCourses: [],
    dataVersion: DATA_VERSION,
  });
}

// Convenience: profile and audit in one call, for a tool that has both.
export function auditForState(state: PageState, overrides: ProfileOverrides = {}): {
  profile: StudentProfile;
  audit: AuditResult | null;
} {
  const profile = profileFromState(state, overrides);
  return { profile, audit: auditFor(profile) };
}

// Campuses that actually hold a requirement set for this major, in schools.ts
// order (UC first, then CSU — the order a student reads them in). An empty
// major returns nothing rather than everything: we do not know which major
// they mean, so we do not guess one.
export function campusesWithData(major: MajorChoice): SchoolMeta[] {
  if (!major) return [];
  return SCHOOLS.filter((s) => s.ready && getRequirements(s.id, major, COLLEGE_ID) != null);
}

// UC or CSU. Falls back to UC for an unknown id, matching the engine's own
// default in runAudit's inputs — the fallback never reaches a real campus,
// because every id we accept came out of the registry.
export function schoolSystemOf(campusId: string): 'UC' | 'CSU' {
  return getSchool(campusId)?.system ?? 'UC';
}

// The catalog this build audits against. Exported so tools do not each reach
// past the college registry to get it.
export const CATALOG: Course[] = getCollege(COLLEGE_ID)?.catalog ?? ECC_COURSES;
