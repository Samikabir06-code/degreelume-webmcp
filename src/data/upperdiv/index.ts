import type { MajorId, SchoolId, UpperDivRequirementSet } from '../../types';

// The slice carries NO post-transfer upper-division data.
//
// Upper-division requirement sets describe the degree AFTER transfer, at the
// destination campus. None were copied into this build (docs/PLAN.md), so the
// lookup returns null and runAudit simply produces no upper-division plan —
// the same path a campus without a transcribed catalog already takes.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getUpperDiv(_school: SchoolId, _major: MajorId | ''): UpperDivRequirementSet | null {
  return null;
}

// Which (school, major) pairs have upper-division data. Empty here, honestly.
export function upperDivOfferings(): { school: SchoolId; major: MajorId }[] {
  return [];
}
