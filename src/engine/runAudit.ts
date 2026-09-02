import type { StudentProfile, RequirementSet, AssociateDegree, AdtTemplate, Course, GeArea, GePattern, AuditResult, AuditedReq, AuditedArea, TransferAudit, DegreeAudit, MajorPrepReq, CourseCode, CarryOver, CarryOverItem, MajorChoice } from '../types';
import { buildTermPlan, UNIT_CAP, planUsesIntersessions, type PlanTargets } from './buildTermPlan';
import { canonicalCodes, hasRenumberedCourses } from './courseCodes';
import { buildUpperDivPlan } from './buildUpperDivPlan';
import { advanceTerm, termSpanMonths, durationLabel } from './terms';
import { majorDifficulty, prereqChains } from './insights';
import type {
  UpperDivRequirementSet, TimeEstimate, ReviewItem, SourceCitation, DataProvenance,
} from '../types';

export interface AuditInputs {
  requirementSet: RequirementSet | null;   // transfer reqs (school|major)
  associateDegree: AssociateDegree | null;  // college AA/AS (major)
  // Official AA-T/AS-T template (college, major). Optional: when present with a
  // non-empty `core` it drives the ADT degree audit; when absent or empty the
  // engine falls back to the articulation-prep approximation (documented below).
  adtTemplate?: AdtTemplate | null;
  upperDivSet: UpperDivRequirementSet | null; // destination upper-division
  collegeName: string;                     // the student's community college
  schoolName: string;
  schoolSystem: 'UC' | 'CSU';
  catalog: Course[];
  gePattern: GePattern;                    // the transfer GE pattern this STUDENT follows
                                           // (Cal-GETC or IGETC — resolved by entry term)
  eccgeAreas: GeArea[];
  examCourses: CourseCode[];               // course-equivalents cleared by AP/IB/CLEP exams
  dataVersion: string;                     // snapshot id stamped onto the result (A1/F3)
}

const TRANSFER_UNIT_FLOOR = 60; // UC/CSU minimum transferable units

// Areas of a pattern that bind for a given target system (e.g. IGETC 1C is
// CSU-only). Audit, plan, and UI must all see the same filtered list.
export function areasForSystem(pattern: GePattern, system: 'UC' | 'CSU'): GeArea[] {
  return pattern.areas.filter((a) => !a.appliesTo || a.appliesTo === system);
}

// Per-course tag field for a GE area list ('igetc' | 'calgetc' | 'eccge').
type GeField = GePattern['id'] | 'eccge';

