import { describe, expect, it } from 'vitest';
import {
  runRiskRadar, neededRemainingAverage, normalizedRemainingWeight,
  pointsFromLetter, pointsFromScore,
  type RadarCourse, type RadarRequirement, type RequirementResolver,
} from './riskRadar';

// A C-or-better requirement, the standing default for California transfer prep.
const NEEDS_C: RadarRequirement = {
  kind: 'major-prep',
  requiredPoints: 2.0,
  requiredLabel: 'C',
  source: 'fixture rule',
};
const NO_REQ: RadarRequirement = {
  kind: 'no-requirement', requiredPoints: null, requiredLabel: null, source: '',
};

const needsC: RequirementResolver = () => NEEDS_C;
const needsNothing: RequirementResolver = () => NO_REQ;

function course(over: Partial<RadarCourse> = {}): RadarCourse {
  return {
    canvasCourseId: 'c1',
    canvasCourseCode: 'ECON-102',
    canvasCourseName: 'Principles of Microeconomics',
    mappedCatalogCode: 'ECON 102',
    mappingStatus: 'confirmed',
    canvasGrade: null,
    canvasScore: 60,
    units: 3,
    enrollmentState: 'active',
    remainingWeight: 0.5,
    ...over,
  };
}

const only = (c: RadarCourse, resolver: RequirementResolver = needsC) =>
  runRiskRadar([c], resolver).flags[0];

describe('the remaining-average formula', () => {
  // needed = (required − score × (1 − w)) / w, with C = 73%.
  it('is exactly (T − S(1−w))/w — hand-derived', () => {
    // (73 − 60×0.5)/0.5 = 43/0.5 = 86
    expect(neededRemainingAverage(60, 2.0, 0.5)).toEqual({ raw: 86, display: 86 });
    // (73 − 70×0.6)/0.4 = 31/0.4 = 77.5
    expect(neededRemainingAverage(70, 2.0, 0.4).display).toBe(78);
    // (73 − 50×0.75)/0.25 = 35.5/0.25 = 142 — beyond a perfect finish
    expect(neededRemainingAverage(50, 2.0, 0.25).raw).toBe(142);
  });

  it('needs exactly the requirement when the whole grade is still open', () => {
    expect(neededRemainingAverage(0, 2.0, 1).raw).toBe(73);
  });
});

