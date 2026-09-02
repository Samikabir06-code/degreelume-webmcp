// ─── Reading a date a person or an agent wrote ───────────────────────────────
//
// Two tools take a date from outside — `add_reminder`'s `due` and
// `get_deadlines`'s `before` — and the JSON schema can only say "string". So
// the parsing lives here, once, and both tools agree on what a date is.
//
// The bug this exists to prevent was real: `get_deadlines {before: "2026-9-5"}`
// passed the schema, became `new Date("2026-9-5T23:59:59")` — which is an
// Invalid Date, because the T-form demands zero-padded parts — and threw a
// RangeError out of `.toISOString()`. The agent got a generic `tool_failed`
// for a date a person would call perfectly ordinary.
//
// Accepted: YYYY-M-D and YYYY-MM-DD (a calendar day, no time zone implied),
// and an ISO date-time. Rejected: everything else — a day that does not exist
// ("2026-02-31"), and slash dates, whose month/day order is a guess. A date we cannot
// read is an error naming it, never a silently different date.

export interface ParsedDate {
  /** Zero-padded YYYY-MM-DD for a calendar day; a full ISO instant otherwise. */
  iso: string;
  date: Date;
  /** True when the input named a day rather than a moment. */
  dateOnly: boolean;
}

export function parseDateInput(raw: string | undefined | null): ParsedDate | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  const day = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (day) {
    const [year, month, date] = [Number(day[1]), Number(day[2]), Number(day[3])];
    const parsed = new Date(year, month - 1, date);
    // Reject a day the calendar does not have. Without this, "2026-02-31"
    // rolls silently forward to March 3rd and the student is told about a
    // deadline on a date they never asked about.
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== date) {
      return null;
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return { iso: `${day[1]}-${pad(month)}-${pad(date)}`, date: parsed, dateOnly: true };
  }

  // A moment, but only written the ISO way. Handing anything else to
  // `new Date` would quietly accept "09/05/2026" and read it as September 5th
  // — which is what a US locale means and not what most of the world writes.
  // A date we would have to guess at is a date we refuse.
  if (!/^\d{4}-\d{1,2}-\d{1,2}[T ]/.test(s)) return null;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return { iso: parsed.toISOString(), date: parsed, dateOnly: false };
}

// The last instant of a calendar day, so "before 2026-09-05" includes things
// due on the 5th. A full date-time is already a moment and is returned as-is.
export function endOfDay(parsed: ParsedDate): Date {
  if (!parsed.dateOnly) return parsed.date;
  const end = new Date(parsed.date);
  end.setHours(23, 59, 59, 999);
  return end;
}

// The one message both tools give back for a date they cannot read.
export const BAD_DATE_HINT =
  'Pass a calendar date as YYYY-MM-DD (e.g. "2026-09-30"), or a full ISO date-time.';
