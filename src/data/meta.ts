import type { DataProvenance } from '../types';

// ─── Versioned data snapshot manifest (A1) ───
//
// The product never reads articulation data live: requirement files in this
// directory ARE the snapshot, and this manifest names it. Every audit result,
// audit-log entry, and wrong-answer report carries DATA_VERSION so "what did
// the tool say, based on which data?" is always answerable (F3).
//
// Bump the trailing serial whenever any requirement/catalog file changes.
// When real ASSIST-derived snapshots replace the demo files, the ingestion job
// should rewrite this manifest (and flip per-source `verification` to
// "verified" with a real lastVerified date).
// 2026-06-11: PARTIAL real-data drop ingested (mixed snapshot, hence the
// "assist-partial" tag — NOT the release checklist's clean ecc-ucr.*.assist.1,
// which Sami mints after his verification pass + the remaining drops):
//   REAL & unreviewed — three 2025-26 ASSIST agreements (requirements/*),
//     the agreement-closure course subset in courses.ts, the IGETC 2021-22
//     pattern + tags, exam credits derived from the agreements' AP tables.
//   STILL DEMO — degree/ADT templates, ECC local GE, scholarship seeds, the
//     demo-remnant courses in courses.ts.
// 2026-06-16: Cal-GETC per-course tags for the REAL courses populated from ECC's
//   2025-26 Cal-GETC advisement sheet (real, unreviewed) — CALGETC_SOURCE flipped
//   demo→unreviewed; serial bumped to .2. Demo-remnant courses keep their
//   demo-seeded Cal-GETC tags until the full-catalog atomic swap.
// 2026-07-01 (go-live audit, serial .3): ECC→UCR requirement sets flipped
//   unreviewed→verified (programmatic row match vs the transcribed agreements +
//   the 2026-06-20 hand-check; flip authorized by Sami). Deadlines re-verified
//   against official pages and corrected (UC filing deadline Dec 1 → Nov 30);
//   admit stats replaced with real UC Information Center fall-2025 figures;
//   scholarship list re-checked entry-by-entry (Generation Google removed,
//   ISC2 cybersecurity added, HTCC domain-takeover link fixed); university-side
//   facts for UCLA/UCI/UCSD/CPP verified against official campus pages.
//   Remaining demo/unreviewed surfaces: ECC local-GE + AA/AS + ADT templates
//   (demo), demo-remnant courses, IGETC/Cal-GETC transcriptions (real,
//   unreviewed), upper-division estimates. See GO_LIVE_CHECKLIST.md.
// 2026-07-01 (session 2): THE ATOMIC SWAP (HANDOFF_CLAUDE_CODE.md release
//   checklist) — full real ECC catalog closure (190 courses: the verified
//   112-row closure + 78 catalog-transcribed additions), REAL local-GE pattern
//   (areas 1A/1B/2–7 + per-course tags from the catalog's certified lists),
//   REAL degree templates (Business Management AS; Psychology AA-T; Business
//   Administration 2.0 AS-T; CS honestly null — ECC confers no CS degree),
//   REAL ECC AP exam table (33 rows), demo-remnant courses deleted, golden
//   expectations re-derived by hand. Serial moves off "assist-partial" to the
//   release checklist's clean tag.
// 2026-07-03 (majors expansion, HANDOFF_CLAUDE_CODE_MAJORS.md): MajorId 3→13
//   (top-10 by transfer volume, ECC→UCR/CPP pilot); 20 new ASSIST 2025-26
//   agreements (unreviewed until the diff harness re-checks them); 6 real ECC
//   ADT templates + Biology/Pre-Engineering AS; catalog 190→225 courses;
//   Major Switch Explorer (majorSwitch engine + Result matrix).
// 2026-07-06 (all-college majors expansion, docs/archive/EXPANSION_2026-07-06.md): every
//   modeled major wired at every ready campus for all 20 colleges — 1,017 ASSIST
//   2025-26 agreements pulled from the live API (unreviewed until the diff
//   harness + human pass re-check them). Catalog seeds extended to cover every
//   new sending course; ECC ANTH 3 (Intro to Archaeology) added to the closure
//   (real, in the 2025-26 catalog; articulates to UCI ANTHRO 2C). Serial → .2.
// 2026-07-06 (verified flip, authorized by Sami): 857 of the 1,037 unreviewed
//   agreements flipped to 'verified' — evidence: same-day live-API pull,
//   self-audit 0 HIGH, cross-college required-flag consistency, and a full live
//   Firecrawl re-diff of Sierra College (64 agreements; every campus/major
//   shape) whose 3 HIGH findings were all differ artifacts. 180 HELD BACK
//   (9 campus|major clusters × 20 colleges) where the batch transform skipped
//   real major-side receiving cells: UCI film/polisci/soc/mech/bio/econ/
//   public-health-sciences (math + additional-prep + humanities sections) and
//   UCLA soc/comm (stats-alternative cells) — see DATA_COMPLETION_PUNCHLIST.
//   Serial → .3.
// 2026-07-07 (skipped-section gap closed): the 180 held agreements re-transformed
//   with Requirement-category cells emitted as receiving.code:null rows — sending
//   articulations recovered from the 2026-07-06 compact pulls (intact on disk;
//   only category titles were dropped by the old in-browser reducer), titles/notes
//   re-pulled live from the ASSIST API (Sierra keys; receiving side is
//   college-independent per cluster, all OR-group counts matched). Per-agreement
//   gates: new code-set ⊇ old (0 regressions/180), category count == cluster spec,
//   all 16 Sierra category rows checked against the 2026-07-06 live Firecrawl
//   captures (197/197 sending codes). Catalog seeds +1,244 courses (19 colleges);
//   ECC closure +23 courses verified against the official 2025-26 catalog
//   extraction. All 180 flipped to 'verified'. Serial → .4.
// Serial → .5 (2026-08-21): every one of the 4,247 ASSIST agreements re-pulled
// and re-transformed after two defects were found in the transform — `required`
// was read from a subject label ("CHEMISTRY") rather than the qualifying
// heading above it ("REQUIRED FOR ADMISSION" / "ADDITIONAL MAJOR PREPARATION"),
// and a mandatory "Complete A or B" emitted every option as optional. 2,406
// agreements changed; 1,090 lost `verification: 'verified'`, because the rows a
// person had read are not the rows now on disk.
// Serial → .6 (2026-08-22): Pasadena City + Mt. SAC transfer-GE closure. Each
// college's own 2025-26 Cal-GETC certified list was finally ingested
// (scripts/ingest/calgetcList.ts) — until now the staged seeds carried areas
// only for the courses an ADT core happens to touch. 205 certified GE courses
// the seeds lacked were added with names/units read from the colleges' own
// 2025-26 catalogs (scripts/ingest/collegeCatalogExpand.ts; per-row source in
// each closure-adds JSON), and PCC's embedded-lab 5C underline marks were
// recovered from the sheet PDF's drawing layer (pccCalgetcUnderlines.ts).
// Result: every Cal-GETC area is satisfiable from both catalogs (PCC 345/510
// tagged, Mt. SAC 277/445). All rows remain verification:'unreviewed'.
export const DATA_VERSION = 'ecc-ucr-cpp.2025-26.assist.majors13.6';

