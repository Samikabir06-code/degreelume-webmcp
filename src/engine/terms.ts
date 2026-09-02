// Pure term helpers (no Date access — safe in the engine).

// Advance one term. With intersessions enabled (the `summer` flag — true for
// non-light loads), a year runs Fall → Winter → Spring → Summer → Fall…
// (4 terms/year; Winter and Summer are short intersessions). Otherwise it's
// Fall → Spring → Fall… (2 terms/year). Adding Winter lets a student take a
// winter intersession class and shortens the calendar span of a given plan.
export function nextTerm(term: string, summer = false): string {
  const [season, yearStr] = term.split(' ');
  const year = parseInt(yearStr, 10);
  if (summer) {
    if (season === 'Fall') return `Winter ${year + 1}`;
    if (season === 'Winter') return `Spring ${year}`;
    if (season === 'Spring') return `Summer ${year}`;
    return `Fall ${year}`; // Summer → Fall (same year)
  }
  if (season === 'Fall') return `Spring ${year + 1}`;
  return `Fall ${year}`;
}

// Advance a term by n steps.
export function advanceTerm(term: string, steps: number, summer = false): string {
  let t = term;
  for (let i = 0; i < steps; i++) t = nextTerm(t, summer);
  return t;
}

// Rough calendar span (in months) from the start of one term to the end of
// another. Quarter-style ordering so Winter sits between Fall and Spring.
const TERM_START_MONTH: Record<string, number> = { Winter: 1, Spring: 4, Summer: 7, Fall: 9 };
const TERM_LENGTH_MONTHS: Record<string, number> = { Winter: 3, Spring: 3, Summer: 2, Fall: 4 };

export function termSpanMonths(startTerm: string, endTerm: string): number {
  const [s, sy] = startTerm.split(' ');
  const [e, ey] = endTerm.split(' ');
  const startAbs = parseInt(sy, 10) * 12 + (TERM_START_MONTH[s] ?? 1);
  const endAbs = parseInt(ey, 10) * 12 + (TERM_START_MONTH[e] ?? 1) + (TERM_LENGTH_MONTHS[e] ?? 4);
  return Math.max(1, endAbs - startAbs);
}

// Human-friendly duration label, e.g. "about 1¼ years".
export function durationLabel(months: number): string {
  if (months <= 6) return 'about one semester';
  const quarters = Math.round((months / 12) * 4) / 4; // nearest quarter-year
  const whole = Math.floor(quarters);
  const frac = quarters - whole;
  const fracStr = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : '';
  if (whole === 0) return `about ${fracStr || 'half a'} year`;
  const plural = whole === 1 && frac === 0 ? '' : 's';
  return `about ${whole}${fracStr} year${plural}`;
}