// --- helpers ---
//
// Group-aware requirement audit with course CONSUMPTION:
//  · One completed course satisfies at most ONE requirement — a row for plain
//    rows, a member for select-N groups. This is what lets duplicated rows
//    ("two additional courses") and no-double-counting rules (UCR Psych: the
//    course used for the math requirement can't also fill the additional area)
//    audit truthfully.
//  · Rows sharing group.id form a select-N group. Each ASSIST receiving course
//    (group.memberId) is one selectable member; a member may span several
//    normalized rows (AND splits / CNF rows). One course MAY cover several rows
//    of the SAME member — those rows encode one underlying alternative — and a
//    member is complete only when all of its rows are covered.
//  · A group consumes courses only for the first `count` completed members (in
//    row order). Further completed members still display as done, but their
//    courses remain available to later requirements — completing extra group
//    members must never hide progress elsewhere.
//  · Assignment is greedy in row order. With the shipped option sets greedy
//    never over-counts; in pathological overlaps it can under-count, which is
//    the safe direction (we never claim more progress than is real).
function auditReqs(
  reqs: MajorPrepReq[],
  completed: Set<CourseCode>,
  inProgress: Set<CourseCode>,
  catalogCodes: Set<CourseCode>
): AuditedReq[] {
  const usedDone = new Set<CourseCode>();
  const usedInProg = new Set<CourseCode>();
  const out: (AuditedReq | null)[] = reqs.map(() => null);

  // Group layout in encounter order: group id → members → row indices.
  const groups = new Map<string, { count: number; members: Map<string, number[]>; doneCounted: number; ipCounted: number }>();
  reqs.forEach((r, i) => {
    if (!r.group) return;
    let g = groups.get(r.group.id);
    if (!g) {
      g = { count: r.group.count, members: new Map(), doneCounted: 0, ipCounted: 0 };
      groups.set(r.group.id, g);
    }
    const rows = g.members.get(r.group.memberId) ?? [];
    if (rows.length === 0) g.members.set(r.group.memberId, rows);
    rows.push(i);
  });

  const auditPlainRow = (req: MajorPrepReq): AuditedReq => {
    const satisfiedBy = req.options.find((c) => completed.has(c) && !usedDone.has(c));
    if (satisfiedBy) {
      usedDone.add(satisfiedBy);
      return { ...req, status: 'done', satisfiedBy };
    }
    const inProgressBy = req.options.find((c) => inProgress.has(c) && !usedInProg.has(c));
    if (inProgressBy) {
      usedInProg.add(inProgressBy);
      return { ...req, status: 'in-progress', inProgressBy };
    }
    // Data gap: none of the satisfying options exist in the catalog snapshot.
    // "Missing" would be a confident claim about the student; this is a hole in
    // OUR data — surface it as unknown and let the escalation card handle it (B2).
    if (!req.options.some((c) => catalogCodes.has(c))) return { ...req, status: 'unknown' };
    return { ...req, status: 'missing' };
  };

  const processedGroups = new Set<string>();
  reqs.forEach((req, i) => {
    if (out[i]) return;
    if (!req.group) {
      out[i] = auditPlainRow(req);
      return;
    }
    if (processedGroups.has(req.group.id)) return; // rows filled with their group
    processedGroups.add(req.group.id);
    const g = groups.get(req.group.id)!;

    for (const rowIdxs of g.members.values()) {
      // Done coverage: every row of the member covered by completed courses;
      // a course already picked for this member covers further rows for free.
      const cover = (pool: (c: CourseCode) => boolean, used: Set<CourseCode>) => {
        const picked = new Set<CourseCode>();
        const perRow = new Map<number, CourseCode>();
        for (const ri of rowIdxs) {
          const r = reqs[ri];
          const pick =
            r.options.find((c) => picked.has(c)) ??
            r.options.find((c) => pool(c) && !used.has(c) && !picked.has(c));
          if (!pick) return null;
          picked.add(pick);
          perRow.set(ri, pick);
        }
        return { picked, perRow };
      };

      const doneCover = cover((c) => completed.has(c), usedDone);
      if (doneCover) {
        // Consume only while the member counts toward the group's quota.
        if (g.doneCounted < g.count) {
          doneCover.picked.forEach((c) => usedDone.add(c));
          g.doneCounted++;
        }
        for (const ri of rowIdxs) {
          out[ri] = { ...reqs[ri], status: 'done', satisfiedBy: doneCover.perRow.get(ri) };
        }
        continue;
      }

      // In-progress coverage: completed ∪ in-progress courses may cover the
      // member (mixed coverage reads as in-progress — never as done).
      const ipCover = cover((c) => completed.has(c) || inProgress.has(c), usedInProg);
      if (ipCover) {
        if (g.doneCounted + g.ipCounted < g.count) {
          ipCover.picked.forEach((c) => { if (inProgress.has(c)) usedInProg.add(c); });
          g.ipCounted++;
        }
        for (const ri of rowIdxs) {
          const c = ipCover.perRow.get(ri);
          out[ri] = { ...reqs[ri], status: 'in-progress', ...(c && inProgress.has(c) ? { inProgressBy: c } : c ? { satisfiedBy: c } : {}) };
        }
        continue;
      }

      // Not coverable: unknown when any row of the member is a catalog data
      // gap (B2 — never coerce our gap into the student's gap), else missing.
      const dataGap = rowIdxs.some((ri) => !reqs[ri].options.some((c) => catalogCodes.has(c)));
      for (const ri of rowIdxs) {
        out[ri] = { ...reqs[ri], status: dataGap ? 'unknown' : 'missing' };
      }
    }
  });

  return out as AuditedReq[];
}

// Group-aware rollup over an audited requirement list. Select-N groups count
// as `count` required units; a group's extra completed members never inflate
// the done number. `unknown` counts toward neither done nor missing (B2).
export interface ReqSummary {
  requiredTotal: number;
  requiredDone: number;
  requiredInProgress: number;
  requiredMissing: number;
  allRequiredDone: boolean;
  anyRequiredMissing: boolean;
}

export function summarizeReqs(audited: AuditedReq[]): ReqSummary {
  let total = 0, done = 0, inProg = 0, missing = 0;
  const groupRows = new Map<string, AuditedReq[]>();
  for (const r of audited) {
    if (r.group) {
      if (!r.required) continue; // recommended groups never gate the verdict
      const rows = groupRows.get(r.group.id) ?? [];
      if (rows.length === 0) groupRows.set(r.group.id, rows);
      rows.push(r);
      continue;
    }
    if (!r.required) continue;
    total++;
    if (r.status === 'done') done++;
    else if (r.status === 'in-progress') inProg++;
    else if (r.status === 'missing') missing++;
  }
  for (const rows of groupRows.values()) {
    const count = rows[0].group!.count;
    // A member may span SEVERAL rows — "complete one full option" bundles a
    // whole course series into one alternative (UC Davis Chemistry: CHE 004A +
    // 004B + 004C as one option against the CHE 002 series as the other). Such
    // a member is done only when EVERY one of its rows is done.
    //
    // This read "first row wins", which marked the whole option complete as
    // soon as its first course was, and told a student they had finished a
    // three-course series after one class.
    const memberRows = new Map<string, AuditedReq['status'][]>();
    for (const r of rows) {
      const list = memberRows.get(r.group!.memberId) ?? [];
      if (list.length === 0) memberRows.set(r.group!.memberId, list);
      list.push(r.status);
    }
    const memberStatus = new Map<string, AuditedReq['status']>();
    for (const [id, statuses] of memberRows) {
      if (statuses.every((s) => s === 'done')) memberStatus.set(id, 'done');
      // Part-way through an option is genuine progress, and an unknown row
      // cannot be called missing — both read as in-progress rather than done.
      else if (statuses.some((s) => s === 'done' || s === 'in-progress')) memberStatus.set(id, 'in-progress');
      else if (statuses.every((s) => s === 'unknown')) memberStatus.set(id, 'unknown');
      else memberStatus.set(id, 'missing');
    }
    const st = [...memberStatus.values()];
    const mDone = st.filter((s) => s === 'done').length;
    const mIp = st.filter((s) => s === 'in-progress').length;
    const mUnknown = st.filter((s) => s === 'unknown').length;
    total += count;
    done += Math.min(mDone, count);
    inProg += Math.min(mIp, Math.max(0, count - mDone));
    missing += Math.max(0, count - mDone - mIp - mUnknown);
  }
  return {
    requiredTotal: total,
    requiredDone: done,
    requiredInProgress: inProg,
    requiredMissing: missing,
    allRequiredDone: total > 0 && done >= total,
    anyRequiredMissing: missing > 0,
  };
}