// Agreement/catalog year the current snapshot claims to describe.
// (The IGETC pattern inside it is the 2021-22 sheet — its own provenance
// below carries that year; the mismatch is deliberate and disclosed.)
export const CATALOG_YEAR = '2025–26';

// When the snapshot files were last reviewed against their sources.
export const SNAPSHOT_DATE = '2026-07-01';

// Provenance stamp for a demo-snapshot source. Centralized so flipping the
// whole snapshot to "verified" after a real ingestion run is one change.
export function demoProvenance(sourceName: string, sourceUrl: string): DataProvenance {
  return {
    sourceName,
    sourceUrl,
    catalogYear: CATALOG_YEAR,
    lastVerified: SNAPSHOT_DATE,
    verification: 'demo',
  };
}

// Provenance for data read off the REAL official source but not yet checked by
// a human (Sami's verification pass flips these to 'verified' — never the code).
export function unreviewedProvenance(
  sourceName: string,
  sourceUrl: string,
  catalogYear: string,
  accessedOn: string,
): DataProvenance {
  return { sourceName, sourceUrl, catalogYear, lastVerified: accessedOn, verification: 'unreviewed' };
}

// The articulation agreements themselves. The per-agreement provenance lives
// on each RequirementSet.meta; this is the SNAPSHOT-level record, so a surface
// that wants to say "here is where the requirement data comes from" without
// pulling in the whole requirements registry has something honest to cite.
// Year + date + status match the .4 pass described under DATA_VERSION above
// (all 180 agreements flipped to 'verified' against the live ASSIST API).
export const AGREEMENTS_SOURCE: DataProvenance = {
  sourceName: 'ASSIST articulation agreements (statewide CCC → UC/CSU)',
  sourceUrl: 'https://assist.org',
  catalogYear: CATALOG_YEAR,
  lastVerified: '2026-07-07',
  verification: 'verified',
};

