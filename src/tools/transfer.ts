// ─── Transfer tools ──────────────────────────────────────────────────────────
//
// The five deterministic answers this counselor gives about ASSIST articulation
// data: what it covers, whether one course carries, what a whole transcript
// looks like at one campus, how the same transcript compares across every
// campus, and what one requirement row actually asks for.
//
// Every one of them runs the SAME engine the main product runs (lib/profile.ts
// → runAudit), cites the agreement it used with its academic year and
// verification state, and says out loud when that agreement has not been read
// by a person. No summary here ever says "guaranteed" or "will be admitted":
// the verdict vocabulary is the engine's own eligible / competitive / reach.

import type {
  AuditResult, AuditedArea, AuditedReq, Course, MajorMeta, MajorPrepReq, RequirementSet, SchoolMeta,
} from '../types';
import type { Citation, ToolError, ToolOutput } from './contract';
import { toolError, type ToolContext, type ToolImplMap } from './runtime';
import { getRequirements } from '../data/requirements';
import { CATALOG_SOURCE, DATA_VERSION } from '../data/meta';
import { getCollege } from '../data/colleges';
import { getMajor } from '../data/majors';
import { IGETC_AREAS } from '../data/igetc';
import { CALGETC_AREAS } from '../data/calgetc';
import { summarizeSwitch, type SwitchCandidate } from '../engine/majorSwitch';
import {
  auditFor, campusesWithData, profileFromState, COLLEGE_ID, CATALOG,
} from '../lib/profile';
import {
  campusCandidates, courseCandidates, duplicateCaveats, majorCandidates, resolveCampus,
  resolveCourseCodeDetailed, resolveCourseList, resolveMajor, SLICE_MAJOR_IDS,
} from '../lib/resolve';

// ── citations and caveats ────────────────────────────────────────────────────

export function agreementCitation(set: RequirementSet): Citation {
  return {
    sourceName: set.meta.sourceName,
    sourceUrl: set.meta.sourceUrl,
    catalogYear: set.meta.catalogYear,
    verification: set.meta.verification,
    lastVerified: set.meta.lastVerified,
  };
}

export const catalogCitation: Citation = {
  sourceName: CATALOG_SOURCE.sourceName,
  sourceUrl: CATALOG_SOURCE.sourceUrl,
  catalogYear: CATALOG_SOURCE.catalogYear,
  verification: CATALOG_SOURCE.verification,
  lastVerified: CATALOG_SOURCE.lastVerified,
};

// The honest limits of one agreement, in the words a student should hear them
// in. 'unreviewed' is the big one: the rows came off ASSIST through a
// transform, and nobody has read them line by line yet.
export function caveatsFor(set: RequirementSet, schoolName: string): string[] {
  const out: string[] = [];
  if (set.meta.verification === 'unreviewed') {
    out.push('This agreement was machine-transcribed from ASSIST and has not been read row-by-row by a person.');
  }
  if (set.meta.verification === 'demo') {
    out.push('This agreement is illustrative sample data, not a transcription of a real ASSIST agreement.');
  }
  if (set.noArticulatedPrep) {
    out.push(`${schoolName} lists lower-division requirements for this major but articulates none of them from El Camino — ASSIST returns an empty articulation set, which means those courses are taken after transfer.`);
  }
  if (set.impacted) {
    out.push('This major is selective at this campus. Meeting every published requirement does not by itself decide admission — applicants are reviewed competitively.');
  }
  return out;
}

// ── target resolution ────────────────────────────────────────────────────────

interface Target { campus: SchoolMeta; major: MajorMeta; set: RequirementSet }

const TARGET_NOT_SET = () => toolError(
  'target_not_set',
  'No target campus/major on the page and none given.',
  'Ask the student, or call set_student_target, or pass campus and major.',
);

export function resolveCampusArg(given: string | undefined, fromState: string): SchoolMeta | ToolError {
  const raw = (given ?? '').trim() || fromState;
  if (!raw) return TARGET_NOT_SET();
  const hit = resolveCampus(raw);
  if (hit) return hit;
  const near = campusCandidates(raw, 5).map((s) => `${s.name} (${s.id})`);
  return toolError(
    'unknown_campus',
    `I do not have "${raw}" as a destination campus in this build.`,
    near.length
      ? `Did you mean: ${near.join(', ')}? Call list_options for the full list.`
      : 'Call list_options for the campuses this counselor covers.',
  );
}

