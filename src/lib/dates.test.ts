import { describe, it, expect } from 'vitest';
import { parseDateInput, endOfDay, BAD_DATE_HINT } from './dates';

// One parser for both date-taking tools. The bug it exists to prevent:
// get_deadlines built `new Date(\`${before}T23:59:59\`)`, which is an Invalid
// Date for an unpadded day, and threw a RangeError out of .toISOString().

describe('parseDateInput', () => {
  it('accepts a zero-padded calendar day and keeps it as one', () => {
    const p = parseDateInput('2026-09-30')!;
    expect(p.iso).toBe('2026-09-30');
    expect(p.dateOnly).toBe(true);
  });

  it('accepts an UNPADDED calendar day and normalises it', () => {
    // The exact input that used to crash get_deadlines.
    const p = parseDateInput('2026-9-5')!;
    expect(p.iso).toBe('2026-09-05');
    expect(p.dateOnly).toBe(true);
    expect(() => endOfDay(p).toISOString()).not.toThrow();
  });

  it('accepts a full ISO date-time as a moment', () => {
    const p = parseDateInput('2026-09-30T17:00:00Z')!;
    expect(p.dateOnly).toBe(false);
    expect(p.iso).toBe('2026-09-30T17:00:00.000Z');
  });

  it('rejects a day the calendar does not have rather than rolling it forward', () => {
    // Without the round-trip check, "2026-02-31" silently becomes March 3rd.
    expect(parseDateInput('2026-02-31')).toBeNull();
    expect(parseDateInput('2026-13-01')).toBeNull();
    expect(parseDateInput('2026-00-10')).toBeNull();
  });

  it('rejects a slash date rather than guessing its month/day order', () => {
    // "09/05/2026" is September 5th to a US reader and May 9th to most of the
    // world. new Date() picks the first without saying so; we refuse instead.
    expect(parseDateInput('09/05/2026')).toBeNull();
    expect(parseDateInput('5 Sep 2026')).toBeNull();
  });

  it('rejects prose, empty and missing input', () => {
    expect(parseDateInput('next-ish Tuesday')).toBeNull();
    expect(parseDateInput('')).toBeNull();
    expect(parseDateInput(undefined)).toBeNull();
    expect(parseDateInput(null)).toBeNull();
  });

  it('endOfDay closes a calendar day but leaves a moment alone', () => {
    const day = endOfDay(parseDateInput('2026-09-05')!);
    expect(day.getHours()).toBe(23);
    expect(day.getMinutes()).toBe(59);
    const moment = parseDateInput('2026-09-05T08:00:00Z')!;
    expect(endOfDay(moment).getTime()).toBe(moment.date.getTime());
  });

  it('publishes one hint both tools give back', () => {
    expect(BAD_DATE_HINT).toContain('YYYY-MM-DD');
  });
});