// The rows that are REAL outstanding gaps — what "you're missing N" copy and
// gap lists may show. Plain required-missing rows, plus group member rows only
// when their group is still short of `count` (members of a satisfied group are
// alternatives the student didn't need, not gaps). Grouped gaps are deduped to
// one row per member.
export function requiredGaps(audited: AuditedReq[]): AuditedReq[] {
  const out: AuditedReq[] = [];
  const groupDone = new Map<string, boolean>();
  const seenMember = new Set<string>();
  for (const r of audited) {
    if (!r.group || !r.required) continue;
    if (!groupDone.has(r.group.id)) {
      const rows = audited.filter((x) => x.group?.id === r.group!.id && x.required);
      // Same rule as the tally above: a member spanning several rows counts as
      // done only when all of them are.
      const members = new Map<string, boolean>();
      for (const x of rows) {
        const id = x.group!.memberId;
        members.set(id, (members.get(id) ?? true) && x.status === 'done');
      }
      const mDone = [...members.values()].filter(Boolean).length;
      groupDone.set(r.group.id, mDone >= r.group.count);
    }
  }
  for (const r of audited) {
    if (!r.required || r.status !== 'missing') continue;
    if (!r.group) { out.push(r); continue; }
    if (groupDone.get(r.group.id)) continue;
    const memberKey = `${r.group.id}|${r.group.memberId}`;
    if (seenMember.has(memberKey)) continue;
    seenMember.add(memberKey);
    out.push(r);
  }
  return out;
}

export function auditGe(
  areas: GeArea[],
  field: GeField,
  catalog: Course[],
  completed: Set<CourseCode>,
  inProgress: Set<CourseCode>,
  frenchBac: boolean
): AuditedArea[] {
  return areas.map((area) => {
    const need = area.count ?? 1;
    const minDepts = area.minDistinctDepts ?? 1;

    // IGETC-only: Area 6 is Languages Other Than English. (Cal-GETC has no
    // language area — its Area 6 is Ethnic Studies — so this never fires there.)
    if (field === 'igetc' && area.id === '6' && frenchBac) {
      // Foreign credential: it CAN satisfy Area 6, but only a counselor or
      // evaluator can verify this student's — never silently mark it done (B2).
      return { ...area, status: 'unknown', satisfiedBy: 'French Baccalauréat', have: 0, need, minDepts, courses: [] };
    }

    const completedHits = catalog.filter((c) => completed.has(c.code) && c[field].includes(area.id));
    const inProgressHits = catalog.filter((c) => inProgress.has(c.code) && c[field].includes(area.id));

    const have = completedHits.length;
    const distinctDepts = new Set(completedHits.map((c) => c.dept)).size;
    const courses = completedHits.map((c) => c.code);
    const satisfiedBy = completedHits[0]?.code ?? inProgressHits[0]?.code ?? null;

    if (have >= need && distinctDepts >= minDepts) {
      return { ...area, status: 'done', satisfiedBy, have, need, minDepts, courses };
    }
    if (have > 0 || inProgressHits.length > 0) {
      return { ...area, status: 'in-progress', satisfiedBy, have, need, minDepts, courses };
    }
    return { ...area, status: 'missing', satisfiedBy: null, have: 0, need, minDepts, courses: [] };
  });
}

function unitsFor(codes: CourseCode[], catalog: Course[]): number {
  return codes.reduce((sum, code) => sum + (catalog.find((c) => c.code === code)?.units ?? 0), 0);
}

// Classify each already-taken course by how it counts toward the *target* major.
// This is the heart of the "if I switch majors, what still counts?" answer.
function computeCarryOver(
  profile: StudentProfile,
  prepReqs: MajorPrepReq[],
  geAreas: GeArea[],
  field: GeField,
  geLabel: string,
  catalog: Course[],
  major: MajorChoice
): CarryOver | null {
  const taken = [
    ...profile.completed.map((code) => ({ code, inProgress: false })),
    ...profile.inProgress.map((code) => ({ code, inProgress: true })),
  ];
  if (taken.length === 0) return null;

  const items: CarryOverItem[] = [];

  for (const { code, inProgress } of taken) {
    const course = catalog.find((c) => c.code === code);
    if (!course) continue;

    const req = prepReqs.find((r) => r.options.includes(code));
    if (req) {
      items.push({ code, name: course.name, units: course.units, kind: 'major', detail: `Major prep · ${req.label}`, inProgress });
      continue;
    }
    const area = geAreas.find((a) => course[field].includes(a.id));
    if (area) {
      items.push({ code, name: course.name, units: course.units, kind: 'ge', detail: `${geLabel} Area ${area.id} · ${area.label}`, inProgress });
      continue;
    }
    items.push({ code, name: course.name, units: course.units, kind: 'elective', detail: 'Transfers as elective', inProgress });
  }

  const of = (k: CarryOverItem['kind']) => items.filter((i) => i.kind === k);
  const sum = (arr: CarryOverItem[]) => arr.reduce((s, i) => s + i.units, 0);
  return {
    major,
    items,
    countsTowardMajor: of('major').length,
    countsTowardGe: of('ge').length,
    electiveOnly: of('elective').length,
    unitsApplied: sum(items.filter((i) => i.kind !== 'elective')),
    unitsElective: sum(of('elective')),
    totalCourses: items.length,
  };
}

