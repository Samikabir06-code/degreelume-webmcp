import type { GePattern, GePatternId, StudentProfile } from '../types';
import { IGETC_AREAS } from './igetc';
import { CALGETC_AREAS } from './calgetc';
import { IGETC_SOURCE, CALGETC_SOURCE } from './meta';

// ─── Dual transfer-GE patterns + the student-facing selection rule ───
//
// Which pattern applies is a fact about the STUDENT, not the agreement:
//   · First CCC enrollment fall 2025 or later → Cal-GETC, no choice. (AB 928;
//     UC admissions: "Beginning in fall 2025, Cal-GETC is the general education
//     pattern available for students transferring to UC from CCC.")
//   · Enrolled before fall 2025 → catalog rights: "you may be able to complete
//     IGETC" — and Cal-GETC is open to them too, so it's a real choice.
//   · Entry term unknown → Cal-GETC. It is the only pattern that is valid for
//     EVERY entry term; defaulting to IGETC could show a fall-2025+ student a
//     pattern they can no longer certify. The quickstart chip lets pre-2025
//     students declare themselves and switch.
// Sources: ICAS Cal-GETC Standards v1.3 §1.2/§10.2; UC admissions GE page
// (both read 2026-06-10).

export const GE_PATTERNS: Record<GePatternId, GePattern> = {
  igetc: {
    id: 'igetc',
    name: 'IGETC',
    description:
      'Intersegmental GE pattern — certifiable by students who first enrolled at a California community college before fall 2025',
    areas: IGETC_AREAS,
    meta: IGETC_SOURCE,
  },
  calgetc: {
    id: 'calgetc',
    name: 'Cal-GETC',
    description:
      'The single UC/CSU transfer GE pathway for students entering a California community college fall 2025 or later',
    areas: CALGETC_AREAS,
    meta: CALGETC_SOURCE,
  },
};

export const getGePattern = (id: GePatternId): GePattern => GE_PATTERNS[id];

// (System-applicability filtering — IGETC 1C is CSU-only — lives in the engine:
// areasForSystem in engine/runAudit.ts, so audit, plan, and UI share one rule.)

const SEASON_ORDER: Record<string, number> = { winter: 0, spring: 1, summer: 2, fall: 3 };

// Parse a "Fall 2025"-style term label → comparable (year, season) tuple.
function parseTerm(label: string): { year: number; season: number } | null {
  const m = label.match(/(winter|spring|summer|fall)\s+(\d{4})/i);
  if (!m) return null;
  return { year: parseInt(m[2], 10), season: SEASON_ORDER[m[1].toLowerCase()] };
}

// Fall 2025 is the boundary: any first-enrollment term at/after it requires
// Cal-GETC. Summer 2025 entrants are before the boundary (the pathway begins
// with the fall term of the 2025–26 academic year).
export function isCalGetcRequired(entryTerm: string): boolean {
  const t = parseTerm(entryTerm);
  if (!t) return false; // unparseable = unknown — handled by the resolver default
  return t.year > 2025 || (t.year === 2025 && t.season === SEASON_ORDER.fall);
}

// The entry term the GE rule should key off: the recorded fact when we have
// one; for brand-new students their start term IS their first term.
export function geEntryTerm(
  p: Pick<StudentProfile, 'ccEntryTerm' | 'status' | 'startTerm'>,
): string {
  if (p.ccEntryTerm) return p.ccEntryTerm;
  if (p.status === 'new') return p.startTerm;
  return '';
}

export function resolveGePatternId(
  p: Pick<StudentProfile, 'ccEntryTerm' | 'status' | 'startTerm' | 'gePatternChoice'>,
): GePatternId {
  const entry = geEntryTerm(p);
  if (entry && isCalGetcRequired(entry)) return 'calgetc'; // forced — choice ignored
  // `gePatternChoice` is OPTIONAL: absent (partial profiles, tests, workers
  // reading a plan row) must behave exactly like 'auto' — never `undefined`.
  if (p.gePatternChoice && p.gePatternChoice !== 'auto') return p.gePatternChoice;
  // Known pre-fall-2025 entry → IGETC catalog rights by default; unknown entry
  // → Cal-GETC (valid for everyone — see header note).
  return entry ? 'igetc' : 'calgetc';
}

export const resolveGePattern = (
  p: Pick<StudentProfile, 'ccEntryTerm' | 'status' | 'startTerm' | 'gePatternChoice'>,
): GePattern => GE_PATTERNS[resolveGePatternId(p)];

// Does this student get a pattern choice at all? (False once their entry term
// forces Cal-GETC — the UI renders an explainer instead of buttons.)
export function gePatternIsChoosable(
  p: Pick<StudentProfile, 'ccEntryTerm' | 'status' | 'startTerm'>,
): boolean {
  const entry = geEntryTerm(p);
  return !(entry && isCalGetcRequired(entry));
}