describe('an unknown never becomes the loudest verdict (B2)', () => {
  // This is the failure this engine exists to avoid: telling a student their
  // course is unsalvageable because our sync came back thin.
  it('unknown remaining weight is a watch, not "even a perfect finish cannot save this"', () => {
    const flag = only(course({ remainingWeight: null }));
    expect(flag.level).toBe('watch');
    expect(flag.message).toMatch(/can't see how much of the grade is still ungraded/i);
    expect(flag.message).not.toMatch(/perfect finish/i);
  });

  it('a NaN or out-of-range weight is treated as unknown, not as zero', () => {
    expect(normalizedRemainingWeight(Number.NaN)).toBeNull();
    expect(normalizedRemainingWeight(1.5)).toBeNull();
    expect(normalizedRemainingWeight(-0.2)).toBeNull();
    expect(normalizedRemainingWeight(0)).toBe(0);
    expect(only(course({ remainingWeight: Number.NaN })).level).toBe('watch');
  });

  it('a letter grade with no percent score is a watch — the percent math is impossible', () => {
    const flag = only(course({ canvasGrade: 'C-', canvasScore: null, remainingWeight: 0.5 }));
    expect(flag.level).toBe('watch');
    expect(flag.currentLabel).toBe('C-');
    expect(flag.neededRemainingAverage).toBeNull();
    expect(flag.message).toMatch(/hasn't published a percent score/i);
  });

  it('a merely SUGGESTED mapping gets no verdict even when the resolver would give one', () => {
    const flag = only(course({ mappingStatus: 'suggested', canvasScore: 40 }));
    expect(flag.level).toBe('ok');
    expect(flag.message).toMatch(/haven't matched this Canvas course/i);
  });

  it('an unmapped course gets no verdict', () => {
    const flag = only(course({ mappedCatalogCode: null, mappingStatus: 'unmapped', canvasScore: 30 }));
    expect(flag.level).toBe('ok');
  });
});

describe('verdicts when the engine really can see the numbers', () => {
  it('zero remaining weight below the requirement IS final — and says so without a withdraw deadline', () => {
    const flag = only(course({ canvasScore: 60, remainingWeight: 0 }));
    expect(flag.level).toBe('risk');
    expect(flag.message).toMatch(/Everything in this course is graded/i);
    // The withdraw deadline is meaningless for a course that has finished.
    expect(flag.message).not.toMatch(/withdraw deadline/i);
  });

  it('needing more than 100% on the rest is unreachable', () => {
    const flag = only(course({ canvasScore: 50, remainingWeight: 0.25 }));
    expect(flag.level).toBe('risk');
    expect(flag.message).toMatch(/perfect score on the remaining 25%/i);
    expect(flag.neededRemainingAverage).toBeNull();
  });

  it('needing 85%+ on the rest is a risk with the number attached', () => {
    const flag = only(course({ canvasScore: 60, remainingWeight: 0.5 }));
    expect(flag.level).toBe('risk');
    expect(flag.neededRemainingAverage).toBe(86);
  });

  it('needing under 85% is a watch', () => {
    const flag = only(course({ canvasScore: 70, remainingWeight: 0.4 }));
    expect(flag.level).toBe('watch');
    expect(flag.neededRemainingAverage).toBe(78);
  });

  it('a score exactly at the threshold is ok, one point under is not', () => {
    expect(only(course({ canvasScore: 73 })).level).toBe('ok');
    expect(only(course({ canvasScore: 72 })).level).not.toBe('ok');
  });

  it('a course the plan does not need is never flagged', () => {
    const flag = only(course({ canvasScore: 20 }), needsNothing);
    expect(flag.level).toBe('ok');
    expect(flag.message).toMatch(/isn't needed for your current plan/i);
  });

  it('a course that is not in progress produces no flag at all', () => {
    const result = runRiskRadar([course({ enrollmentState: 'completed', canvasScore: 10 })], needsC);
    expect(result.flags).toHaveLength(0);
  });
});

describe('grade reading', () => {
  it('marks a score-derived grade as estimated and a real letter as not', () => {
    expect(only(course({ canvasScore: 95, canvasGrade: null })).estimated).toBe(true);
    expect(only(course({ canvasGrade: 'A', canvasScore: 95 })).estimated).toBe(false);
  });

  it('non-numeric grades carry no position on the scale', () => {
    // A Pass is not a low grade. Scoring "P" as zero would fail a passing
    // course; a Withdrawal or Incomplete says nothing about performance.
    for (const g of ['P', 'NP', 'CR', 'W', 'I']) {
      expect(pointsFromLetter(g), g).toBeNull();
    }
    expect(pointsFromLetter('C-')).toBe(1.7);
    expect(pointsFromLetter('C−')).toBe(1.7); // unicode minus, as exports emit it
    expect(pointsFromLetter('B++')).toBe(3.0); // collapses to the base grade
    expect(pointsFromScore(null)).toBeNull();
  });

  it('a pass with no numeric score is not flagged as failing', () => {
    const flag = only(course({ canvasGrade: 'P', canvasScore: null }));
    expect(flag.level).toBe('ok');
    expect(flag.message).toMatch(/No grade reported yet/i);
  });
});

describe('output ordering', () => {
  it('sorts risk, then watch, then ok — the engine ranks, the model relays', () => {
    const result = runRiskRadar([
      course({ canvasCourseId: 'z-ok', canvasScore: 95 }),
      course({ canvasCourseId: 'a-watch', canvasScore: 70, remainingWeight: 0.4 }),
      course({ canvasCourseId: 'm-risk', canvasScore: 50, remainingWeight: 0.25 }),
    ], needsC);
    expect(result.flags.map((f) => f.level)).toEqual(['risk', 'watch', 'ok']);
    expect(result.summary).toEqual({ ok: 1, watch: 1, risk: 1 });
  });

  it('breaks ties on the course id so the order is total and stable', () => {
    const forward = runRiskRadar([
      course({ canvasCourseId: 'b', canvasScore: 95 }),
      course({ canvasCourseId: 'a', canvasScore: 95 }),
    ], needsC);
    const reversed = runRiskRadar([
      course({ canvasCourseId: 'a', canvasScore: 95 }),
      course({ canvasCourseId: 'b', canvasScore: 95 }),
    ], needsC);
    expect(forward.flags.map((f) => f.course.canvasCourseId)).toEqual(['a', 'b']);
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reversed));
  });

  it('is deterministic — identical inputs, identical output', () => {
    const input = [course({ canvasCourseId: 'c1' }), course({ canvasCourseId: 'c2', canvasScore: 95 })];
    expect(JSON.stringify(runRiskRadar(input, needsC))).toBe(JSON.stringify(runRiskRadar(input, needsC)));
  });
});
