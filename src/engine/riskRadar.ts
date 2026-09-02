// Risk Radar — the "live audit" agent (endgoal "Risk Radar on real grades").
//
// A pure, deterministic engine over the student's synced Canvas snapshot. It
// answers one question: is any course in progress at a grade that endangers
// the requirement that course satisfies? Same inputs → same flags, always.
// No language model, no randomness, no I/O — the worker and the counselor
// tool both call this, so the chat and the page can never disagree (CORE-5).
//
// Honest-unknown law (B2), and it cuts BOTH ways here. A course we can't map,
// or can't grade, or whose remaining weight Canvas didn't tell us, produces no
// verdict — but "no verdict" must not become the LOUDEST verdict either. An
// unknown is never allowed to render as "even a perfect finish can't save
// this": telling a student their course is unsalvageable because our sync came
// back thin is the worst failure this engine has, worse than saying nothing.

import { LETTER_POINTS, SCORE_TO_LETTER, pointsFromLetter as gradePointsFromLetter } from '../data/gradeRules';

export type RadarLevel = 'ok' | 'watch' | 'risk';

export interface RadarCourse {
  canvasCourseId: string;
  canvasCourseCode: string | null;
  canvasCourseName: string;
  // Catalog code AFTER student confirmation; null while unmapped.
  mappedCatalogCode: string | null;
  mappingStatus: 'unmapped' | 'suggested' | 'confirmed';
  canvasGrade: string | null;   // letter grade from Canvas, if any
  canvasScore: number | null;   // current percent score 0–100, if any
  units: number | null;
  enrollmentState: string;
  // Fraction of the final grade still ungraded (0–1), or NULL when the sync
  // could not determine it. null ≠ 0: zero means "everything is graded", null
  // means "we don't know", and the two lead to opposite messages.
  remainingWeight: number | null;
}

export interface RadarRequirement {
  // What this course must be for the plan to hold, when the engine can say.
  kind: 'major-prep' | 'ge' | 'no-requirement';
  // Required grade points on the 4.0 scale (e.g. C = 2.0). null when the
  // engine cannot determine a requirement (still emits ok/no-requirement).
  requiredPoints: number | null;
  requiredLabel: string | null;   // "C" / "B" — for the UI chip
  source: string;                 // citation line for the flag
}

export interface RadarFlag {
  level: RadarLevel;
  course: RadarCourse;
  requirement: RadarRequirement;
  currentPoints: number | null;   // best-effort grade points from letter/score
  currentLabel: string | null;    // "B-" / "83%" — for the UI
  // The remaining-grade math, only when the engine could actually compute it:
  // what average on the remaining weight still clears the requirement.
  neededRemainingAverage: number | null; // percent (0–100) needed on remaining work
  // True when the grade shown was ESTIMATED from a percent score rather than
  // read as a letter from Canvas — surfaces in the UI so an estimate never
  // reads as the registrar's grade.
  estimated: boolean;
  message: string;                // one calm sentence — the "not a red alarm; a plan"
}

export interface RadarResult {
  flags: RadarFlag[];
  // Counts power the "1 of 4 at risk" headline without re-deriving.
  summary: { ok: number; watch: number; risk: number };
}

// Letter↔points and score→letter come from src/data/gradeRules.ts — ONE table,
// imported rather than mirrored, so the two can't drift apart.
const SCORE_TO_POINTS: { min: number; points: number; label: string }[] =
  SCORE_TO_LETTER.map((row) => ({ min: row.min, points: LETTER_POINTS[row.letter] ?? 0, label: row.letter }));

export function pointsFromLetter(letter: string | null): number | null {
  if (!letter) return null;
  return gradePointsFromLetter(letter);
}

export function pointsFromScore(score: number | null): { points: number; label: string } | null {
  if (score === null || Number.isNaN(score)) return null;
  const clamped = Math.min(100, Math.max(0, score));
  const row = SCORE_TO_POINTS.find((r) => clamped >= r.min) ?? SCORE_TO_POINTS[SCORE_TO_POINTS.length - 1];
  return { points: row.points, label: `${Math.round(clamped)}%` };
}

// A course is "in progress" only while Canvas says so — completed terms are
// facts of the past, not risks.
function isInProgress(course: RadarCourse): boolean {
  return course.enrollmentState === 'active' || course.enrollmentState === 'invited';
}

