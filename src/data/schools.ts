import type { SchoolId, SchoolMeta } from '../types';

// The two tiers described below, as data rather than prose.
//
// This list used to live inside Colleges.tsx, where it was the ONLY place the
// split existed — so the landing page, which had no access to it, announced all
// 17 ready campuses as "verified" while the coverage page correctly said 6.
// One source now, and any surface that wants to talk about verification counts
// reads it. Changing a tier is an edit here, not in a component.
export const FULLY_VERIFIED_SCHOOLS: ReadonlySet<SchoolId> = new Set<SchoolId>([
  'ucr', 'uci', 'ucla', 'uc-san-diego', 'uc-berkeley', 'cal-poly-pomona',
]);

// Target-university registry — all 9 UC + 22 CSU campuses (Cal Maritime merged into
// Cal Poly SLO on 2025-07-01, so CSU is 22, not 23). `system` drives the engine's
// UC-vs-CSU GE/verdict paths.
//
// `ready` means "a student can plan against this campus today". It does NOT by
// itself mean every row has been read by a human — that claim lives per
// requirement set, in RequirementSet.meta.verification, and every plan surfaces
// it. Two tiers are live:
//
//   FULLY VERIFIED (agreements human-checked + facts verified):
//     UC Riverside (V1 reference) · UCLA · UC Irvine · UC San Diego ·
//     UC Berkeley · Cal Poly Pomona
//
//   FACTS VERIFIED, AGREEMENTS MACHINE-TRANSCRIBED (added 2026-08-19):
//     UC Santa Barbara · UC Davis · CSU Long Beach · CSU Northridge ·
//     CSU Dominguez Hills · CSU Fullerton · San Diego State ·
//     San José State · CSU Sacramento · CSU Los Angeles · San Francisco State
//     Their gpaTarget/impaction/ADT facts were read from official campus pages;
//     their course rows came off ASSIST's API through scripts/assist-transform
//     and carry verification:'unreviewed' until a human pass. Students see that
//     on the plan — it is a real state the product already models, not a gap.
//     To promote one after reviewing it: flip its agreement JSONs to
//     verification:'verified' with a verifiedOn date and re-run
//     `npx tsx scripts/gen-demo-requirements.ts`.
//
// Every other campus is STAGED (no agreements/facts yet) → ready:false.
//
// Most ids ARE the data-sources facts slug (universities/<slug>/). The legacy V1 ids
// differ and map as follows (the WI3/WI4 facts ingest uses this mapping):
//   ucr → uc-riverside · uci → uc-irvine · ucla → ucla ·
//   csulb → csu-long-beach · csudh → csu-dominguez-hills · csula → csu-los-angeles
export const SCHOOLS: SchoolMeta[] = [
  // ─── UC (9) ───
  { id: "ucr", name: "UC Riverside", shortName: "UCR", system: "UC", ready: true, city: "Riverside", state: "CA" },
  { id: "uci", name: "UC Irvine", shortName: "UCI", system: "UC", ready: true, city: "Irvine", state: "CA" }, // verified articulation + facts (2026-07-01)
  { id: "ucla", name: "UC Los Angeles", shortName: "UCLA", system: "UC", ready: true, city: "Los Angeles", state: "CA" }, // verified articulation + facts (2026-07-01)
  // SEMESTER, not quarter like the rest of the UCs — ASSIST prints "2025-2026
  // General Catalog, Semester" on every Berkeley agreement.
  { id: "uc-berkeley", name: "UC Berkeley", shortName: "UCB", system: "UC", calendar: "semester", ready: true, city: "Berkeley", state: "CA" }, // verified articulation + facts (2026-08-18)
  { id: "uc-davis", name: "UC Davis", shortName: "UCD", system: "UC", ready: true, city: "Davis", state: "CA" }, // facts verified 2026-08-19; agreements machine-transcribed
  { id: "uc-merced", name: "UC Merced", shortName: "UCM", system: "UC", ready: false },
  { id: "uc-san-diego", name: "UC San Diego", shortName: "UCSD", system: "UC", ready: true, city: "La Jolla", state: "CA" }, // verified articulation + facts (2026-07-01)
  { id: "uc-santa-barbara", name: "UC Santa Barbara", shortName: "UCSB", system: "UC", ready: true, city: "Santa Barbara", state: "CA" }, // facts verified 2026-08-19; agreements machine-transcribed
  { id: "uc-santa-cruz", name: "UC Santa Cruz", shortName: "UCSC", system: "UC", ready: false },

  // ─── CSU (22) ───
  { id: "csulb", name: "Cal State Long Beach", shortName: "CSULB", system: "CSU", ready: true, city: "Long Beach", state: "CA" }, // facts verified 2026-08-19; agreements machine-transcribed
  { id: "csudh", name: "Cal State Dominguez Hills", shortName: "CSUDH", system: "CSU", ready: true, city: "Carson", state: "CA" }, // facts verified 2026-08-19; agreements machine-transcribed
  { id: "csula", name: "Cal State Los Angeles", shortName: "CSULA", system: "CSU", ready: true, city: "Los Angeles", state: "CA" }, // facts verified 2026-08-19; agreements machine-transcribed
  { id: "csu-bakersfield", name: "CSU Bakersfield", shortName: "CSUB", system: "CSU", ready: false },
  { id: "csu-channel-islands", name: "CSU Channel Islands", shortName: "CSUCI", system: "CSU", ready: false },
  { id: "csu-chico", name: "CSU Chico", shortName: "Chico", system: "CSU", ready: false },
  { id: "csu-east-bay", name: "CSU East Bay", shortName: "CSUEB", system: "CSU", ready: false },
  { id: "csu-fresno", name: "CSU Fresno", shortName: "Fresno", system: "CSU", ready: false },
  { id: "csu-fullerton", name: "CSU Fullerton", shortName: "CSUF", system: "CSU", ready: true, city: "Fullerton", state: "CA" }, // facts verified 2026-08-19; agreements machine-transcribed
  { id: "cal-poly-humboldt", name: "Cal Poly Humboldt", shortName: "Humboldt", system: "CSU", ready: false },
  { id: "csu-monterey-bay", name: "CSU Monterey Bay", shortName: "CSUMB", system: "CSU", ready: false },
  { id: "csu-northridge", name: "CSU Northridge", shortName: "CSUN", system: "CSU", ready: true, city: "Northridge", state: "CA" }, // facts verified 2026-08-19; agreements machine-transcribed
  { id: "cal-poly-pomona", name: "Cal Poly Pomona", shortName: "CPP", system: "CSU", ready: true, city: "Pomona", state: "CA" }, // verified articulation + facts (2026-07-01)
  { id: "csu-sacramento", name: "CSU Sacramento", shortName: "Sac State", system: "CSU", ready: true, city: "Sacramento", state: "CA" }, // facts verified 2026-08-19; agreements machine-transcribed
  { id: "csu-san-bernardino", name: "CSU San Bernardino", shortName: "CSUSB", system: "CSU", ready: false },
  { id: "san-diego-state", name: "San Diego State", shortName: "SDSU", system: "CSU", ready: true, city: "San Diego", state: "CA" }, // facts verified 2026-08-19; agreements machine-transcribed
  { id: "sf-state", name: "San Francisco State", shortName: "SFSU", system: "CSU", ready: true, city: "San Francisco", state: "CA" }, // facts verified 2026-08-19; agreements machine-transcribed
  { id: "san-jose-state", name: "San José State", shortName: "SJSU", system: "CSU", ready: true, city: "San José", state: "CA" }, // facts verified 2026-08-19; agreements machine-transcribed
  { id: "cal-poly-slo", name: "Cal Poly San Luis Obispo", shortName: "Cal Poly SLO", system: "CSU", ready: false },
  { id: "csu-san-marcos", name: "CSU San Marcos", shortName: "CSUSM", system: "CSU", ready: false },
  { id: "sonoma-state", name: "Sonoma State", shortName: "SSU", system: "CSU", ready: false },
  { id: "csu-stanislaus", name: "CSU Stanislaus", shortName: "Stanislaus", system: "CSU", ready: false },
];

export const getSchool = (id: string) => SCHOOLS.find((s) => s.id === id);