// The ECC course catalog itself (course codes, units, GE mappings). REAL
// post-swap (2026-07-01): the 112-row agreement/GE closure was human-verified
// against the catalog 2026-06-20; the later tranches (degree cores, exam
// grants, expansion-agreement codes, local-GE certified sets) were machine-
// transcribed from the official 2025-26 catalog extraction.
// VERIFIED 2026-07-07: every row (254) re-checked code+name+units against
// data-sources/ecc-catalog/ecc-catalog-2025-26.extracted.md — 252 exact,
// 2 apparent diffs proven extraction column-glue artifacts (BIOL 120H 5u at
// extraction L6252, HDEV 110H 3u at L4632); 3 cosmetic name normalizations
// applied (MATH 180 "Precalculus", PSYC/SOCI 109A "…for the Behavioral
// Sciences"). GE tags verified separately — see IGETC_SOURCE/CALGETC_SOURCE.
export const CATALOG_SOURCE: DataProvenance = {
  sourceName: 'El Camino College 2025–26 Catalog (full agreement/GE/degree closure)',
  sourceUrl: 'https://www.elcamino.edu/academics/catalog/',
  catalogYear: '2025–26',
  lastVerified: '2026-07-07',
  verification: 'verified',
};

// The IGETC pattern definition + ECC certified-course tags: REAL, transcribed
// from El Camino's IGETC sheet (data-sources/ge-patterns/) on 2026-06-11. The
// sheet was provided as a PDF; its original download URL is unconfirmed, so the
// URL cites the publishing office (ECC Transfer Center).
// catalogYear is the sheet's printed year (2021–22). An ECC Transfer Center rep
// confirmed (2026-06-14) this is the CURRENT, authoritative ECC IGETC sheet —
// ECC hasn't issued a newer IGETC edition (IGETC is being phased out for
// Cal-GETC) — so the year is correct, not stale. See the igetc.ts header for
// specifics (Ethnic Studies sits in Area 4; pre-CCN "(formerly X)" numbering).
// VERIFIED 2026-07-07 (transcription check + completion): all 206 course-area
// tags justified line-by-line against the sheet extraction (pre-CCN aliases:
// ENGL C1000=1A, C1001=1C, STAT C1000=MATH 150, PSYC C1000=101, POLS C1000=1,
// BIOL 110/120/130=102/101/103; two-column layout mechanically de-interleaved);
// 103 missing tags added (areas 3A/3B/4 were largely untranscribed) + the
// synthetic Area-3 total tag + 41 lab (5C) tags taken from the current
// advisement sheet's underline marks (recovered programmatically from the
// Cal-GETC PDF's vector strokes — the 2021-22 PDF's own underlines don't
// survive). Known sheet conditionals NOT modeled (disclosed in igetc.ts):
// MATH 115 counts only if taken before fall 2017; placement follows the list
// in effect when a course was taken.
export const IGETC_SOURCE: DataProvenance = {
  sourceName: 'IGETC pattern + ECC certified course list (2021–2022 sheet)',
  sourceUrl: 'https://www.elcamino.edu/academics/transfer-center/',
  catalogYear: '2021–22',
  lastVerified: '2026-07-07',
  verification: 'verified',
};

// The Cal-GETC pattern definition (ICAS Standards) + ECC's certified course list.
// The AREA STRUCTURE was transcribed from the official standards on 2026-06-10;
// the per-course certified tags come from ECC's 2025-26 Cal-GETC advisement
// sheet (data-sources/ge-patterns/calgetc-ecc-list-2025-26.pdf).
// VERIFIED 2026-07-07 (transcription check + completion): all 203 course-area
// tags justified against the sheet extraction (202 exact; ENGL C1001H via the
// sheet's own "C10001H (formerly 1CH)" typo — intent unambiguous, confirmed on
// the PDF); 81 missing tags added (sheet-certified courses that entered the
// closure after the 06-16 pass); 5C lab tags made EXACTLY the sheet's
// underline set, recovered programmatically from the PDF's vector strokes
// (41 courses; 3 overstated 5C tags removed: GEOL 3, GEOL 4, BIOL 18).
export const CALGETC_SOURCE: DataProvenance = {
  sourceName: 'Cal-GETC pattern (ICAS Standards v1.3) + ECC certified list (2025–26 sheet)',
  sourceUrl: 'https://www.elcamino.edu/academics/transfer-center/',
  catalogYear: '2025–26',
  lastVerified: '2026-07-07',
  verification: 'verified',
};
