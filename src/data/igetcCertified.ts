// ECC's IGETC certified course lists — codes only, per area, transcribed
// 2026-06-11 from the El Camino IGETC 2021-2022 sheet
// (data-sources/ge-patterns/igetc-ecc-list-2021-22.pdf). 'unreviewed';
// provenance = IGETC_SOURCE in meta.ts. See the igetc.ts header for the
// sheet-vintage caveats (no Area 7, pre-CCN numbering).
//
// Role: the source-backed registry of certifiable courses BEYOND the catalog
// snapshot. Requirement options may reference these codes (they audit as
// 'unknown' until the catalog drop adds the courses); the integrity suite
// accepts an option iff it resolves in catalog ∪ these lists — so misspelled
// references still fail the gate.
//
// Code spelling rule: if the course exists in courses.ts, its catalog code is
// used (e.g. "PHYS 1A", "MATH 190" — ASSIST's printed form). Courses not yet
// in the catalog carry the SHEET's printed discipline name (e.g.
// "ANATOMY 30", "CHEMISTRY 1A") — the catalog CSV drop must normalize these
// to ASSIST codes and update both files in the same commit.
//
// Footnote markers (£, ∞, ↓ = "only if taken after term X", parenthesized =
// discontinued) are STRIPPED here; the vintage rules they encode are not yet
// modeled. The full marked-up lists live in
// data-sources/ge-patterns/igetc-ecc-list-2021-22.extracted.md.

