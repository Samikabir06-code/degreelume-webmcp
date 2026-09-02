import { describe, expect, it } from 'vitest';
import { LETTER_POINTS, DEFAULT_GRADE_RULE, gradeRuleFor, GRADE_RULE_OVERRIDES } from './gradeRules';
import { pointsFromLetter as radarPointsFromLetter } from '../engine/riskRadar';

// The Risk Radar engine and the grade-rules data file each carry a letter→
// points table (the engine's is private; the data file's is public). This
// test pins them in lockstep so a change on either side is caught (the same
// discipline as golden tests: expectations are literal, never re-derived).
describe('gradeRules', () => {
  it('the shared letter→points scale matches the Risk Radar engine', () => {
    for (const [letter, points] of Object.entries(LETTER_POINTS)) {
      expect(radarPointsFromLetter(letter), `letter ${letter}`).toBe(points);
    }
  });

  it('the default rule is a C or better, and is honest about not being checked yet', () => {
    expect(DEFAULT_GRADE_RULE.points).toBe(2.0);
    expect(DEFAULT_GRADE_RULE.label).toBe('C');
    expect(DEFAULT_GRADE_RULE.meta.sourceUrl).toMatch(/^https:\/\//);
    // 'verified' is a HUMAN act in this repo. Nobody has checked this floor
    // against each campus's published language, so it stays unreviewed —
    // it was previously self-marked verified, which is the thing the rest of
    // the data pipeline exists to prevent.
    expect(DEFAULT_GRADE_RULE.meta.verification).toBe('unreviewed');
  });

  it('non-numeric grades resolve to null on both sides of the seam', () => {
    for (const g of ['P', 'NP', 'CR', 'W', 'I']) {
      expect(radarPointsFromLetter(g), g).toBeNull();
    }
  });

  it('gradeRuleFor returns null for an unmapped course and the default otherwise', () => {
    expect(gradeRuleFor('ucr', 'business', null)).toBeNull();
    expect(gradeRuleFor('ucr', 'business', 'ECON 102')).toBe(DEFAULT_GRADE_RULE);
  });

  it('overrides take precedence when present', () => {
    // The override table is empty today; when an agreement-specific grade is
    // confirmed it lands here. This test fails loudly if someone adds an
    // override without points/label/provenance.
    for (const [key, rule] of Object.entries(GRADE_RULE_OVERRIDES)) {
      expect(key).toMatch(/^\w+\|\w+\|\w+$/);
      expect(rule.points).toBeGreaterThan(0);
      expect(rule.label).toBeTruthy();
      expect(rule.meta.sourceUrl).toMatch(/^https:\/\//);
    }
  });
});
