import type { CourseCode } from '../types';

// AP → ECC course-equivalencies the audit consumes — REAL (post-swap 2026-07-01).
//
// Source: El Camino College's own AP credit table (2025-26 Catalog), staged as
// data-sources/exam-credit/exam-credits.real-2026-06-19.csv (33 rows) and wired
// live in the atomic swap. The engine models exam credit as ECC course-
// equivalents; each grant's GE tags also clear the matching GE areas.
//
// Policy decisions carried from the drop's NOTES (documented, conservative):
//  · AP CS A → CSCI 3 at score 4+ (ECC catalog value). The UCR agreement's
//    own AP note (CS A 4+ toward CS 10A) lives on the requirement row — the
//    agreement layer re-imposes UC-articulation values independently.
//  · AP Psychology → PSYC C1000 at score 3 (ECC catalog value; the UCR
//    agreement requires 4 for its PSYC 2 row — again handled on the row).
//  · AP English Lang/Lit score-5 bonuses (adds ENGL C1002, the catalog's
//    ENGL 1B) are encoded at the
//    score-3 threshold value only (under-promise, never over-credit).
//  · AP Statistics → STAT C1000 requires 4 (a 3 meets competency only, no course).
//  · Discontinued exams (e.g. AP French Literature) keep their catalog rows —
//    students may hold historic scores; see each note.
export interface ExamCredit {
  id: string;
  name: string;                 // "AP Calculus AB"
  category: 'AP' | 'IB' | 'CLEP';
  minScore: number;             // minimum score assumed cleared
  grants: CourseCode[];         // ECC course-equivalents it clears (fed into the audit)
  note?: string;
}

