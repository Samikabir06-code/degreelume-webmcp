import type {
  RequirementSet, Course, MajorPrepReq, MajorDifficulty, PrereqChain, PrereqStep, CourseCode,
} from '../types';

const courseBy = (catalog: Course[], code: string) => catalog.find((c) => c.code === code);

// Depth of the prerequisite chain rooted at `code` (1 = no prereqs).
function chainDepth(catalog: Course[], code: string, seen = new Set<string>()): number {
  if (seen.has(code)) return 1;
  seen.add(code);
  const prereqs = courseBy(catalog, code)?.prereqs ?? [];
  if (prereqs.length === 0) return 1;
  return 1 + Math.max(...prereqs.map((p) => chainDepth(catalog, p, new Set(seen))));
}

// The fewest-prereq option for a requirement (mirrors the scheduler's preference).
function chosenOption(req: MajorPrepReq, catalog: Course[]): CourseCode | null {
  if (req.options.length === 0) return null;
  return [...req.options].sort(
    (a, b) => (courseBy(catalog, a)?.prereqs?.length ?? 0) - (courseBy(catalog, b)?.prereqs?.length ?? 0)
  )[0];
}

// A transparent, rule-based difficulty profile for a major's lower-division prep.
// Group-aware: a select-N group counts as N picks, and its unit cost is the
// cheapest N members — counting all members would overstate the load.
export function majorDifficulty(reqSet: RequirementSet | null, catalog: Course[]): MajorDifficulty | null {
  if (!reqSet) return null;
  let requiredCount = 0;
  let recommendedCount = 0;
  let totalUnits = 0;
  let longest = 0;
  const gateways: string[] = [];

  // Cheapest-option units for one row (0 when unresolvable in this catalog).
  const rowUnits = (req: MajorPrepReq): number => {
    const code = chosenOption(req, catalog);
    return code ? courseBy(catalog, code)?.units ?? 0 : 0;
  };

  // Gateways + chain depth consider every row, grouped or not.
  for (const req of reqSet.majorPrep) {
    const code = chosenOption(req, catalog);
    if (!code) continue;
    const c = courseBy(catalog, code);
    longest = Math.max(longest, chainDepth(catalog, code));
    const name = (c?.name ?? '').toLowerCase();
    if (/calculus|physics|organic/.test(name)) gateways.push(c!.name);
  }

  const groups = new Map<string, MajorPrepReq[]>();
  for (const req of reqSet.majorPrep) {
    if (req.group && req.required) {
      const rows = groups.get(req.group.id) ?? [];
      if (rows.length === 0) groups.set(req.group.id, rows);
      rows.push(req);
      continue;
    }
    if (req.required) {
      requiredCount++;
      totalUnits += rowUnits(req);
    } else {
      recommendedCount++;
    }
  }
  for (const rows of groups.values()) {
    const count = rows[0].group!.count;
    requiredCount += count;
    const members = new Map<string, MajorPrepReq[]>();
    for (const r of rows) {
      const m = members.get(r.group!.memberId) ?? [];
      if (m.length === 0) members.set(r.group!.memberId, m);
      m.push(r);
    }
    const memberCosts = [...members.values()]
      .map((memberRows) => {
        // Distinct chosen courses across the member's rows (a shared option
        // covers several rows of one member at no extra cost).
        const codes = new Set<string>();
        for (const r of memberRows) {
          const code = chosenOption(r, catalog);
          if (code) codes.add(code);
        }
        if (codes.size === 0) return null;
        return [...codes].reduce((s, code) => s + (courseBy(catalog, code)?.units ?? 0), 0);
      })
      .filter((u): u is number => u !== null)
      .sort((a, b) => a - b);
    totalUnits += memberCosts.slice(0, count).reduce((s, u) => s + u, 0);
  }

  return {
    requiredPrepCount: requiredCount,
    recommendedPrepCount: recommendedCount,
    totalPrepUnits: totalUnits,
    longestChainTerms: longest,
    gateways: [...new Set(gateways)],
    gpaTarget: reqSet.gpaTarget,
    impacted: reqSet.impacted,
  };
}

// "Unlock maps": for each required prep course that has prerequisites, the ordered
// chain a student must climb, marking which links are already cleared.
export function prereqChains(
  reqSet: RequirementSet | null,
  catalog: Course[],
  doneSet: Set<string>
): PrereqChain[] {
  if (!reqSet) return [];
  const chains: PrereqChain[] = [];
  const seenTargets = new Set<string>();
  for (const req of reqSet.majorPrep.filter((r) => r.required)) {
    const target = chosenOption(req, catalog);
    if (!target || seenTargets.has(target)) continue;
    seenTargets.add(target);

    const steps: PrereqStep[] = [];
    const visited = new Set<string>();
    const walk = (code: string) => {
      if (visited.has(code)) return;
      visited.add(code);
      const c = courseBy(catalog, code);
      for (const p of c?.prereqs ?? []) walk(p);
      steps.push({ code, name: c?.name ?? code, done: doneSet.has(code) });
    };
    walk(target);

    if (steps.length > 1) {
      chains.push({ reqLabel: req.label, target, steps, allClear: steps.every((s) => s.done) });
    }
  }
  return chains;
}
