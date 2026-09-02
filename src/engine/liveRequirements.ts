// The ONE requirement resolver behind every live-grade surface.
//
// The Risk Radar needs to answer, for a synced Canvas course: does the
// student's plan actually require this course, and what grade does that
// requirement need? Three callers ask that question — the Canvas sync worker,
// the nightly alert dispatcher, and the counselor's get_live_status tool — and
// they must never answer it differently, or the page, the email, and the chat
// will tell one student three stories (CORE-5). So it lives here once, pure and
// injectable, and each caller imports it rather than re-deriving it.
//
// Honest-unknown law (B2): when there is no saved plan, or the course has no
// CONFIRMED catalog mapping, the answer is "no requirement" — never a guess and
// never a default plan someone didn't choose.

import type { CollegeId, Course, MajorId, SchoolId, StudentProfile } from '../types';
import type { RadarCourse, RadarRequirement } from './riskRadar';
import { getCollege } from '../data/colleges';
import { getSchool } from '../data/schools';
import { getRequirements } from '../data/requirements/index';
import { resolveGePattern } from '../data/gePatterns';
import { gradeRuleFor } from '../data/gradeRules';
import { areasForSystem } from './runAudit';
import { canonicalCode } from './courseCodes';

const NO_REQUIREMENT: RadarRequirement = {
  kind: 'no-requirement',
  requiredPoints: null,
  requiredLabel: null,
  source: '',
};

// A plan profile is only usable when the student actually chose a school and a
// major. Defaulting those (to, say, UCR Business) would compute real verdicts
// against a plan the student never made.
// The identity a PLAN needs before anything may render as one: a college and
// a major always; a destination school only when the goal involves transfer.
// A degree-only student legitimately never picks a school — requiring one
// (as hasUsablePlan below does, for the transfer radar) would block every
// "graduate" plan.
export function hasPlanIdentity(profile: Partial<StudentProfile> | null | undefined): boolean {
  if (!profile) return false;
  const collegeOk = typeof profile.college === 'string' && profile.college;
  const majorOk = typeof profile.major === 'string' && profile.major;
  const schoolOk = profile.goal === 'graduate' || (typeof profile.school === 'string' && profile.school);
  return Boolean(collegeOk && majorOk && schoolOk);
}

export function hasUsablePlan(profile: Partial<StudentProfile> | null | undefined): boolean {
  // College included: the catalog, the local GE pattern and every course code
  // resolve through it, so school+major alone is not a usable plan.
  return Boolean(profile && typeof profile.school === 'string' && profile.school
    && typeof profile.major === 'string' && profile.major
    && typeof profile.college === 'string' && profile.college);
}

// Codes this plan's major prep can be satisfied by. Broad on purpose: a course
// listed as an option for any major-prep row is one the plan cares about, and
// the grade rule it cites is the same C-or-better default either way. Being
// broad here can only add a "this course matters" flag; it can never invent a
// requirement for a course the agreement doesn't mention.
function majorPrepCodes(
  profile: Partial<StudentProfile>,
  collegeId: string | undefined,
): Set<string> {
  const reqSet = getRequirements(profile.school as SchoolId, profile.major as MajorId, collegeId);
  const codes = new Set<string>();
  for (const row of reqSet?.majorPrep ?? []) {
    for (const option of row.options ?? []) codes.add(option);
  }
  return codes;
}

// GE areas the student's chosen pattern actually contains, for the system they
// are transferring into. A course "counts for GE" only if it carries a tag in
// THAT pattern — not merely any pattern.
function geCodes(
  profile: Partial<StudentProfile>,
  catalog: Course[],
): Set<string> {
  const codes = new Set<string>();
  const school = getSchool(profile.school as SchoolId);
  if (!school) return codes;
  let pattern;
  try {
    pattern = resolveGePattern(profile as StudentProfile);
  } catch {
    return codes;
  }
  if (!pattern) return codes;
  const areaIds = new Set((areasForSystem(pattern, school.system) ?? []).map((a) => a.id));
  if (areaIds.size === 0) return codes;
  for (const course of catalog) {
    const tags = pattern.id === 'igetc' ? course.igetc : course.calgetc;
    if ((tags ?? []).some((id) => areaIds.has(id))) codes.add(course.code);
  }
  return codes;
}

// Build the resolver the radar engine takes. `profile` is the student's SAVED
// plan (already sanitized by the caller); pass null/partial and every course
// resolves to "no requirement" rather than to somebody else's plan.
export function buildRequirementResolver(
  profile: Partial<StudentProfile> | null | undefined,
): (course: RadarCourse) => RadarRequirement {
  if (!hasUsablePlan(profile)) return () => NO_REQUIREMENT;
  const p = profile as Partial<StudentProfile>;

  const college = getCollege(p.college as CollegeId);
  const catalog: Course[] = college?.catalog ?? [];
  const collegeId = college?.id;

  const majorCodes = majorPrepCodes(p, collegeId);
  const gePatternCodes = geCodes(p, catalog);
  const school = p.school as string;
  const major = p.major as string;

  return (course: RadarCourse): RadarRequirement => {
    // A SUGGESTION is not a mapping. Until the student confirms that their
    // Canvas "MATH-190-1234" really is catalog MATH 190, a verdict about it
    // would be a verdict about a course we guessed at (B2).
    if (course.mappingStatus !== 'confirmed') return NO_REQUIREMENT;
    // A confirmed mapping is stored once and read for terms afterwards, so one
    // saved before a renumbering still names ECON 102. Requirement codes below
    // are compared as strings — without this the course quietly stops counting
    // and the student stops being warned about the class they're failing.
    const code = course.mappedCatalogCode ? canonicalCode(catalog, course.mappedCatalogCode) : null;
    if (!code) return NO_REQUIREMENT;

    const rule = gradeRuleFor(school, major, code);
    const base = {
      requiredPoints: rule?.points ?? null,
      requiredLabel: rule?.label ?? null,
      source: rule?.source ?? '',
    };

    if (majorCodes.has(code)) return { kind: 'major-prep', ...base };
    if (gePatternCodes.has(code)) return { kind: 'ge', ...base };
    return NO_REQUIREMENT;
  };
}
