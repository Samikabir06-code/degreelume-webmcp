import type { GeArea } from '../types';

// Cal-GETC — the AB 928 single lower-division GE pathway, effective fall 2025.
// Area structure transcribed from the ICAS Cal-GETC Standards v1.3 (2025):
// 11 courses / 34 semester units. Structural differences from IGETC that this
// file is responsible for modeling:
//   · 1C Oral Communication is required for EVERYONE (under IGETC it was CSU-only)
//   · Area 3 is exactly one Arts + one Humanities (IGETC wanted 3 courses)
//   · Area 4 is two courses from two disciplines (IGETC wanted 3)
//   · Area 6 is ETHNIC STUDIES — there is NO language requirement in Cal-GETC
//     (UC's LOTE requirement lives outside the pattern, Standards §9.7.2), so
//     the French-Bac / language modeling applies only on the IGETC path.
// The per-course certified list is DEMO-SEEDED until the ge-patterns drop lands.
export const CALGETC_AREAS: GeArea[] = [
  {
    id: "1A",
    label: "English Composition",
    description: "One course in English composition",
  },
  {
    id: "1B",
    label: "Critical Thinking & Composition",
    description: "One course in critical thinking with emphasis on writing",
  },
  {
    id: "1C",
    label: "Oral Communication",
    description: "One course in oral communication (required for UC and CSU under Cal-GETC)",
  },
  {
    id: "2",
    label: "Mathematical Concepts & Quantitative Reasoning",
    description: "One course in math/quantitative reasoning",
  },
  {
    id: "3A",
    label: "Arts",
    description: "One course in arts",
  },
  {
    id: "3B",
    label: "Humanities",
    description: "One course in humanities",
  },
  {
    id: "4",
    label: "Social & Behavioral Sciences",
    description: "Two courses from at least two disciplines",
    count: 2,
    minDistinctDepts: 2,
  },
  {
    id: "5A",
    label: "Physical Sciences",
    description: "One course in physical sciences",
  },
  {
    id: "5B",
    label: "Biological Sciences",
    description: "One course in biological sciences",
  },
  {
    id: "5C",
    label: "Laboratory Science",
    description: "One lab course (can overlap with 5A or 5B)",
  },
  {
    id: "6",
    label: "Ethnic Studies",
    description: "One course in ethnic studies (or cross-listed with ethnic studies)",
  },
];
