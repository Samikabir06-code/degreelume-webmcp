import type { AuditResult, MajorId, SchoolId, TransferAudit, DataProvenance, MajorChoice } from '../types';

// Major Switch Explorer engine (SPEC_MAJOR_SWITCH_2026-07-03) — PURE reduction.
//
// Every cell of the matrix is produced by the SAME deterministic path as the
// main result: the caller runs `runAudit` (via the wizard's computeAudit) once
// per candidate (major × campus) that has registry data, and this module only
// REDUCES those AuditResults to row summaries and orders them. No new verdict
// logic, no new satisfaction notion, no LLM anywhere in the path
// (BUSINESS_RULES §2): coverage is the audit's own group-aware
// prepDone/requiredCount, verdicts are the audit's own
// eligible/competitive/reach, and the plan-length delta comes from the
// audit's own estimate.
//
// GE is major-independent by construction (the pattern is a student fact) —
// GE carry-over across a switch is always 100% and the UI says so.

export interface SwitchCandidate {
  major: MajorId;
  majorName: string;
  school: SchoolId;
  schoolName: string;
  audit: AuditResult;               // produced by the shared computeAudit path
  provenance: DataProvenance['verification'];
  // Campus doesn't offer this major (majors.ts notOfferedAt) — the audit is
  // the VERIFIED closest-match program's, explicitly labeled, never a silent
  // substitute.
  notOffered?: { closestMajorId: MajorId | null; closestName: string; note: string };
}

export interface SwitchSummary {
  major: MajorId;
  majorName: string;
  school: SchoolId;
  schoolName: string;
  verdict: TransferAudit['verdict'];
  impacted: boolean;
  // The audit's own group-aware rollup (select-groups count as closed when the
  // group is closed — identical semantics to the main result).
  prepDone: number;
  prepMissing: number;
  prepTotal: number;
  // prepDone ÷ prepTotal; null when the set has NO required rows (floor-only
  // majors like UCR CHASS) — "nothing required is missing" must not display as
  // a 100% bar without the no-required-prep framing.
  coverage: number | null;
  // Course-level carry-over buckets (TR-1 framing), straight from the audit.
  creditsThatCount: number;   // existing courses applying to major prep or GE
  electivesOnly: number;      // transfer as electives under this candidate
  estTerms: number | null;    // candidate plan length (terms)
  extraTerms: number | null;  // vs the CURRENT major's plan — advisory estimate
  gpaTarget: number;
  provenance: DataProvenance['verification'];
  notOffered?: SwitchCandidate['notOffered'];
  isCurrent: boolean;
}

export interface SwitchMatrix {
  // rows[0] is the current (major, school) baseline when present; the rest are
  // sorted same-campus first, then by coverage (floor-only majors sort as
  // fully-covered), then verdict strength.
  rows: SwitchSummary[];
  baseline: SwitchSummary | null;
}

const VERDICT_RANK: Record<TransferAudit['verdict'], number> = { eligible: 0, competitive: 1, reach: 2 };

// Reduce one candidate audit to a matrix row. Returns null when the audit has
// no transfer section (a switch matrix is transfer-framed by definition).
export function summarizeSwitch(
  c: SwitchCandidate,
  baselineTerms: number | null,
  current: { major: MajorChoice; school: SchoolId },
): SwitchSummary | null {
  const t = c.audit.transfer;
  if (!t) return null;
  const carry = c.audit.carryOver;
  const estTerms = c.audit.estimate?.terms ?? null;
  return {
    major: c.major,
    majorName: c.majorName,
    school: c.school,
    schoolName: c.schoolName,
    verdict: t.verdict,
    impacted: t.impacted,
    prepDone: t.prepDone,
    prepMissing: t.prepMissing,
    prepTotal: t.requiredCount,
    coverage: t.requiredCount > 0 ? t.prepDone / t.requiredCount : null,
    creditsThatCount: carry ? carry.countsTowardMajor + carry.countsTowardGe : 0,
    electivesOnly: carry ? carry.electiveOnly : 0,
    estTerms,
    extraTerms: estTerms != null && baselineTerms != null ? estTerms - baselineTerms : null,
    gpaTarget: t.gpaTarget,
    provenance: c.provenance,
    notOffered: c.notOffered,
    isCurrent: c.major === current.major && c.school === current.school,
  };
}

// Assemble the full matrix. Deterministic: same candidates in, same rows out —
// memoize at the component layer on (profile hash, DATA_VERSION), not here.
export function buildSwitchMatrix(
  current: { major: MajorChoice; school: SchoolId },
  candidates: SwitchCandidate[],
): SwitchMatrix {
  const baselineTerms =
    candidates.find((c) => c.major === current.major && c.school === current.school)
      ?.audit.estimate?.terms ?? null;

  const rows = candidates
    .map((c) => summarizeSwitch(c, baselineTerms, current))
    .filter((r): r is SwitchSummary => r != null);

  const baseline = rows.find((r) => r.isCurrent) ?? null;
  const others = rows.filter((r) => !r.isCurrent);
  others.sort((a, b) => {
    // Same-campus rows first (the likeliest switches), then the other campus.
    const aSame = a.school === current.school ? 0 : 1;
    const bSame = b.school === current.school ? 0 : 1;
    if (aSame !== bSame) return aSame - bSame;
    // Coverage desc; a floor-only major (coverage null) has nothing required
    // missing, so it sorts as fully covered.
    const cov = (r: SwitchSummary) => r.coverage ?? 1;
    if (cov(a) !== cov(b)) return cov(b) - cov(a);
    if (VERDICT_RANK[a.verdict] !== VERDICT_RANK[b.verdict]) return VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict];
    return a.majorName.localeCompare(b.majorName);
  });

  return { rows: baseline ? [baseline, ...others] : others, baseline };
}