export function resolveMajorArg(given: string | undefined, fromState: string): MajorMeta | ToolError {
  const raw = (given ?? '').trim() || fromState;
  if (!raw) return TARGET_NOT_SET();
  const hit = resolveMajor(raw);
  if (hit) return hit;
  const near = majorCandidates(raw, 3).map((m) => `${m.name} (${m.id})`);
  return toolError(
    'unknown_major',
    `This build carries articulation data for three majors only, and "${raw}" is not one of them.`,
    near.length
      ? `Did you mean: ${near.join(', ')}?`
      : 'The covered majors are business (Business Administration), cs (Computer Science) and psych (Psychology).',
  );
}

// Campus + major + the agreement behind them, or the error the agent should
// relay. Defaults come from the page; an explicit argument always wins.
export function resolveTarget(
  ctx: ToolContext,
  input: { campus?: string; major?: string },
): Target | ToolError {
  const campus = resolveCampusArg(input.campus, ctx.state.target.campus);
  if ('error' in campus) return campus;
  const major = resolveMajorArg(input.major, ctx.state.target.major);
  if ('error' in major) return major;
  const set = getRequirements(campus.id, major.id, COLLEGE_ID);
  if (!set) {
    return toolError(
      'no_agreement',
      `This build holds no El Camino → ${campus.name} agreement for ${major.name}.`,
      'Call list_options to see which campus/major pairs are covered.',
    );
  }
  return { campus, major, set };
}

function isErr(x: unknown): x is ToolError {
  return typeof x === 'object' && x !== null && 'error' in x;
}

// ── shared shaping ───────────────────────────────────────────────────────────

function rowShape(r: AuditedReq) {
  return {
    id: r.id,
    label: r.label,
    status: r.status,
    required: r.required,
    ...(r.satisfiedBy ? { satisfiedBy: r.satisfiedBy } : {}),
    ...(r.inProgressBy ? { inProgressBy: r.inProgressBy } : {}),
    ...(r.group ? { group: { id: r.group.id, label: r.group.label, count: r.group.count } } : {}),
  };
}

function areaShape(a: AuditedArea) {
  return { id: a.id, label: a.label, status: a.status, have: a.have, need: a.need, courses: a.courses };
}

// Coursework for an audit: the argument when given, otherwise what the page
// holds. An unresolvable code is an error naming it, never a silently shorter
// list — an audit run on four of a student's five courses is a wrong audit.
function courseworkFrom(
  ctx: ToolContext,
  input: { courses?: string[]; inProgress?: string[] },
): { completed: string[]; inProgress: string[]; renamed: { given: string; code: string }[]; notes: string[] } | ToolError {
  const renamed: { given: string; code: string }[] = [];
  const unknown: string[] = [];
  const notes: string[] = [];
  const take = (given: string[] | undefined, fallback: string[]): string[] => {
    if (!given) return fallback;
    const r = resolveCourseList(given);
    renamed.push(...r.renamed);
    unknown.push(...r.unknown);
    notes.push(...duplicateCaveats(r.duplicates));
    return r.codes;
  };
  const completed = take(input.courses, ctx.state.completed);
  const inProgress = take(input.inProgress, ctx.state.inProgress);
  // The engine drops a course from in-progress when it is also completed
  // (runAudit does this deliberately — one course cannot be both). That is the
  // right resolution, but done silently it looks like a course went missing,
  // so the overlap is named.
  const both = completed.filter((c) => inProgress.includes(c));
  for (const code of both) {
    notes.push(`${code} was listed as both completed and in progress; counted as completed.`);
  }
  if (unknown.length > 0) {
    const hints = unknown
      .map((u) => `${u} → ${courseCandidates(u, 3).map((c) => c.code).join(', ') || 'no near match'}`)
      .join('; ');
    return toolError(
      'unknown_course',
      `These are not El Camino course codes in the 2025–26 catalog: ${unknown.join(', ')}.`,
      `Nearest catalog codes — ${hints}.`,
    );
  }
  return { completed, inProgress, renamed, notes };
}

function renameCaveats(renamed: { given: string; code: string }[]): string[] {
  return renamed.map(
    (r) => `${r.given} is now numbered ${r.code} at El Camino (California's common course numbering). It is the same course, and it was counted as ${r.code}.`,
  );
}