// Rewrite every community-college course code reaching the audit into the
// number the college publishes today (see src/engine/courseCodes.ts).
//
// Deliberately NOT normalized:
//  · `upperDivSet` — those are the DESTINATION campus's courses. UCLA's
//    numbering has nothing to do with El Camino's, and a coincidental collision
//    ("HIST 101" exists at both) would rewrite a university course to a
//    community-college one.
//  · GE area ids — an area is not a course.
//
// When no course in the catalog has been renumbered this is a no-op that
// returns the originals untouched, so colleges the crosswalk doesn't cover pay
// nothing and behave exactly as before.
function withCanonicalCodes(
  profile: StudentProfile,
  inputs: AuditInputs,
): { profile: StudentProfile; inputs: AuditInputs } {
  const { catalog } = inputs;
  if (!hasRenumberedCourses(catalog)) return { profile, inputs };

  const many = (codes: readonly CourseCode[]) => canonicalCodes(catalog, codes);
  const reqs = (rows: MajorPrepReq[]): MajorPrepReq[] =>
    rows.map((r) => ({ ...r, options: many(r.options) }));

  return {
    profile: {
      ...profile,
      completed: many(profile.completed),
      inProgress: many(profile.inProgress),
      ...(profile.gePlan ? { gePlan: many(profile.gePlan) } : {}),
      ...(profile.avoidCourses ? { avoidCourses: many(profile.avoidCourses) } : {}),
    },
    inputs: {
      ...inputs,
      examCourses: many(inputs.examCourses),
      requirementSet: inputs.requirementSet
        ? { ...inputs.requirementSet, majorPrep: reqs(inputs.requirementSet.majorPrep) }
        : null,
      associateDegree: inputs.associateDegree
        ? { ...inputs.associateDegree, majorCore: reqs(inputs.associateDegree.majorCore) }
        : null,
      adtTemplate: inputs.adtTemplate
        ? { ...inputs.adtTemplate, core: reqs(inputs.adtTemplate.core) }
        : inputs.adtTemplate,
    },
  };
}

