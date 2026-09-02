import type { RequirementSet, SchoolId, MajorChoice, CollegeId } from '../../types';
import { UCR_BUSINESS } from './ucr.business';
import { UCR_CS } from './ucr.cs';
import { UCR_PSYCH } from './ucr.psych';
import { UCR_PSYCH_EXTRAS } from './ucr.psych.extras';
import { REQ_ECC_CAL_POLY_POMONA_BUSINESS } from './ecc.cal-poly-pomona.business';
import { REQ_ECC_CAL_POLY_POMONA_CS } from './ecc.cal-poly-pomona.cs';
import { REQ_ECC_CAL_POLY_POMONA_PSYCH } from './ecc.cal-poly-pomona.psych';
import { REQ_ECC_CSU_FULLERTON_BUSINESS } from './ecc.csu-fullerton.business';
import { REQ_ECC_CSU_FULLERTON_CS } from './ecc.csu-fullerton.cs';
import { REQ_ECC_CSU_FULLERTON_PSYCH } from './ecc.csu-fullerton.psych';
import { REQ_ECC_CSU_NORTHRIDGE_BUSINESS } from './ecc.csu-northridge.business';
import { REQ_ECC_CSU_NORTHRIDGE_CS } from './ecc.csu-northridge.cs';
import { REQ_ECC_CSU_NORTHRIDGE_PSYCH } from './ecc.csu-northridge.psych';
import { REQ_ECC_CSU_SACRAMENTO_BUSINESS } from './ecc.csu-sacramento.business';
import { REQ_ECC_CSU_SACRAMENTO_CS } from './ecc.csu-sacramento.cs';
import { REQ_ECC_CSU_SACRAMENTO_PSYCH } from './ecc.csu-sacramento.psych';
import { REQ_ECC_CSUDH_BUSINESS } from './ecc.csudh.business';
import { REQ_ECC_CSUDH_CS } from './ecc.csudh.cs';
import { REQ_ECC_CSUDH_PSYCH } from './ecc.csudh.psych';
import { REQ_ECC_CSULA_BUSINESS } from './ecc.csula.business';
import { REQ_ECC_CSULA_CS } from './ecc.csula.cs';
import { REQ_ECC_CSULA_PSYCH } from './ecc.csula.psych';
import { REQ_ECC_CSULB_BUSINESS } from './ecc.csulb.business';
import { REQ_ECC_CSULB_CS } from './ecc.csulb.cs';
import { REQ_ECC_CSULB_PSYCH } from './ecc.csulb.psych';
import { REQ_ECC_SAN_DIEGO_STATE_BUSINESS } from './ecc.san-diego-state.business';
import { REQ_ECC_SAN_DIEGO_STATE_CS } from './ecc.san-diego-state.cs';
import { REQ_ECC_SAN_DIEGO_STATE_PSYCH } from './ecc.san-diego-state.psych';
import { REQ_ECC_SAN_JOSE_STATE_BUSINESS } from './ecc.san-jose-state.business';
import { REQ_ECC_SAN_JOSE_STATE_CS } from './ecc.san-jose-state.cs';
import { REQ_ECC_SAN_JOSE_STATE_PSYCH } from './ecc.san-jose-state.psych';
import { REQ_ECC_SF_STATE_BUSINESS } from './ecc.sf-state.business';
import { REQ_ECC_SF_STATE_CS } from './ecc.sf-state.cs';
import { REQ_ECC_SF_STATE_PSYCH } from './ecc.sf-state.psych';
import { REQ_ECC_UC_BERKELEY_BUSINESS } from './ecc.uc-berkeley.business';
import { REQ_ECC_UC_BERKELEY_CS } from './ecc.uc-berkeley.cs';
import { REQ_ECC_UC_BERKELEY_PSYCH } from './ecc.uc-berkeley.psych';
import { REQ_ECC_UC_DAVIS_BUSINESS } from './ecc.uc-davis.business';
import { REQ_ECC_UC_DAVIS_CS } from './ecc.uc-davis.cs';
import { REQ_ECC_UC_DAVIS_PSYCH } from './ecc.uc-davis.psych';
import { REQ_ECC_UC_SAN_DIEGO_BUSINESS } from './ecc.uc-san-diego.business';
import { REQ_ECC_UC_SAN_DIEGO_CS } from './ecc.uc-san-diego.cs';
import { REQ_ECC_UC_SAN_DIEGO_PSYCH } from './ecc.uc-san-diego.psych';
import { REQ_ECC_UC_SANTA_BARBARA_BUSINESS } from './ecc.uc-santa-barbara.business';
import { REQ_ECC_UC_SANTA_BARBARA_CS } from './ecc.uc-santa-barbara.cs';
import { REQ_ECC_UC_SANTA_BARBARA_PSYCH } from './ecc.uc-santa-barbara.psych';
import { REQ_ECC_UCI_BUSINESS } from './ecc.uci.business';
import { REQ_ECC_UCI_CS } from './ecc.uci.cs';
import { REQ_ECC_UCI_PSYCH } from './ecc.uci.psych';
import { REQ_ECC_UCLA_BUSINESS } from './ecc.ucla.business';
import { REQ_ECC_UCLA_CS } from './ecc.ucla.cs';
import { REQ_ECC_UCLA_PSYCH } from './ecc.ucla.psych';

