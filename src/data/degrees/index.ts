import type { AdtTemplate, AssociateDegree, MajorChoice } from '../../types';

// The slice carries NO degree data.
//
// This build answers transfer questions (docs/PLAN.md): which El Camino courses
// carry to which UC/CSU campus for which major. El Camino's own AA/AS templates
// and its AA-T/AS-T (ADT) templates are a different data set, and none of it was
// copied into this repo — so both lookups return null and the engine takes its
// documented "no degree audit" path. Returning an empty template instead would
// be a claim about a degree we hold no rows for.
//
// The functions exist because the copied engine and its tests import them; the
// shape is the main product's so a future drop is a data change, not a rewrite.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getAssociateDegree(_major: MajorChoice): AssociateDegree | null {
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getAdtTemplate(_major: MajorChoice): AdtTemplate | null {
  return null;
}

// An ADT template is "live" once its official core is transcribed. Nothing here
// is, so this is always false and the engine keeps its articulation-prep
// approximation, clearly flagged, exactly as it does for a college whose
// template has not landed.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function adtTemplateIsLive(_major: MajorChoice): boolean {
  return false;
}