// ── list_options ─────────────────────────────────────────────────────────────

const list_options = (): ToolOutput => {
  const college = getCollege(COLLEGE_ID)!;
  const majors = SLICE_MAJOR_IDS.map((id) => {
    const m = getMajor(id)!;
    return { id: m.id, name: m.name };
  });

  const campusIds = new Set<string>();
  for (const m of SLICE_MAJOR_IDS) for (const s of campusesWithData(m)) campusIds.add(s.id);

  const campuses = [...campusIds].map((id) => {
    const sets = SLICE_MAJOR_IDS
      .map((m) => ({ major: m, set: getRequirements(id, m, COLLEGE_ID) }))
      .filter((x): x is { major: (typeof SLICE_MAJOR_IDS)[number]; set: RequirementSet } => x.set != null);
    const school = sets[0] ? campusesWithData(sets[0].major).find((s) => s.id === id)! : null;
    // The tier is read off the agreements themselves, not off a hand-kept
    // list: a campus is 'verified' only when every agreement we hold for it
    // has actually been read by a person.
    const tier = sets.every((s) => s.set.meta.verification === 'verified')
      ? 'verified' as const
      : 'machine-transcribed' as const;
    return {
      id,
      name: school?.name ?? id,
      shortName: school?.shortName ?? id,
      system: school?.system ?? 'UC',
      tier,
      majors: sets.map((s) => s.major),
    };
  });

  const verified = campuses.filter((c) => c.tier === 'verified').length;
  const summary =
    `This counselor answers for one sending college, ${college.name}, transferring to ${campuses.length} UC and CSU campuses in ${majors.length} majors: ${majors.map((m) => m.name).join(', ')}. ` +
    `Its El Camino catalog snapshot holds ${CATALOG.length} courses for ${CATALOG_SOURCE.catalogYear}. ` +
    `${verified} of the ${campuses.length} campuses have agreements a person has read row by row; the rest were machine-transcribed from ASSIST and say so on every answer.`;

  return {
    summary,
    data: {
      college: { id: college.id, name: college.name, shortName: college.shortName },
      campuses,
      majors,
      catalogSize: CATALOG.length,
      dataVersion: DATA_VERSION,
    },
    citations: [catalogCitation, {
      sourceName: 'ASSIST articulation agreements (statewide CCC → UC/CSU)',
      sourceUrl: 'https://assist.org',
      catalogYear: CATALOG_SOURCE.catalogYear,
      verification: 'unreviewed',
    }],
    caveats: [
      'This build covers El Camino College only. A student at another community college would get different articulation, and this tool must not be used for one.',
      'Agreements marked machine-transcribed came off ASSIST through an automated transform and have not been read row-by-row by a person.',
    ],
  };
};

// ── check_course_transfer ────────────────────────────────────────────────────

function geAreaList(ids: string[], areas: { id: string; label: string }[]) {
  return ids
    .map((id) => areas.find((a) => a.id === id))
    .filter((a): a is { id: string; label: string } => a != null)
    .map((a) => ({ id: a.id, label: a.label }));
}

function rowsAccepting(set: RequirementSet, code: string) {
  return set.majorPrep.filter((r) => r.options.includes(code));
}