export const IGETC_CERTIFIED_CODES: Record<string, string[]> = {
  '1A': ['ENGLISH 1A', 'ENGLISH 1AH',
    // Post-swap normalization (2026-07-01): catalog-code spellings for this
    // area's certified courses now live in courses.ts (closure CSV, verified 2026-06-20).
    'ENGL C1000', 'ENGL C1000H',
  ],
  '1B': ['ENGLISH 1C', 'ENGLISH 1CH', 'PHILOSOPHY 105', 'PHILOSOPHY 105H', 'PSYCHOLOGY 103', 'PSYCHOLOGY 103H',
    // Post-swap normalization (2026-07-01): catalog-code spellings for this
    // area's certified courses now live in courses.ts (closure CSV, verified 2026-06-20).
    'ENGL C1001', 'ENGL C1001H', 'PHIL 105', 'PHIL 105H', 'PSYC 103', 'PSYC 103H',
  ],
  '1C': ['COMMUNICATION STUDIES 100', 'COMMUNICATION STUDIES 120', 'COMMUNICATION STUDIES 130', 'COMMUNICATION STUDIES 140',
    // Post-swap normalization (2026-07-01): catalog-code spellings for this
    // area's certified courses now live in courses.ts (closure CSV, verified 2026-06-20).
    'COMM C1000', 'COMS 120', 'COMM C1004', 'COMS 140',
  ],
  '2A': [
    // MATH 115 only if taken before fall 2017; 160/161 printed as discontinued.
    'MATH 115', 'MATH 120', 'MATH 130', 'MATH 140', 'MATH 150', 'MATH 150H',
    'MATH 165', 'MATH 180', 'MATH 190', 'MATH 191', 'MATH 210', 'MATH 220', 'MATH 270',
    'COMMUNICATION STUDIES 180',
    // Sheet prints the former number "PSYCHOLOGY 9A"; today's course is PSYC 109A.
    'PSYC 109A', 'SOCI 109A',
    // CCN renumber of the sheet's MATH 150 (intro statistics).
    'STAT C1000',
    // Post-swap normalization (2026-07-01): catalog-code spellings for this
    // area's certified courses now live in courses.ts (closure CSV, verified 2026-06-20).
    'COMS 180', 'STAT C1000H',
  ],
  '5A': [
    'ASTRONOMY 12', 'ASTRONOMY 20', 'ASTRONOMY 20H', 'ASTRONOMY 25', 'ASTRONOMY 25H',
    'CHEMISTRY 1A', 'CHEMISTRY 1B', 'CHEMISTRY 4', 'CHEMISTRY 4H', 'CHEMISTRY 7A', 'CHEMISTRY 7B',
    'CHEMISTRY 20', 'CHEMISTRY 21A', 'CHEMISTRY 21B',
    'GEOGRAPHY 1', 'GEOGRAPHY 6', 'GEOGRAPHY 9',
    'GEOLOGY 1', 'GEOLOGY 2', 'GEOLOGY 3', 'GEOLOGY 4', 'GEOLOGY 7', 'GEOLOGY 15',
    'GEOLOGY 30', 'GEOLOGY 32', 'GEOLOGY 34', 'GEOLOGY 36',
    'OCEANOGRAPHY 10', 'OCEANOGRAPHY 10H', 'PHYSICAL SCIENCE 25',
    'PHYS 1A', 'PHYS 1B', 'PHYS 1C', 'PHYSICS 1D', 'PHYSICS 2A', 'PHYSICS 2B',
    'PHYSICS 3A', 'PHYSICS 3B', 'PHYSICS 11', 'PHYSICS 12',
    // Post-swap normalization (2026-07-01): catalog-code spellings for this
    // area's certified courses now live in courses.ts (closure CSV, verified 2026-06-20).
    'ASTR 12', 'ASTR 20', 'ASTR 20H', 'ASTR 25', 'ASTR 25H', 'CHEM 1A', 'CHEM 1B', 'CHEM 20', 'CHEM 21A', 'CHEM 21B', 'CHEM 4', 'CHEM 4H', 'CHEM 7A', 'CHEM 7B', 'GEOG 1', 'GEOG 6', 'GEOG 9', 'GEOL 1', 'GEOL 15', 'GEOL 2', 'GEOL 3', 'GEOL 30', 'GEOL 32', 'GEOL 34', 'GEOL 36', 'GEOL 4', 'GEOL 7', 'OCEA 10', 'OCEA 10H', 'PHYS 11', 'PHYS 1D', 'PHYS 2A', 'PHYS 2B', 'PHYS 3A', 'PHYS 3B', 'PSCI 25',
  ],
  '5B': [
    'ANATOMY 30', 'ANATOMY 32', 'ANATOMY AND PHYSIOLOGY 34A', 'ANATOMY AND PHYSIOLOGY 34B',
    'ANTHROPOLOGY 1', 'ANTHROPOLOGY 1H', 'ANTHROPOLOGY 5',
    'BIOLOGY 8', 'BIOLOGY 10', 'BIOLOGY 10H', 'BIOLOGY 11', 'BIOLOGY 15', 'BIOLOGY 16',
    'BIOLOGY 17', 'BIOLOGY 18', 'BIOLOGY 101', 'BIOLOGY 101H', 'BIOLOGY 102', 'BIOLOGY 102H', 'BIOLOGY 103',
    'MICROBIOLOGY 33', 'PHYSIOLOGY 31', 'PSYCHOLOGY 107',
    // Post-swap normalization (2026-07-01): catalog-code spellings for this
    // area's certified courses now live in courses.ts (closure CSV, verified 2026-06-20).
    'ANAT 30', 'ANAT 32', 'ANTH 1', 'ANTH 1H', 'ANTH 5', 'APHY 34A', 'APHY 34B', 'BIOL 10', 'BIOL 10H', 'BIOL 11', 'BIOL 110', 'BIOL 110H', 'BIOL 120', 'BIOL 120H', 'BIOL 130', 'BIOL 15', 'BIOL 16', 'BIOL 17', 'BIOL 18', 'BIOL 8', 'MICR 33', 'PHYO 31', 'PSYC 107',
  ],
  // 5C intentionally ABSENT: the sheet marks lab courses by underline and the
  // underlines did not survive into this PDF's text layer (verified). Do not
  // guess — the current-year sheet drop fills this in.
  '6': [
    'CHINESE 1', 'FRENCH 1', 'GERMAN 1', 'ITALIAN 1', 'JAPANESE 1',
    'SIGN LANGUAGE 111', 'SPANISH 1', 'SPANISH 1H', 'SPANISH 52A', 'SPANISH 52B',
    // Post-swap normalization (2026-07-01): catalog-code spellings for this
    // area's certified courses now live in courses.ts (closure CSV, verified 2026-06-20).
    'CHIN 1', 'FREN 1', 'GERM 1', 'ITAL 1', 'JAPA 1', 'ASL 111', 'SPAN 1', 'SPAN 1H', 'SPAN 52A', 'SPAN 52B',
  ],
  // Areas 3A/3B/4 are large; transcribe on demand from the extracted sheet —
  // nothing references them as requirement options yet.
};

const ALL = new Set<string>();
for (const codes of Object.values(IGETC_CERTIFIED_CODES)) {
  for (const c of codes) ALL.add(c);
}

// Catalog-external but source-backed: the integrity suite accepts requirement
// options that resolve here (they audit as 'unknown' until the catalog grows).
export const IGETC_CERTIFIED_ALL_CODES: ReadonlySet<string> = ALL;