// ─── The requirement registry for THIS build's data slice ───────────────────
//
// The main product's index imports 4,265 generated agreement files (20 sending
// colleges × 17 campuses × 13 majors). This build ships ONE sending college —
// El Camino — and the three majors the slice carries data for, so the registry
// is written out by hand here: 48 generated ECC agreements plus the four
// hand-authored UC Riverside files.
//
// The KEY SHAPE and the resolution semantics are unchanged from the main
// product (`<college>|<school>|<major>`, ECC-only): a college we hold no
// agreements for must never inherit El Camino's articulation, and "nothing
// chosen yet" is an honest null rather than an error.

// Psychology at UC Riverside = generated articulation rows + the hand-authored
// prose requirements (bio / physical science / two additional), which ASSIST
// prints as prose rather than as articulation rows. Composed here exactly as
// the main product composes it — ORDER MATTERS, because the audit consumes
// courses in row order and the math select-group must consume its course
// before the additional rows look at it (the agreement's own
// no-double-counting rule).
const UCR_PSYCH_FULL: RequirementSet = {
  ...UCR_PSYCH,
  majorPrep: [...UCR_PSYCH.majorPrep, ...UCR_PSYCH_EXTRAS],
};

const REGISTRY: Record<string, RequirementSet> = {
  'ecc|cal-poly-pomona|business': REQ_ECC_CAL_POLY_POMONA_BUSINESS,
  'ecc|cal-poly-pomona|cs': REQ_ECC_CAL_POLY_POMONA_CS,
  'ecc|cal-poly-pomona|psych': REQ_ECC_CAL_POLY_POMONA_PSYCH,
  'ecc|csu-fullerton|business': REQ_ECC_CSU_FULLERTON_BUSINESS,
  'ecc|csu-fullerton|cs': REQ_ECC_CSU_FULLERTON_CS,
  'ecc|csu-fullerton|psych': REQ_ECC_CSU_FULLERTON_PSYCH,
  'ecc|csu-northridge|business': REQ_ECC_CSU_NORTHRIDGE_BUSINESS,
  'ecc|csu-northridge|cs': REQ_ECC_CSU_NORTHRIDGE_CS,
  'ecc|csu-northridge|psych': REQ_ECC_CSU_NORTHRIDGE_PSYCH,
  'ecc|csu-sacramento|business': REQ_ECC_CSU_SACRAMENTO_BUSINESS,
  'ecc|csu-sacramento|cs': REQ_ECC_CSU_SACRAMENTO_CS,
  'ecc|csu-sacramento|psych': REQ_ECC_CSU_SACRAMENTO_PSYCH,
  'ecc|csudh|business': REQ_ECC_CSUDH_BUSINESS,
  'ecc|csudh|cs': REQ_ECC_CSUDH_CS,
  'ecc|csudh|psych': REQ_ECC_CSUDH_PSYCH,
  'ecc|csula|business': REQ_ECC_CSULA_BUSINESS,
  'ecc|csula|cs': REQ_ECC_CSULA_CS,
  'ecc|csula|psych': REQ_ECC_CSULA_PSYCH,
  'ecc|csulb|business': REQ_ECC_CSULB_BUSINESS,
  'ecc|csulb|cs': REQ_ECC_CSULB_CS,
  'ecc|csulb|psych': REQ_ECC_CSULB_PSYCH,
  'ecc|san-diego-state|business': REQ_ECC_SAN_DIEGO_STATE_BUSINESS,
  'ecc|san-diego-state|cs': REQ_ECC_SAN_DIEGO_STATE_CS,
  'ecc|san-diego-state|psych': REQ_ECC_SAN_DIEGO_STATE_PSYCH,
  'ecc|san-jose-state|business': REQ_ECC_SAN_JOSE_STATE_BUSINESS,
  'ecc|san-jose-state|cs': REQ_ECC_SAN_JOSE_STATE_CS,
  'ecc|san-jose-state|psych': REQ_ECC_SAN_JOSE_STATE_PSYCH,
  'ecc|sf-state|business': REQ_ECC_SF_STATE_BUSINESS,
  'ecc|sf-state|cs': REQ_ECC_SF_STATE_CS,
  'ecc|sf-state|psych': REQ_ECC_SF_STATE_PSYCH,
  'ecc|uc-berkeley|business': REQ_ECC_UC_BERKELEY_BUSINESS,
  'ecc|uc-berkeley|cs': REQ_ECC_UC_BERKELEY_CS,
  'ecc|uc-berkeley|psych': REQ_ECC_UC_BERKELEY_PSYCH,
  'ecc|uc-davis|business': REQ_ECC_UC_DAVIS_BUSINESS,
  'ecc|uc-davis|cs': REQ_ECC_UC_DAVIS_CS,
  'ecc|uc-davis|psych': REQ_ECC_UC_DAVIS_PSYCH,
  'ecc|uc-san-diego|business': REQ_ECC_UC_SAN_DIEGO_BUSINESS,
  'ecc|uc-san-diego|cs': REQ_ECC_UC_SAN_DIEGO_CS,
  'ecc|uc-san-diego|psych': REQ_ECC_UC_SAN_DIEGO_PSYCH,
  'ecc|uc-santa-barbara|business': REQ_ECC_UC_SANTA_BARBARA_BUSINESS,
  'ecc|uc-santa-barbara|cs': REQ_ECC_UC_SANTA_BARBARA_CS,
  'ecc|uc-santa-barbara|psych': REQ_ECC_UC_SANTA_BARBARA_PSYCH,
  'ecc|uci|business': REQ_ECC_UCI_BUSINESS,
  'ecc|uci|cs': REQ_ECC_UCI_CS,
  'ecc|uci|psych': REQ_ECC_UCI_PSYCH,
  'ecc|ucla|business': REQ_ECC_UCLA_BUSINESS,
  'ecc|ucla|cs': REQ_ECC_UCLA_CS,
  'ecc|ucla|psych': REQ_ECC_UCLA_PSYCH,
  'ecc|ucr|business': UCR_BUSINESS,
  'ecc|ucr|cs': UCR_CS,
  'ecc|ucr|psych': UCR_PSYCH_FULL,
};