const check_course_transfer = (
  input: { course?: string; campus?: string; major?: string },
  ctx: ToolContext,
): ToolOutput | ToolError => {
  const given = (input.course ?? '').trim();
  if (!given) {
    return toolError('missing_course', 'No course given.', 'Pass an El Camino course code, e.g. "MATH 190".');
  }
  const hit = resolveCourseCodeDetailed(given);
  if (!hit) {
    const near = courseCandidates(given, 3).map((c) => `${c.code} (${c.name})`);
    return toolError(
      'unknown_course',
      `"${given}" is not an El Camino course code in the 2025–26 catalog snapshot.`,
      near.length ? `Nearest catalog codes: ${near.join(', ')}.` : 'Call list_options to see what this build covers.',
    );
  }
  const target = resolveTarget(ctx, input);
  if (isErr(target)) return target;
  const { campus, major, set } = target;
  const course: Course = hit.course;

  const rows = rowsAccepting(set, course.code);
  const satisfies = rows.map((r) => ({
    rowId: r.id,
    label: r.label,
    required: r.required,
    ...(r.group ? { group: { label: r.group.label, count: r.group.count } } : {}),
  }));

  // Where else the same course carries for the same major, and where it does
  // not — the two questions a student asks the moment the answer at one campus
  // is "no". Both lists are computed over every campus this build covers for
  // the major, so "it doesn't count anywhere" and "we didn't check" can never
  // look the same.
  const elsewhere = campusesWithData(major.id)
    .filter((s) => s.id !== campus.id)
    .map((s) => {
      const other = getRequirements(s.id, major.id, COLLEGE_ID)!;
      const hits = rowsAccepting(other, course.code);
      return { campus: s.id, campusName: s.name, rows: hits.map((r) => r.label) };
    });
  const alsoAcceptedAt = elsewhere.filter((x) => x.rows.length > 0);
  const notAcceptedAt = elsewhere
    .filter((x) => x.rows.length === 0)
    .map((x) => ({ campus: x.campus, campusName: x.campusName }));

  const geAreas = {
    calgetc: geAreaList(course.calgetc, CALGETC_AREAS),
    igetc: geAreaList(course.igetc, IGETC_AREAS),
  };

  const articulated = satisfies.length > 0;
  const carriesGe = course.calgetc.length > 0 || course.igetc.length > 0;
  const geLine = carriesGe
    ? ` It also carries general-education credit: Cal-GETC ${course.calgetc.join(', ') || '—'}; IGETC ${course.igetc.join(', ') || '—'}.`
    : ' It carries no transfer general-education area at El Camino.';

  // The "no" answer is the one a student is most likely to act on, so it is
  // spelled out in three beats: it does not articulate here; what it still
  // does carry; and where it does count. Silence on any of the three reads as
  // "this course is worthless", which is almost never true.
  const noGeLine = carriesGe
    ? `It still carries transfer general-education credit: Cal-GETC ${course.calgetc.join(', ') || '—'}; IGETC ${course.igetc.join(', ') || '—'}.`
    : 'It carries no transfer general-education area at El Camino either, so it would transfer as elective credit only.';
  const elsewhereLine = alsoAcceptedAt.length > 0
    ? `It does count toward this major at ${alsoAcceptedAt.map((a) => a.campusName).join(', ')}${notAcceptedAt.length > 0 ? `, and does not at ${notAcceptedAt.map((a) => a.campusName).join(', ')}` : ''}.`
    : 'No other campus this build covers accepts it for this major either.';

  const summary = articulated
    ? `${course.code} (${course.name}, ${course.units} units) satisfies ${satisfies.length === 1 ? 'one' : satisfies.length} lower-division requirement${satisfies.length === 1 ? '' : 's'} for ${major.name} at ${campus.name}: ${satisfies.map((s) => s.label).join('; ')}. Source: the ${set.meta.catalogYear} ASSIST agreement.${geLine}`
    : `${course.code} does not articulate to any lower-division requirement for ${major.name} at ${campus.name} in the ${set.meta.catalogYear} agreement. ${noGeLine} ${elsewhereLine}`;

  const caveats = caveatsFor(set, campus.name);
  if (hit.viaFormerCode) {
    caveats.push(`You asked about ${hit.viaFormerCode}; El Camino now numbers that course ${course.code}. It is the same course.`);
  }
  if (!articulated && course.calgetc.length + course.igetc.length > 0) {
    caveats.push('Not counting for the major is not the same as not transferring: this course still carries general-education and elective credit.');
  }

  return {
    summary,
    data: {
      course: {
        code: course.code,
        name: course.name,
        units: course.units,
        ...(course.formerCode ? { formerCode: course.formerCode } : {}),
      },
      campus: campus.id,
      campusName: campus.name,
      major: major.id,
      majorName: major.name,
      satisfies,
      geAreas,
      articulated,
      alsoAcceptedAt,
      notAcceptedAt,
    },
    citations: [agreementCitation(set), catalogCitation],
    caveats,
  };
};

// ── audit_coursework ─────────────────────────────────────────────────────────