// Academic-year start for a source label ("2025–26" / "2025-2026") or an
// effective term ("Fall 2026"). A transition notice is evidence comparison,
// not a clock-based stale-data guess: the same stored audit remains
// reproducible tomorrow.
function sourceAcademicYearStart(label: string): number | null {
  const match = label.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function termAcademicYearStart(term: string): number | null {
  const match = term.match(/\b(Fall|Winter|Spring|Summer)\s+(20\d{2})\b/i);
  if (!match) return null;
  const year = Number(match[2]);
  return /^fall$/i.test(match[1]) ? year : year - 1;
}

function renumberingNotice(
  catalog: Course[],
  requirementSet: RequirementSet,
): SourceCitation['renumberingNotice'] {
  const sourceYear = sourceAcademicYearStart(requirementSet.meta.catalogYear);
  if (sourceYear === null) return undefined;

  const requiredCodes = new Set(requirementSet.majorPrep.flatMap((row) => row.options));
  const affected = catalog
    .filter((course) => {
      if (!course.formerCode || !course.formerCodeEffectiveTerm || !requiredCodes.has(course.code)) return false;
      const effectiveYear = termAcademicYearStart(course.formerCodeEffectiveTerm);
      return effectiveYear !== null && sourceYear < effectiveYear;
    })
    .map((course) => ({ code: course.code, formerCode: course.formerCode! }));

  if (affected.length === 0) return undefined;
  const effectiveTerms = new Set(
    catalog
      .filter((course) => affected.some((item) => item.code === course.code))
      .map((course) => course.formerCodeEffectiveTerm!),
  );
  const targetYears = new Set(
    [...effectiveTerms]
      .map(termAcademicYearStart)
      .filter((year): year is number => year !== null),
  );
  const targetCatalogYear = [...targetYears]
    .map((year) => `${year}–${String((year + 1) % 100).padStart(2, '0')}`)
    .join(' / ');
  return {
    effectiveTerm: [...effectiveTerms].join(' / '),
    targetCatalogYear,
    courses: affected,
  };
}

export function runAudit(rawProfile: StudentProfile, rawInputs: AuditInputs): AuditResult {
  // Renumbered courses are resolved to today's codes ONCE, here, before any
  // requirement is judged. Everything the audit touches arrives written in
  // whichever vocabulary its author used — a transcript and a saved plan in the
  // student's, a 2025-26 ASSIST agreement in that year's — and downstream code
  // compares codes as strings, so a single unresolved alias reads as a course
  // the student never took. See src/engine/courseCodes.ts.
  const { profile, inputs } = withCanonicalCodes(rawProfile, rawInputs);
  const { requirementSet, associateDegree, catalog, gePattern, eccgeAreas } = inputs;
  // Only the areas that bind for this destination's system (IGETC 1C is CSU-only).
  const geAreas = areasForSystem(gePattern, inputs.schoolSystem);
  const catalogCodes = new Set(catalog.map((c) => c.code));
  // Exam credit (AP/IB/CLEP) clears course-equivalents — count them as completed.
  const completed = new Set([...profile.completed, ...inputs.examCourses]);
  // A course can't be both done (incl. exam credit) and in-progress.
  const inProgress = new Set(profile.inProgress.filter((c) => !completed.has(c)));

  const parsedGpa = parseFloat(profile.gpa);
  const hasGpa = !isNaN(parsedGpa) && parsedGpa > 0;

  const goal = profile.goal;
  const wantsTransfer = goal === 'transfer' || goal === 'both';
  const wantsDegree = goal === 'graduate' || goal === 'both';
  const isAdt = profile.gradTrack === 'adt';

  // ADT core resolution. The official AA-T/AS-T template, once transcribed,
  // owns the ADT degree audit. Until then `core` is empty and we fall back to
  // the UC articulation prep as a DOCUMENTED APPROXIMATION ("ADT core ≈ UCR
  // articulation prep") — clearly not the real template, but the best available
  // signal before the degrees-adt drop. This is the one place that shortcut
  // lives now; flipping a template live is a data-only change.
  const adtTemplate = inputs.adtTemplate ?? null;
  const useAdtTemplate = isAdt && adtTemplate != null && adtTemplate.core.length > 0;
  const adtCore: MajorPrepReq[] = useAdtTemplate
    ? adtTemplate!.core
    : requirementSet?.majorPrep ?? [];
  const adtUnits = useAdtTemplate ? adtTemplate!.totalUnits : 60;

  const warnings: string[] = [];

  // ---- Transfer audit ----
  let transfer: TransferAudit | null = null;
  if (wantsTransfer && requirementSet) {
    const majorPrep = auditReqs(requirementSet.majorPrep, completed, inProgress, catalogCodes);
    const ge = auditGe(geAreas, gePattern.id, catalog, completed, inProgress, profile.frenchBac);

    // Group-aware rollup: select-N groups count as N, extra completed members
    // don't inflate progress, and `unknown` is neither done nor missing (B2).
    const prepSummary = summarizeReqs(majorPrep);
    const prepDone = prepSummary.requiredDone;
    const prepInProgress = prepSummary.requiredInProgress;
    const prepMissing = prepSummary.requiredMissing;
    const requiredCount = prepSummary.requiredTotal;

    const meetsGpa = hasGpa && parsedGpa >= requirementSet.gpaTarget;
    const gpaBelowTarget = hasGpa && parsedGpa < requirementSet.gpaTarget;
    const hasRequiredMissing = prepSummary.anyRequiredMissing;
    // In-progress required prep is not finished — it must not read as "eligible".
    const allRequiredDone = prepSummary.allRequiredDone;

    let verdict: TransferAudit['verdict'];
    if (hasRequiredMissing || gpaBelowTarget) verdict = 'reach';
    else if (allRequiredDone && meetsGpa && !requirementSet.impacted) verdict = 'eligible';
    else verdict = 'competitive';

    transfer = {
      verdict,
      impacted: requirementSet.impacted,
      majorPrep,
      gePatternId: gePattern.id,
      gePatternName: gePattern.name,
      ge,
      prepDone,
      prepInProgress,
      prepMissing,
      requiredCount,
      gpaTarget: requirementSet.gpaTarget,
      unitsDone: unitsFor([...completed], catalog),
      unitsInProgress: unitsFor([...inProgress], catalog),
      unitsFloor: TRANSFER_UNIT_FLOOR,
    };

    // Impaction disclosure. When the set carries CSU facts the copy is
    // CSU-specific (impaction mechanics + local-area priority); the generic
    // selective-major line covers everything else. Rule 4 either way: meeting
    // requirements never reads as "guaranteed".
    const csu = requirementSet.csu;
    if (requirementSet.impacted) {
      if (inputs.schoolSystem === 'CSU' && csu) {
        warnings.push(
          `This major is impacted at ${inputs.schoolName}${csu.campusImpacted ? ` (${csu.campusImpacted})` : ''} — meeting the ${requirementSet.gpaTarget.toFixed(1)} GPA floor does not guarantee admission; the effective cutoff is set competitively by the applicant pool.${csu.localAdmissionArea ? ' Local-area applicants get priority — check whether your college is in this campus’s local admission area.' : ''}`
        );
      } else {
        warnings.push(
          'This is a selective major. Meeting all published requirements does not guarantee admission — applicants are reviewed competitively.'
        );
      }
    }

    // CSU ADT advisory (WI4) — describes the OFFICIAL guarantee (rule 4): an
    // approved ADT guarantees admission to the CSU SYSTEM with junior standing,
    // never a specific campus/major. Advisory copy only, never a verdict input.
    if (inputs.schoolSystem === 'CSU' && csu?.adtGuarantee.available) {
      const g = csu.adtGuarantee;
      warnings.push(
        g.similarMajorAtCampus
          ? `An approved ${g.similarAdt ?? 'Associate Degree for Transfer (ADT)'} guarantees admission to the CSU system with junior standing — not to ${inputs.schoolName} specifically.${requirementSet.impacted ? ' Because this major is impacted here, ADT holders must still meet the campus’s supplemental/local criteria.' : ''}`
          : `A related ADT exists statewide (${g.similarAdt ?? 'see the campus ADT list'}), but ${inputs.schoolName} does not map it to this major — the CSU-system admission guarantee still applies; campus ADT priority for this program does not.`
      );
    }

    // The verdict reflects major prep + GPA only; disclose when the GE pattern is
    // unfinished so "eligible"/"competitive" is never read as "GE is done too".
    const geOpen = ge.filter((a) => a.status !== 'done').length;
    if ((verdict === 'eligible' || verdict === 'competitive') && geOpen > 0) {
      warnings.push(
        `Your general education (${gePattern.name}) isn't finished — ${geOpen} area${geOpen === 1 ? '' : 's'} still open. Transfer admission expects it completed, so the verdict above reflects your major classes + GPA only.`
      );
    }

    // CSU "Golden Four" (WI4): written communication, oral communication,
    // critical thinking, and math must be done with a C- or better before
    // transfer. Read off the already-audited GE areas (the ids differ per
    // pattern: IGETC math prints "2A", Cal-GETC "2"; IGETC 1C is CSU-only and
    // areasForSystem keeps it for CSU targets). Advisory only — the GE
    // disclosure above already scopes the verdict.
    if (inputs.schoolSystem === 'CSU') {
      const G4: Record<string, string[]> = { igetc: ['1A', '1B', '1C', '2A'], calgetc: ['1A', '1B', '1C', '2'] };
      const g4Open = ge.filter((a) => (G4[gePattern.id] ?? []).includes(a.id) && a.status !== 'done');
      if (g4Open.length > 0) {
        warnings.push(
          `CSU requires the "Golden Four" — written communication, oral communication, critical thinking, and math — completed with a C- or better before transfer. ${g4Open.length === 1 ? `Area ${g4Open[0].id} (${g4Open[0].label}) is` : `${g4Open.length} of the four are`} still open in your plan.`
        );
      }
    }
  }

  // ---- Degree audit ----
  let degree: DegreeAudit | null = null;
  if (wantsDegree) {
    if (isAdt && requirementSet) {
      // ADT: lower-division major core + transfer GE pattern + 60 units + 2.0,
      // grants priority. `adtCore` is the official template when live, else the
      // articulation-prep fallback; name/units/gpa/priority track the same source.
      const core = auditReqs(adtCore, completed, inProgress, catalogCodes);
      const ge = auditGe(geAreas, gePattern.id, catalog, completed, inProgress, profile.frenchBac);
      degree = assembleDegree({
        track: 'adt',
        name: useAdtTemplate
          ? adtTemplate!.name
          : requirementSet.adt.name ?? 'Associate Degree for Transfer',
        gePatternLabel: gePattern.name,
        core,
        ge,
        completed,
        inProgress,
        catalog,
        unitsRequired: adtUnits,
        gpaTarget: useAdtTemplate ? adtTemplate!.gpaTarget : 2.0,
        grantsTransferPriority: useAdtTemplate
          ? adtTemplate!.grantsTransferPriority
          : requirementSet.adt.grantsPriority,
        hasGpa,
        parsedGpa,
      });
    } else if (associateDegree) {
      // Local AA/AS: major core + local GE + 60 units + 2.0
      const core = auditReqs(associateDegree.majorCore, completed, inProgress, catalogCodes);
      const ge = auditGe(eccgeAreas, 'eccge', catalog, completed, inProgress, profile.frenchBac);
      degree = assembleDegree({
        track: 'associate',
        name: associateDegree.name,
        gePatternLabel: 'ECC GE',
        core,
        ge,
        completed,
        inProgress,
        catalog,
        unitsRequired: associateDegree.totalUnits,
        gpaTarget: associateDegree.gpaTarget,
        grantsTransferPriority: false,
        hasGpa,
        parsedGpa,
      });
    }

    if (degree?.grantsTransferPriority) {
      warnings.push(`The ${degree.name} grants UC/CSU transfer priority — confirm with your counselor.`);
    }
  }

  // New students have no GPA yet — don't nag them for one.
  if (!hasGpa && profile.status !== 'new') warnings.push('Add your GPA for a more accurate read.');

  // Be honest that the plan treats every in-progress course as a future pass.
  if (inProgress.size > 0) {
    const n = inProgress.size;
    warnings.push(
      `This plan assumes you pass the ${n} course${n === 1 ? '' : 's'} you're currently taking. If you drop or don't pass one, the courses that depend on it shift later.`
    );
  }

  // ---- Term plan targets ----
  const requiredReqs: MajorPrepReq[] = [];
  const optionalReqs: MajorPrepReq[] = [];
  let needTransferGe = false;
  let needEccge = false;
  let unitFloor = 0;

  const pushReqs = (reqs: MajorPrepReq[]) => {
    for (const r of reqs) (r.required ? requiredReqs : optionalReqs).push(r);
  };

  if (transfer && requirementSet) {
    pushReqs(requirementSet.majorPrep);
    needTransferGe = true;
    unitFloor = Math.max(unitFloor, TRANSFER_UNIT_FLOOR);
  }
  if (degree?.track === 'adt' && requirementSet) {
    pushReqs(adtCore); // template core when live, else articulation-prep fallback
    needTransferGe = true;
    unitFloor = Math.max(unitFloor, adtUnits);
  }
  if (degree?.track === 'associate' && associateDegree) {
    pushReqs(associateDegree.majorCore);
    needEccge = true;
    unitFloor = Math.max(unitFloor, associateDegree.totalUnits);
  }

  const targets: PlanTargets = {
    requiredReqs,
    optionalReqs,
    geAreas: needTransferGe ? geAreas : [],
    geField: gePattern.id,
    geLabel: 'General ed', // plan rows speak plainly; the pattern name lives in the GE panel
    eccgeAreas: needEccge ? eccgeAreas : [],
    unitFloor,
  };

  // The plan and insights must see exam-cleared courses as already done, too.
  const planProfile = { ...profile, completed: [...completed], inProgress: [...inProgress] };
  const { terms, electiveUnitsNeeded } = buildTermPlan(planProfile, targets, catalog);

  if (electiveUnitsNeeded > 0) {
    const floorLabel = wantsDegree
      ? `${unitFloor}-unit degree minimum`
      : `${unitFloor}-unit minimum to transfer`;
    warnings.push(
      `You'll need ~${electiveUnitsNeeded} more transferable elective units to reach the ${floorLabel}.`
    );
  }

  // ---- Time-to-finish estimate (driven by the units-per-term load) ----
  let estimate: TimeEstimate | null = null;
  const cap = UNIT_CAP[profile.termLoad] ?? 15;
  const summer = planUsesIntersessions(profile);
  // In-progress units count as earned here, matching how the plan treats them.
  const doneUnits = unitsFor([...completed, ...inProgress], catalog);
  const unitsRemaining = Math.max(0, unitFloor - doneUnits);
  const termsByUnits = cap > 0 ? Math.ceil(unitsRemaining / cap) : 0;
  const termsToFinish = Math.max(terms.length, termsByUnits);
  if (termsToFinish > 0) {
    const finishTerm = advanceTerm(profile.startTerm, termsToFinish - 1, summer);
    estimate = {
      terms: termsToFinish,
      finishTerm,
      durationLabel: durationLabel(termSpanMonths(profile.startTerm, finishTerm)),
      usesSummer: summer,
      goalVerb: wantsTransfer ? 'transfer-ready' : 'graduation-ready',
    };
  }

  // ---- Post-transfer upper-division plan (at the destination) ----
  let upperDiv = null;
  const involvesTransfer = wantsTransfer || (wantsDegree && isAdt);
  if (involvesTransfer && inputs.upperDivSet) {
    upperDiv = buildUpperDivPlan(
      inputs.upperDivSet,
      inputs.schoolName,
      inputs.schoolSystem,
      profile.termLoad
    );
  }

  // ---- Carry-over: how already-taken courses count toward the target major ----
  let carryOver: CarryOver | null = null;
  if ((wantsTransfer || (wantsDegree && isAdt)) && requirementSet) {
    carryOver = computeCarryOver(planProfile, requirementSet.majorPrep, geAreas, gePattern.id, gePattern.name, catalog, profile.major);
  } else if (wantsDegree && associateDegree) {
    carryOver = computeCarryOver(planProfile, associateDegree.majorCore, eccgeAreas, 'eccge', 'ECC GE', catalog, profile.major);
  }

  // ---- Counselor insights: difficulty profile + prerequisite unlock maps ----
  // Only meaningful when the goal involves transfer prep (not a local AA/AS-only path).
  const difficulty = involvesTransfer ? majorDifficulty(requirementSet, catalog) : null;
  const chains = involvesTransfer ? prereqChains(requirementSet, catalog, new Set([...completed, ...inProgress])) : [];

  // ---- Needs-review: everything we explicitly could NOT verify (B2) ----
  // Each item carries a pre-written question the student can hand to a counselor.
  const needsReview: ReviewItem[] = [];
  const reviewIds = new Set<string>();
  const addReview = (item: ReviewItem) => {
    if (reviewIds.has(item.id)) return;
    reviewIds.add(item.id);
    needsReview.push(item);
  };
  const reviewUnknownReqs = (reqs: AuditedReq[]) => {
    // A satisfied select-N group has no open question — unknowns among its
    // unused members don't block anything. Unknown members of an UNsatisfied
    // group escalate once per member (not once per normalized row).
    const groupSatisfied = new Map<string, boolean>();
    for (const r of reqs) {
      if (!r.group || groupSatisfied.has(r.group.id)) continue;
      const members = new Map<string, AuditedReq['status']>();
      for (const x of reqs) {
        if (x.group?.id === r.group.id && !members.has(x.group.memberId)) members.set(x.group.memberId, x.status);
      }
      const done = [...members.values()].filter((s) => s === 'done').length;
      groupSatisfied.set(r.group.id, done >= r.group.count);
    }
    const seenMember = new Set<string>();
    for (const r of reqs) {
      if (r.status !== 'unknown') continue;
      if (r.group) {
        if (groupSatisfied.get(r.group.id)) continue;
        const key = `${r.group.id}|${r.group.memberId}`;
        if (seenMember.has(key)) continue;
        seenMember.add(key);
      }
      addReview({
        id: r.group ? `req-group-${r.group.id}-${r.group.memberId}` : `req-${r.id}`,
        label: r.label,
        reason: `We couldn't match any course for this requirement in our ${inputs.collegeName} catalog snapshot — a gap in our data, not a ruling about you.`,
        question: `Which ${inputs.collegeName} course currently satisfies "${r.label}" for ${inputs.schoolName}? A planning tool I used couldn't match one.`,
      });
    }
  };
  if (transfer) reviewUnknownReqs(transfer.majorPrep);
  if (degree) reviewUnknownReqs(degree.core);
  // IGETC path only: Cal-GETC has no language area (UC's LOTE requirement lives
  // outside the pattern), so the foreign-credential question doesn't arise there.
  if (profile.frenchBac && gePattern.id === 'igetc' && (transfer || degree?.track === 'adt')) {
    addReview({
      id: 'french-bac-area6',
      label: 'IGETC Area 6 · Languages Other Than English',
      reason: 'You marked a French Baccalauréat. Foreign credentials can satisfy Area 6, but only a counselor or evaluator can verify yours — this tool can\'t.',
      question: `I hold a French Baccalauréat. Can you verify that it satisfies IGETC Area 6 (Languages Other Than English) for transfer to ${inputs.schoolName}, and whether I need to submit translated records?`,
    });
  }

  // ---- Source citations for the data actually used by this audit (A2) ----
  const citations = new Map<string, SourceCitation>();
  const cite = (
    meta: DataProvenance,
    appliesTo: string,
    transition?: SourceCitation['renumberingNotice'],
  ) => {
    const existing = citations.get(meta.sourceName);
    if (existing) {
      if (!existing.appliesTo.includes(appliesTo)) existing.appliesTo += ` & ${appliesTo}`;
      if (transition) existing.renumberingNotice = transition;
    } else {
      citations.set(meta.sourceName, { ...meta, appliesTo, ...(transition ? { renumberingNotice: transition } : {}) });
    }
  };
  const transition = requirementSet ? renumberingNotice(catalog, requirementSet) : undefined;
  if (transfer && requirementSet) cite(requirementSet.meta, 'transfer requirements', transition);
  // ADT requirements cite wherever the core came from: the official template
  // when live, else the articulation agreement used as the fallback.
  if (degree?.track === 'adt') {
    if (useAdtTemplate) cite(adtTemplate!.meta, 'ADT requirements');
    else if (requirementSet) cite(requirementSet.meta, 'ADT requirements', transition);
  }
  if (degree?.track === 'associate' && associateDegree) cite(associateDegree.meta, 'degree requirements');
  // The GE pattern actually audited is a cited source too (A2).
  if (transfer || degree?.track === 'adt') cite(gePattern.meta, `${gePattern.name} GE pattern`);

  return {
    goal,
    transfer,
    degree,
    termPlan: terms,
    electiveUnitsNeeded,
    upperDiv,
    carryOver,
    estimate,
    difficulty,
    prereqChains: chains,
    warnings,
    needsReview,
    sources: [...citations.values()],
    dataVersion: inputs.dataVersion,
  };
}

// --- degree assembly helper ---
interface DegreeArgs {
  track: 'adt' | 'associate';
  name: string;
  gePatternLabel: string;
  core: AuditedReq[];
  ge: AuditedArea[];
  completed: Set<CourseCode>;
  inProgress: Set<CourseCode>;
  catalog: Course[];
  unitsRequired: number;
  gpaTarget: number;
  grantsTransferPriority: boolean;
  hasGpa: boolean;
  parsedGpa: number;
}

function assembleDegree(a: DegreeArgs): DegreeAudit {
  const coreSummary = summarizeReqs(a.core);
  const coreDone = coreSummary.requiredDone;
  const coreRequired = coreSummary.requiredTotal;
  const unitsDone = unitsFor([...a.completed], a.catalog);
  const unitsInProgress = unitsFor([...a.inProgress], a.catalog);

  // Required core must be *done* (not merely in-progress) for the degree to be complete.
  const reqCoreIncomplete = !coreSummary.allRequiredDone;
  const geIncomplete = a.ge.some((area) => area.status !== 'done');
  const gpaMet = a.hasGpa && a.parsedGpa >= a.gpaTarget;
  const gpaOk = !a.hasGpa || a.parsedGpa >= a.gpaTarget;

  let status: DegreeAudit['status'];
  if (!reqCoreIncomplete && !geIncomplete && unitsDone >= a.unitsRequired && gpaOk) {
    status = 'complete';
  } else if (a.hasGpa && a.parsedGpa < a.gpaTarget) {
    status = 'off-track';
  } else {
    status = 'on-track';
  }

  return {
    track: a.track,
    name: a.name,
    gePatternLabel: a.gePatternLabel,
    core: a.core,
    ge: a.ge,
    coreDone,
    coreRequired,
    unitsDone,
    unitsInProgress,
    unitsRequired: a.unitsRequired,
    gpaTarget: a.gpaTarget,
    hasGpa: a.hasGpa,
    gpaMet,
    grantsTransferPriority: a.grantsTransferPriority,
    status,
  };
}