// Same semantics as the main product's resolver:
//  · nothing chosen yet (empty school or major) is not an error — it is the
//    honest "no requirements to show" state every caller already handles;
//  · college '' (the student has not said where they study) resolves to null
//    rather than falling through to El Camino's data — serving ECC's
//    articulation collegeless is the fabrication PLAN_LOGIC.md forbids;
//  · college undefined = a college-unaware caller (the copied engine tests),
//    which keeps the El Camino behaviour this build is built on;
//  · any college other than 'ecc' resolves to null: this slice holds no other
//    college's agreements, and inheriting ECC's would be the same fabrication.
export function getRequirements(
  school: SchoolId,
  major: MajorChoice,
  college?: CollegeId,
): RequirementSet | null {
  if (!school || !major) return null;
  if (college === '') return null;
  if (college && college !== 'ecc') return null;
  return REGISTRY[`ecc|${school}|${major}`] ?? null;
}

// The destination campuses a given college can actually audit — it has at least
// one (school|major) agreement. Used by the picker and by list_options so a
// campus is never advertised that resolves to "no data" for every major.
export function availableTargetSchools(college: CollegeId): Set<SchoolId> {
  const set = new Set<SchoolId>();
  if (college !== 'ecc') return set;
  for (const key of Object.keys(REGISTRY)) set.add(key.split('|')[1] as SchoolId);
  return set;
}

// Every `<college>|<school>|<major>` key in the slice, in declaration order.
// Lets a caller enumerate the coverage without reaching into the registry.
export function requirementKeys(): string[] {
  return Object.keys(REGISTRY);
}