const audit_coursework = (
  input: { courses?: string[]; inProgress?: string[]; campus?: string; major?: string; entryTerm?: string },
  ctx: ToolContext,
): ToolOutput | ToolError => {
  const target = resolveTarget(ctx, input);
  if (isErr(target)) return target;
  const { campus, major, set } = target;

  const work = courseworkFrom(ctx, input);
  if (isErr(work)) return work;

  const profile = profileFromState(ctx.state, {
    campus: campus.id,
    major: major.id,
    entryTerm: input.entryTerm ?? ctx.state.target.entryTerm,
    completed: work.completed,
    inProgress: work.inProgress,
  });
  const audit = auditFor(profile);
  if (!audit?.transfer) {
    return toolError(
      'no_agreement',
      `This build holds no El Camino → ${campus.name} agreement for ${major.name}.`,
      'Call list_options to see which campus/major pairs are covered.',
    );
  }
  const t = audit.transfer;

  const data = {
    campus: campus.id,
    campusName: campus.name,
    major: major.id,
    majorName: major.name,
    gePattern: t.gePatternName,
    verdict: t.verdict,
    impacted: t.impacted,
    gpaTarget: t.gpaTarget,
    units: { done: t.unitsDone, inProgress: t.unitsInProgress, floor: t.unitsFloor },
    prep: {
      done: t.prepDone,
      inProgress: t.prepInProgress,
      missing: t.prepMissing,
      requiredTotal: t.requiredCount,
    },
    rows: t.majorPrep.map(rowShape),
    ge: t.ge.map(areaShape),
    needsReview: audit.needsReview,
    estimate: audit.estimate
      ? { terms: audit.estimate.terms, finishTerm: audit.estimate.finishTerm, durationLabel: audit.estimate.durationLabel }
      : null,
    dataVersion: audit.dataVersion,
  };

  const geOpen = t.ge.filter((a) => a.status !== 'done').length;
  const nothingGiven = work.completed.length === 0 && work.inProgress.length === 0;
  const summary = nothingGiven
    ? `No coursework is recorded for this student, so there is nothing to audit yet. ${major.name} at ${campus.name} asks for ${t.requiredCount} required lower-division preparation slot${t.requiredCount === 1 ? '' : 's'} and lists a ${t.gpaTarget.toFixed(1)} GPA target${t.impacted ? ', and the major is selective there' : ''}. The engine reads this as ${t.verdict}, which reflects an empty record rather than anything about the student.`
    : `Against ${major.name} at ${campus.name}, ${t.prepDone} of ${t.requiredCount} required lower-division preparation slots are complete, ${t.prepInProgress} in progress and ${t.prepMissing} still missing. ` +
      `Transferable units: ${t.unitsDone} done plus ${t.unitsInProgress} in progress, against a ${t.unitsFloor}-unit floor. ` +
      `${geOpen === 0 ? `${t.gePatternName} general education is complete.` : `${geOpen} ${t.gePatternName} area${geOpen === 1 ? ' is' : 's are'} still open.`} ` +
      `The engine's verdict is ${t.verdict}, against a ${t.gpaTarget.toFixed(1)} GPA target.`;

  const caveats = [...caveatsFor(set, campus.name), ...renameCaveats(work.renamed), ...work.notes, ...audit.warnings];
  if (audit.needsReview.length > 0) {
    caveats.push(`${audit.needsReview.length} requirement${audit.needsReview.length === 1 ? '' : 's'} could not be verified from our catalog snapshot — those are gaps in our data, not rulings about the student, and each carries a question for a counselor.`);
  }

  return { summary, data, citations: [agreementCitation(set), catalogCitation], caveats };
};

// ── compare_campuses ─────────────────────────────────────────────────────────

const VERDICT_RANK: Record<string, number> = { eligible: 0, competitive: 1, reach: 2 };

// A campus row lists at most this many elective-only courses by name.
const ELECTIVE_LIST_MAX = 8;

function electiveCoursesFor(audit: AuditResult): string[] {
  const elective = (audit.carryOver?.items ?? []).filter((i) => i.kind === 'elective').map((i) => i.code);
  if (elective.length <= ELECTIVE_LIST_MAX) return elective;
  return [...elective.slice(0, ELECTIVE_LIST_MAX), `+${elective.length - ELECTIVE_LIST_MAX} more`];
}