// The required grade a course must meet, derived from the plan's requirement
// data by the caller — see src/engine/liveRequirements.ts.
export type RequirementResolver = (course: RadarCourse) => RadarRequirement;

// The minimum percent score that clears a required grade, inverted from the
// score→points table (C or better = ≥73%, B or better = ≥83%, …). Used only
// to state the remaining-grade math in percent terms a student can act on.
function requiredPercent(requiredPoints: number): number {
  let best = 100;
  for (const row of SCORE_TO_POINTS) {
    if (row.points >= requiredPoints - 1e-9 && row.min < best) best = row.min;
  }
  return best;
}

// A remaining weight we can actually reason about: a finite number in [0,1].
// Anything else (null, NaN, Infinity, out of range) is an unknown, and the
// caller must treat it as one.
export function normalizedRemainingWeight(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}

// Risk math, in percent: given the current percent score and the fraction of
// the grade still ungraded, what average on the remaining work clears the
// requirement? Callers only reach this once both inputs are known.
export function neededRemainingAverage(
  currentScore: number,
  requiredPoints: number,
  remainingWeight: number,
): { raw: number; display: number } {
  const required = requiredPercent(requiredPoints);
  const raw = remainingWeight >= 1
    ? required
    : (required - currentScore * (1 - remainingWeight)) / remainingWeight;
  return { raw, display: Math.round(Math.min(100, Math.max(0, raw))) };
}

function gradeLabel(course: RadarCourse): { points: number | null; label: string | null; estimated: boolean } {
  if (course.canvasGrade) {
    const points = pointsFromLetter(course.canvasGrade);
    if (points !== null) {
      return { points, label: course.canvasGrade.trim().toUpperCase(), estimated: false };
    }
  }
  const fromScore = pointsFromScore(course.canvasScore);
  if (fromScore) return { points: fromScore.points, label: fromScore.label, estimated: true };
  return { points: null, label: null, estimated: false };
}

// Severity order for the engine's own output. The engine ranks; the model and
// the UI relay that ranking (A3) — so the ranking has to exist here, not in a
// prompt. Ties break on the Canvas course id so the order is total and stable.
const LEVEL_RANK: Record<RadarLevel, number> = { risk: 0, watch: 1, ok: 2 };