export const EXAM_CREDITS: ExamCredit[] = [
  {
    id: 'ap-art-history', name: 'AP Art History', category: 'AP', minScore: 3,
    grants: ['ARTH C1100', 'ARTH C1200'],
    note: 'ECC AP table: "Art History" -> AHIS 102A or AHIS 102B, 3 semester units, score 3/4/5. Catalog grants the pair as the course equivalent. Those two are ARTH C1100 / ARTH C1200 from Fall 2026 (CCN).',
  },
  {
    id: 'ap-bio', name: 'AP Biology', category: 'AP', minScore: 3,
    grants: ['BIOL 10'],
    note: 'ECC AP table: "Biology" -> BIOL 10 (4 units), score 3/4/5.',
  },
  {
    id: 'ap-calc-ab', name: 'AP Calculus AB (or AB subscore)', category: 'AP', minScore: 3,
    grants: ['MATH 190'],
    note: 'ECC AP table: "Calculus AB" -> MATH 190 (5 units), score 3/4/5. Score of 3 meets the AA/AS math competency (also clears IGETC Area 2A / CSU Area B4).',
  },
  {
    id: 'ap-calc-bc', name: 'AP Calculus BC (score 3)', category: 'AP', minScore: 3,
    grants: ['MATH 190'],
    note: 'ECC AP table: "Calculus BC" score 3 -> MATH 190 (5 units) only. The score-4+ row adds MATH 191. If you scored 4 or 5, pick ap-calc-bc-4 instead.',
  },
  {
    id: 'ap-calc-bc-4', name: 'AP Calculus BC (score 4+)', category: 'AP', minScore: 4,
    grants: ['MATH 190', 'MATH 191'],
    note: 'ECC AP table: "Calculus BC" score 4 or 5 -> MATH 190 & MATH 191 (10 units).',
  },
  {
    id: 'ap-chem', name: 'AP Chemistry', category: 'AP', minScore: 4,
    grants: ['CHEM 1A'],
    note: 'ECC AP table: "Chemistry" -> CHEM 1A (5 units). Catalog note: "The student must have a score of 4 or 5."',
  },
  {
    id: 'ap-chinese', name: 'AP Chinese Language and Culture', category: 'AP', minScore: 3,
    grants: ['CHIN 1', 'CHIN 2'],
    note: 'ECC AP table: "Chinese Language & Culture" -> CHIN 1, CHIN 2 (6 units), score 3/4/5.',
  },
  {
    id: 'ap-cs-a', name: 'AP Computer Science A', category: 'AP', minScore: 4,
    grants: ['CSCI 3'],
    note: 'ECC AP table: "Computer Science A" -> CSCI 3 (4 units), score 4 or 5. NOTE: differs from the agreement-derived row in src (which granted CSCI 1 per UCR CS 10A) - see NOTES.',
  },
  {
    id: 'ap-cs-principles', name: 'AP Computer Science Principles', category: 'AP', minScore: 4,
    grants: ['CSCI 7'],
    note: 'ECC AP table: "AP Computer Science Principles" -> CSCI 7 (4 units), score 4 or 5.',
  },
  {
    id: 'ap-macro', name: 'AP Macroeconomics', category: 'AP', minScore: 3,
    grants: ['ECON C2002'],
    note: 'ECC AP table: "Economics - Macroeconomics" -> ECON 101 (3 units), score 3/4/5 — ECON 101 is ECON C2002 from Fall 2026 (CCN). Also clears IGETC Area 4 / CSU Area D2.',
  },
  {
    id: 'ap-micro', name: 'AP Microeconomics', category: 'AP', minScore: 3,
    grants: ['ECON C2001'],
    note: 'ECC AP table: "Economics - Microeconomics" -> ECON 102 (3 units), score 3/4/5 — ECON 102 is ECON C2001 from Fall 2026 (CCN). Also clears IGETC Area 4 / CSU Area D2.',
  },
  {
    id: 'ap-eng-lang', name: 'AP English Language and Composition', category: 'AP', minScore: 3,
    grants: ['ENGL C1000'],
    note: 'ECC AP table: "English - Language & Composition" score 3/4 -> ENGL C1000 (4 units). Score 5 adds ENGL 1B (7 units total); conservatively encoded at the score-3 threshold = ENGL C1000 only (under-promise).',
  },
  {
    id: 'ap-eng-lit', name: 'AP English Literature and Composition', category: 'AP', minScore: 3,
    grants: ['ENGL C1000'],
    note: 'ECC AP table: "English - Literature & Composition" score 3/4 -> ENGL C1000 or ENGL 1B (4 units). Score 5 = ENGL C1000 & ENGL 1B (7 units); conservatively encoded as ENGL C1000 at score 3 (under-promise; catalog lists ENGL C1000 first).',
  },
  {
    id: 'ap-environmental-science', name: 'AP Environmental Science', category: 'AP', minScore: 3,
    grants: ['GEOG 1', 'GEOL 1'],
    note: 'ECC AP table: "Environmental Science" -> GEOG 1 or GEOL 1 (3 units), score 3/4/5. Catalog states "or" - listing both as the equivalence set.',
  },
  {
    id: 'ap-french', name: 'AP French Language and Culture', category: 'AP', minScore: 3,
    grants: ['FREN 1', 'FREN 2'],
    note: 'ECC AP table: "French Language & Culture" -> FREN 1, FREN 2 (6 units), score 3/4/5.',
  },
  {
    id: 'ap-french-lit', name: 'AP French Literature', category: 'AP', minScore: 3,
    grants: ['FREN 3'],
    note: 'ECC AP table: "French Literature" -> FREN 3 (3 units). DISCONTINUED exam (College Board ended French Literature); catalog footnote ties full credit to "taken prior to Fall 2009." See NOTES.',
  },
  {
    id: 'ap-german', name: 'AP German Language and Culture', category: 'AP', minScore: 3,
    grants: ['GERM 1', 'GERM 2'],
    note: 'ECC AP table: "German Language & Culture" -> GERM 1, GERM 2 (6 units), score 3/4/5.',
  },
  {
    id: 'ap-gov-comparative', name: 'AP Comparative Government and Politics', category: 'AP', minScore: 3,
    grants: ['POLI 2'],
    note: 'ECC AP table: "Government & Politics - Comparative" -> POLI 2 (3 units), score 3/4/5.',
  },
  {
    id: 'ap-gov-us', name: 'AP United States Government and Politics', category: 'AP', minScore: 3,
    grants: ['POLS C1000'],
    note: 'ECC AP table: "Government & Politics - U.S." -> POLS C1000 (3 units), score 3/4/5. Catalog footnote: does not by itself fulfill the post-transfer AHI/American-Institutions requirement.',
  },
  {
    id: 'ap-hist-euro', name: 'AP European History', category: 'AP', minScore: 3,
    grants: ['HIST 141'],
    note: 'ECC AP table: "History - European" -> HIST 141 (3 units), score 3/4/5.',
  },
  {
    id: 'ap-us-hist', name: 'AP United States History', category: 'AP', minScore: 3,
    grants: ['HIST C1001', 'HIST C1002'],
    note: 'ECC AP table: "History - U.S." -> HIST 101 & HIST 102 (6 units), score 3/4/5 — HIST C1001 & HIST C1002 from Fall 2026 (CCN).',
  },
  {
    id: 'ap-world-hist', name: 'AP World History: Modern', category: 'AP', minScore: 3,
    grants: ['HIST 140'],
    note: 'ECC AP table: "History - World" -> HIST 140 (3 units), score 3/4/5.',
  },
  {
    id: 'ap-human-geo', name: 'AP Human Geography', category: 'AP', minScore: 3,
    grants: ['GEOG 2'],
    note: 'ECC AP table: "Human Geography" -> GEOG 2 (3 units), score 3/4/5.',
  },
  {
    id: 'ap-italian', name: 'AP Italian Language and Culture', category: 'AP', minScore: 3,
    grants: ['ITAL 1', 'ITAL 2'],
    note: 'ECC AP table: "Italian Language & Culture" -> ITAL 1, ITAL 2 (6 units), score 3/4/5.',
  },
  {
    id: 'ap-japanese', name: 'AP Japanese Language and Culture', category: 'AP', minScore: 3,
    grants: ['JAPA 1', 'JAPA 2'],
    note: 'ECC AP table: "Japanese Language & Culture" -> JAPA 1, JAPA 2 (6 units), score 3/4/5.',
  },
  {
    id: 'ap-physics-1', name: 'AP Physics 1: Algebra-Based', category: 'AP', minScore: 4,
    grants: ['PHYS 2A'],
    note: 'ECC AP table: "Physics 1" -> PHYS 2A (4 units), score 4 or 5.',
  },
  {
    id: 'ap-physics-2', name: 'AP Physics 2: Algebra-Based', category: 'AP', minScore: 4,
    grants: ['PHYS 2B'],
    note: 'ECC AP table: "Physics 2" -> PHYS 2B (4 units), score 4 or 5.',
  },
  {
    id: 'ap-physics-c-mech', name: 'AP Physics C: Mechanics', category: 'AP', minScore: 4,
    grants: ['PHYS 1A'],
    note: 'ECC AP table: "Physics C - Mechanics" -> PHYS 1A (4 units), score 4 or 5.',
  },
  {
    id: 'ap-physics-c-em', name: 'AP Physics C: Electricity and Magnetism', category: 'AP', minScore: 4,
    grants: ['PHYS 1C'],
    note: 'ECC AP table: "Physics C - Electricity and Magnetism" -> PHYS 1C (4 units), score 4 or 5.',
  },
  {
    id: 'ap-psych', name: 'AP Psychology', category: 'AP', minScore: 3,
    grants: ['PSYC C1000'],
    note: 'ECC AP table: "Psychology" -> PSYC C1000 (3 units), score 3/4/5. NOTE: ECC\'s own catalog grants at score 3; the agreement-derived row in src used 4 (UCR PSYC 2). See NOTES.',
  },
  {
    id: 'ap-spanish', name: 'AP Spanish Language and Culture', category: 'AP', minScore: 3,
    grants: ['SPAN 1', 'SPAN 2'],
    note: 'ECC AP table: "Spanish Language" -> SPAN 1, SPAN 2 (6 units), score 3/4/5.',
  },
  {
    id: 'ap-spanish-lit', name: 'AP Spanish Literature and Culture', category: 'AP', minScore: 3,
    grants: ['SPAN 3'],
    note: 'ECC AP table: "Spanish Literature" -> SPAN 3 (3 units), score 3/4/5.',
  },
  {
    id: 'ap-stats', name: 'AP Statistics', category: 'AP', minScore: 4,
    grants: ['STAT C1000'],
    note: 'ECC AP table: "Statistics" -> STAT C1000 (4 units) requires score 4 or 5. (Score of 3 meets AA/AS math competency + IGETC Area 2 only, no course; encoded at 4 to under-promise.)',
  },
];

// ── Accessors (module API, not data) ─────────────────────────────────────────
// Restored 2026-07-01: the atomic data swap replaced this file's DATA rows but
// dropped these helpers, which the engine wiring compiles against
// (server/tools.ts, src/components/Wizard.tsx, runAudit tests). A data refresh
// must never change the module's public surface — keep these with the table.
export const getExamCredit = (id: string): ExamCredit | undefined =>
  EXAM_CREDITS.find((e) => e.id === id);

// Union of the ECC course-equivalents granted by the selected exam ids
// (deduped) — fed into the audit as completed-course credit.
export const examGrantedCourses = (examIds: string[]): CourseCode[] => [
  ...new Set(examIds.flatMap((id) => getExamCredit(id)?.grants ?? [])),
];