const compare_campuses = (
  input: { courses?: string[]; inProgress?: string[]; major?: string; campuses?: string[]; entryTerm?: string },
  ctx: ToolContext,
): ToolOutput | ToolError => {
  const major = resolveMajorArg(input.major, ctx.state.target.major);
  if (isErr(major)) return major;

  const work = courseworkFrom(ctx, input);
  if (isErr(work)) return work;

  // Which campuses. An explicit list is resolved name by name so a typo is an
  // error rather than a quietly shorter comparison; omitted means every campus
  // this build holds an agreement for in this major.
  let campuses: SchoolMeta[];
  if (input.campuses && input.campuses.length > 0) {
    const resolved: SchoolMeta[] = [];
    for (const raw of input.campuses) {
      const hit = resolveCampusArg(raw, '');
      if (isErr(hit)) return hit;
      resolved.push(hit);
    }
    campuses = resolved.filter((s) => getRequirements(s.id, major.id, COLLEGE_ID) != null);
    if (campuses.length === 0) {
      return toolError(
        'no_agreement',
        `This build holds no agreement for ${major.name} at ${resolved.map((s) => s.name).join(', ')}.`,
        'Omit `campuses` to compare every campus covered for this major.',
      );
    }
  } else {
    campuses = campusesWithData(major.id);
  }

  const entryTerm = input.entryTerm ?? ctx.state.target.entryTerm;
  const audits = campuses.map((campus) => {
    const set = getRequirements(campus.id, major.id, COLLEGE_ID)!;
    const profile = profileFromState(ctx.state, {
      campus: campus.id,
      major: major.id,
      entryTerm,
      completed: work.completed,
      inProgress: work.inProgress,
    });
    return { campus, set, audit: auditFor(profile) };
  }).filter((x): x is { campus: SchoolMeta; set: RequirementSet; audit: AuditResult } => x.audit?.transfer != null);

  // The student's own campus, when they have one, is the baseline the
  // plan-length delta is measured against — exactly as the main product's
  // switch matrix does it.
  const currentCampus = ctx.state.target.campus;
  const baselineTerms = audits.find((a) => a.campus.id === currentCampus)?.audit.estimate?.terms ?? null;

  const rows = audits.map(({ campus, set, audit }) => {
    const candidate: SwitchCandidate = {
      major: major.id,
      majorName: major.name,
      school: campus.id,
      schoolName: campus.name,
      audit,
      provenance: set.meta.verification,
    };
    const s = summarizeSwitch(candidate, baselineTerms, { major: major.id, school: currentCampus })!;
    const carry = audit.carryOver;
    return {
      campus: campus.id,
      campusName: campus.name,
      system: campus.system,
      verdict: s.verdict,
      impacted: s.impacted,
      gpaTarget: s.gpaTarget,
      prepDone: s.prepDone,
      prepTotal: s.prepTotal,
      coverage: s.coverage,
      unitsApplied: carry?.unitsApplied ?? 0,
      unitsElective: carry?.unitsElective ?? 0,
      creditsThatCount: s.creditsThatCount,
      electivesOnly: s.electivesOnly,
      // WHICH courses only transfer as electives here — the itemisation of
      // electivesOnly, straight off the audit's own carry-over. Capped at
      // ELECTIVE_LIST_MAX with a "+n more" marker so seventeen campuses of
      // these cannot push the agent payload past its size cap; the count above
      // stays whole either way.
      electiveCourses: electiveCoursesFor(audit),
      estTerms: s.estTerms,
      provenance: s.provenance,
      sourceUrl: set.meta.sourceUrl,
      catalogYear: set.meta.catalogYear,
    };
  });

  rows.sort((a, b) => {
    const cov = (r: typeof a) => r.coverage ?? 1;
    if (cov(a) !== cov(b)) return cov(b) - cov(a);
    if (VERDICT_RANK[a.verdict] !== VERDICT_RANK[b.verdict]) return VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict];
    return a.campusName.localeCompare(b.campusName);
  });

  const best = rows[0];
  const worst = rows[rows.length - 1];
  const nothingGiven = work.completed.length === 0 && work.inProgress.length === 0;
  const summary = nothingGiven
    ? `No coursework is recorded, so every one of the ${rows.length} campuses covered for ${major.name} shows 0 preparation slots complete. The table still shows what each campus asks for — required slots, GPA target and whether the major is selective there.`
    : `Across ${rows.length} campuses covered for ${major.name}, this coursework goes furthest at ${best.campusName} (${best.prepDone} of ${best.prepTotal} required preparation slots, verdict ${best.verdict}) and least far at ${worst.campusName} (${worst.prepDone} of ${worst.prepTotal}, verdict ${worst.verdict}). ` +
      `${best.creditsThatCount} of the student's courses count toward the major or general education at ${best.campusName}; ${best.electivesOnly} transfer as electives there. Each row cites the agreement it rests on.`;

  const unreviewed = rows.filter((r) => r.provenance === 'unreviewed').length;
  const caveats: string[] = [...renameCaveats(work.renamed), ...work.notes];
  if (unreviewed > 0) {
    caveats.push(`${unreviewed} of these ${rows.length} agreements were machine-transcribed from ASSIST and have not been read row-by-row by a person; each row carries its own provenance.`);
  }
  caveats.push('Coverage compares lower-division preparation only. It is not a ranking of campuses, and it does not describe how competitive admission is at any of them.');
  if (rows.some((r) => r.impacted)) {
    caveats.push('Some of these majors are selective at their campus — meeting every published requirement does not by itself decide admission.');
  }

  return {
    summary,
    data: { major: major.id, majorName: major.name, courses: work.completed, inProgress: work.inProgress, rows, sortedBy: 'coverage desc' },
    citations: audits.map(({ set }) => agreementCitation(set)),
    caveats,
  };
};