// ─── The engine ────────────────────────────────────────────────────────────
//
// resolveRequirement is injected so the same code runs in the worker (reads
// real requirement data + grade rules) and in the counselor tool (same data),
// and tests can pin behavior with a fixture resolver. The resolver returns
// kind 'no-requirement' for courses that don't satisfy anything the plan
// needs — those are never flagged.
export function runRiskRadar(
  courses: RadarCourse[],
  resolveRequirement: RequirementResolver,
): RadarResult {
  const flags: RadarFlag[] = [];

  for (const course of courses) {
    if (!isInProgress(course)) continue;

    // A SUGGESTION is not a mapping. The resolver is supposed to refuse these
    // too, but the guard lives here as well: a verdict about a course we only
    // guessed the identity of is a guess wearing an engine's authority (B2),
    // and that must not depend on every caller remembering to check.
    const requirement = course.mappingStatus === 'confirmed'
      ? resolveRequirement(course)
      : { kind: 'no-requirement' as const, requiredPoints: null, requiredLabel: null, source: '' };
    const { points: currentPoints, label: currentLabel, estimated } = gradeLabel(course);

    // Honest unknowns: an unmapped (or merely SUGGESTED) course gets no risk
    // verdict — a verdict about a course we guessed at is a guess (B2).
    if (requirement.kind === 'no-requirement') {
      const unconfirmed = course.mappingStatus !== 'confirmed';
      flags.push({
        level: 'ok',
        course,
        requirement,
        currentPoints,
        currentLabel,
        neededRemainingAverage: null,
        estimated,
        message: unconfirmed
          ? 'We haven\'t matched this Canvas course to a catalog course yet, so we can\'t say what grade it needs. Confirm the match and it joins your live audit.'
          : 'This course isn\'t needed for your current plan, so its grade doesn\'t affect your requirements.',
      });
      continue;
    }

    if (currentPoints === null || requirement.requiredPoints === null) {
      flags.push({
        level: 'ok',
        course,
        requirement,
        currentPoints: null,
        currentLabel,
        neededRemainingAverage: null,
        estimated,
        message: 'No grade reported yet — nothing to flag until Canvas posts one.',
      });
      continue;
    }

    if (currentPoints >= requirement.requiredPoints - 1e-9) {
      flags.push({
        level: 'ok',
        course,
        requirement,
        currentPoints,
        currentLabel,
        neededRemainingAverage: null,
        estimated,
        message: `You're at ${currentLabel ?? 'a passing grade'} — above the ${requirement.requiredLabel ?? 'required'} this course needs. No action needed.`,
      });
      continue;
    }

    // ── Below the requirement. Now: what can we honestly say about it? ──
    const requiredLabel = requirement.requiredLabel ?? 'required grade';
    const weight = normalizedRemainingWeight(course.remainingWeight);

    // No numeric score → no percent math is possible. That is a WATCH with an
    // explanation, never an "unreachable" alarm.
    if (course.canvasScore === null || Number.isNaN(course.canvasScore)) {
      flags.push({
        level: 'watch',
        course,
        requirement,
        currentPoints,
        currentLabel,
        neededRemainingAverage: null,
        estimated,
        message: `You're at ${currentLabel ?? 'a low grade'}, below the ${requiredLabel} this course needs. Canvas hasn't published a percent score for it, so we can't work out what the rest of the term would have to average — worth asking your instructor where you stand.`,
      });
      continue;
    }

    // Weight unknown → same rule: say what we don't know.
    if (weight === null) {
      flags.push({
        level: 'watch',
        course,
        requirement,
        currentPoints,
        currentLabel,
        neededRemainingAverage: null,
        estimated,
        message: `You're at ${currentLabel ?? 'a low grade'}, below the ${requiredLabel} this course needs. We can't see how much of the grade is still ungraded, so we can't tell you what the rest has to average — keep an eye on it.`,
      });
      continue;
    }

    // Weight genuinely zero → everything is graded. This is the only honest
    // "a perfect finish can't change it", because there is no finish left.
    if (weight <= 0) {
      flags.push({
        level: 'risk',
        course,
        requirement,
        currentPoints,
        currentLabel,
        neededRemainingAverage: null,
        estimated,
        message: `Everything in this course is graded and you're at ${currentLabel ?? 'a low grade'}, below the ${requiredLabel} it needs${requirement.source ? ` (${requirement.source})` : ''}. Talk to a counselor about your options — repeating it, or a different course that satisfies the same requirement.`,
      });
      continue;
    }

    const { raw, display } = neededRemainingAverage(
      course.canvasScore,
      requirement.requiredPoints,
      weight,
    );
    const remainingPct = Math.round(weight * 100);

    if (raw > 100) {
      flags.push({
        level: 'risk',
        course,
        requirement,
        currentPoints,
        currentLabel,
        neededRemainingAverage: null,
        estimated,
        message: `Even a perfect score on the remaining ${remainingPct}% of this course wouldn't reach the ${requiredLabel} it needs${requirement.source ? ` (${requirement.source})` : ''}. Talk to your instructor or a counselor now — before the withdraw deadline, not after it.`,
      });
    } else if (display >= 85) {
      flags.push({
        level: 'risk',
        course,
        requirement,
        currentPoints,
        currentLabel,
        neededRemainingAverage: display,
        estimated,
        message: `You're at ${currentLabel ?? 'a low grade'} and need about ${display}% on the remaining ${remainingPct}% of this course to clear the ${requiredLabel} it needs. That's a narrow path — worth a plan now.`,
      });
    } else {
      flags.push({
        level: 'watch',
        course,
        requirement,
        currentPoints,
        currentLabel,
        neededRemainingAverage: display,
        estimated,
        message: `You're at ${currentLabel ?? 'a low grade'} — an average around ${display}% on the remaining ${remainingPct}% of this course keeps you above the ${requiredLabel} it needs. Watch the next assignments.`,
      });
    }
  }

  flags.sort((a, b) => {
    const byLevel = LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
    if (byLevel !== 0) return byLevel;
    return a.course.canvasCourseId.localeCompare(b.course.canvasCourseId);
  });

  const summary = { ok: 0, watch: 0, risk: 0 };
  for (const flag of flags) summary[flag.level] += 1;

  return { flags, summary };
}
