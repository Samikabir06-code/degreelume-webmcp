import type { GeArea } from '../types';

// ECC local general-education pattern for the Associate (AA/AS) degree — REAL.
//
// Transcribed from the El Camino College 2025-2026 Catalog, "Associate of Arts
// and Associate of Science Degree" (Option I local pattern, pp. 231–239), via
// the staged drop data-sources/degrees-adt/local-ge.real-2026-06-19.md; wired
// live in the 2026-07-01 atomic swap. Effective fall 2025 ECC uses ONE local
// pattern for both AA and AS (Option II = Cal-GETC and Option III = IGETC are
// the transfer patterns, modeled separately in calgetc.ts / igetc.ts).
//
// Modeling decisions (flags carried from the drop's NOTES):
// · Area 1 is split into 1A + 1B (one course from each sub-list) to preserve
//   the catalog's "English composition AND oral comm/critical thinking" rule.
// · Area 4 is modeled as count: 1 (3 units). The catalog header's "3 or 6
//   semester units" alternative (American-institutions style 6-unit branch) is
//   NOT modeled — conservative single-course reading, flagged for verification.
// · Ethnic-studies courses are legitimately cross-listed: a course may carry
//   eccge: ["4","6"] (AB 1111).
// · Per-course eccge tags are driven from the catalog's certified lists as
//   staged in the drop (intersection set). Untagged courses simply don't
//   satisfy an area — the audit may over-ask, it never falsely credits.
// · Pattern-level facts that live on the degree, not here: 24-unit GE minimum,
//   60 degree-applicable units, 2.0 GPA, C-or-better English/Math competency.
export const ECC_GE_AREAS: GeArea[] = [
  {
    id: "1A",
    label: "English Composition",
    description: "One college-level English composition course (C or higher, min 3 units)",
  },
  {
    id: "1B",
    label: "Oral Communication & Critical Thinking",
    description: "One course in oral communication or critical thinking (min 3 units)",
  },
  {
    id: "2",
    label: "Mathematical Concepts & Quantitative Reasoning",
    description: "One college-level math / quantitative-reasoning course (C or better)",
  },
  {
    id: "3",
    label: "Arts and Humanities",
    description: "One course in the arts or humanities",
  },
  {
    id: "4",
    label: "Social and Behavioral Sciences",
    description: "One course in the social and behavioral sciences",
  },
  {
    id: "5",
    label: "Natural Sciences",
    description: "One course in the natural sciences",
  },
  {
    id: "6",
    label: "Ethnic Studies",
    description: "One course in ethnic studies (AB 1111)",
  },
  {
    id: "7",
    label: "Health and Physical Education",
    description: "One course in health or physical education (min 3 units)",
  },
];