// ── requirement matching ─────────────────────────────────────────────────────
//
// An agent asks the way a student talks: "physics", "the calculus one",
// "PHYS 1A", "MATH 31A", or a row id copied out of an audit. A row is written
// the way ASSIST prints it — "Introduction to Newtonian Mechanics (PHY 1510)
// [series PHY 1510+PHY 1510L]" — with the RECEIVING campus's own subject code
// in the parentheses and El Camino's codes only in `options`. Matching on the
// label text alone missed all of that: "physics" found nothing at Cal Poly
// Pomona, whose physics row says PHY.
//
// So a row is searched on four surfaces, all word-anchored and
// case-insensitive: its label (and its group heading), the receiving codes in
// its parentheses, its row id, and the El Camino option codes — which is what
// makes `explain_requirement {requirement: 'PHYS 1A'}` list every row PHYS 1A
// satisfies.

// Campuses name the same subject differently, and a student should not have to
// know which spelling their campus uses. Each row here is one subject, all its
// spellings; a needle in a family matches every alias in it.
const SUBJECT_FAMILIES: string[][] = [
  ['phy', 'phys', 'physics'],
  ['math', 'mat'],
  ['cs', 'csci', 'com sci', 'compsci', 'cpsc', 'cecs'],
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

function familyOf(subject: string): string[] {
  return SUBJECT_FAMILIES.find((f) => f.includes(subject)) ?? [subject];
}

// Course-code-shaped tokens inside a string: "phy 1510", "com sci 31",
// "mat 1140". Returns [subject, wholeCode] pairs.
function codesIn(normalized: string): { subject: string; code: string }[] {
  const out: { subject: string; code: string }[] = [];
  const re = /([a-z]+(?:\s[a-z]+)?)\s(\d+[a-z]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) out.push({ subject: m[1], code: `${m[1]} ${m[2]}` });
  return out;
}

// The needle, plus the same needle written with every alias of its subject.
// "physics" → phy / phys / physics; "phys 1a" → phy 1a / phys 1a / physics 1a.
function needleVariants(needle: string): string[] {
  const out = new Set<string>([needle]);
  const m = needle.match(/^([a-z]+(?:\s[a-z]+)?)(?:\s(\d+[a-z]*))?$/);
  if (m) for (const alias of familyOf(m[1])) out.add(m[2] ? `${alias} ${m[2]}` : alias);
  return [...out];
}

export function requirementMatches(row: MajorPrepReq, needleRaw: string): boolean {
  const needle = norm(needleRaw);
  if (!needle) return false;
  if (norm(row.id) === needle) return true;

  const label = norm(row.label);
  const groupLabel = row.group ? norm(row.group.label) : '';
  // Receiving codes as ASSIST prints them — inside the parentheses and the
  // "[series …]" brackets that follow some rows.
  const receiving = [...row.label.matchAll(/[([]([^)\]]*)[)\]]/g)].map((m) => norm(m[1]));
  const options = row.options.map(norm);
  const phrases = [label, groupLabel, ...receiving, ...options].filter(Boolean);
  const subjects = new Set(
    [...receiving, ...options].flatMap((s) => codesIn(s).map((c) => c.subject)),
  );

  for (const variant of needleVariants(needle)) {
    for (const phrase of phrases) {
      if (` ${phrase} `.includes(` ${variant} `)) return true;
    }
    // A bare subject ("physics", "com sci") matches any code in that subject,
    // whichever spelling the campus prints.
    if (!/\d/.test(variant) && subjects.has(variant)) return true;
  }
  return false;
}

// Rows that share a group member describe ONE alternative split across several
// normalized rows ("option 1 of 2, part 2 of 2"). Returning all of them repeats
// the same requirement at the agent; the first row of each member carries it.
function dedupeGroupMembers(rows: MajorPrepReq[]): MajorPrepReq[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (!r.group) return true;
    const key = `${r.group.id}|${r.group.memberId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── explain_requirement ──────────────────────────────────────────────────────

const explain_requirement = (
  input: { requirement?: string; campus?: string; major?: string },
  ctx: ToolContext,
): ToolOutput | ToolError => {
  const needle = (input.requirement ?? '').trim();
  if (!needle) {
    return toolError(
      'missing_requirement',
      'No requirement given.',
      'Pass a receiving course code ("MATH 31A"), a word from the label ("statistics"), or a row id from an audit.',
    );
  }
  const target = resolveTarget(ctx, input);
  if (isErr(target)) return target;
  const { campus, major, set } = target;

  // Every row that matches, on any of the four surfaces (see requirementMatches
  // above), with rows of one select-group member collapsed to the first.
  const matches = dedupeGroupMembers(set.majorPrep.filter((r) => requirementMatches(r, needle)));

  if (matches.length === 0) {
    const candidates = dedupeGroupMembers(set.majorPrep).slice(0, 12).map((r) => r.label);
    return toolError(
      'requirement_not_found',
      `No requirement matching "${needle}" in the ${set.meta.catalogYear} agreement for ${major.name} at ${campus.name}.`,
      `Rows in this agreement include: ${candidates.join(' · ')}. Call audit_coursework for the full list with row ids.`,
    );
  }

  const shaped = matches.map((r) => ({
    rowId: r.id,
    label: r.label,
    required: r.required,
    ...(r.group ? { group: { id: r.group.id, label: r.group.label, count: r.group.count } } : {}),
    options: r.options.map((code) => {
      const c = CATALOG.find((x) => x.code === code);
      return {
        code,
        name: c?.name ?? null,
        units: c?.units ?? null,
        // A row may name a course our catalog snapshot does not carry. Saying
        // so is the honest answer; the audit reports such a row as unknown
        // rather than as something the student is missing.
        inCatalog: c != null,
        calgetc: c?.calgetc ?? [],
        igetc: c?.igetc ?? [],
      };
    }),
  }));

  const first = shaped[0];
  const inCatalog = first.options.filter((o) => o.inCatalog);
  const summary =
    `At ${campus.name}, "${first.label}" is ${first.required ? 'required' : 'listed as recommended'} for ${major.name}` +
    `${first.group ? ` and belongs to a group where ${first.group.count} of the listed options must be completed` : ''}. ` +
    (inCatalog.length > 0
      ? `El Camino courses that satisfy it: ${inCatalog.map((o) => `${o.code} (${o.name}, ${o.units} units)`).join('; ')}. `
      : 'No El Camino course in our catalog snapshot satisfies it. ') +
    `From the ${set.meta.catalogYear} ASSIST agreement.` +
    (matches.length > 1 ? ` ${matches.length - 1} other row${matches.length === 2 ? '' : 's'} also matched "${needle}".` : '');

  const caveats = caveatsFor(set, campus.name);
  const outside = shaped.flatMap((r) => r.options.filter((o) => !o.inCatalog).map((o) => o.code));
  if (outside.length > 0) {
    caveats.push(`${outside.length} option${outside.length === 1 ? '' : 's'} on these rows (${outside.slice(0, 6).join(', ')}${outside.length > 6 ? ', …' : ''}) are not in our El Camino catalog snapshot, so we cannot describe them — a gap in our data, not a ruling about the student.`);
  }

  return {
    summary,
    data: { campus: campus.id, campusName: campus.name, major: major.id, majorName: major.name, matches: shaped },
    citations: [agreementCitation(set), catalogCitation],
    caveats,
  };
};

export const TRANSFER_IMPLS: ToolImplMap = {
  list_options,
  check_course_transfer,
  audit_coursework,
  compare_campuses,
  explain_requirement,
};
