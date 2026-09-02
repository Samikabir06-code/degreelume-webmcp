// Small display helpers shared by the page. No business logic lives here —
// every number and verdict on screen comes from a tool; these only format it.

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function parse(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Sep 12" for this year, "Sep 12, 2027" otherwise. Empty string when unknown. */
export function fmtDate(value: string | number | Date | null | undefined, now = new Date()): string {
  const d = parse(value);
  if (!d) return '';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** "Sep 12, 3:59 PM" — used where a due time actually matters. */
export function fmtDateTime(value: string | number | Date | null | undefined, now = new Date()): string {
  const d = parse(value);
  if (!d) return '';
  const date = fmtDate(d, now);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
}

/** Whole days from now to the date; negative when it has passed. */
export function daysUntil(value: string | number | Date | null | undefined, now = new Date()): number | null {
  const d = parse(value);
  if (!d) return null;
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86_400_000);
}

/** "today", "tomorrow", "in 4 days", "3 days ago", "in 2 months". */
export function relative(value: string | number | Date | null | undefined, now = new Date()): string {
  const days = daysUntil(value, now);
  if (days === null) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  const abs = Math.abs(days);
  const unit = abs >= 60 ? `${Math.round(abs / 30)} months` : abs >= 14 ? `${Math.round(abs / 7)} weeks` : `${abs} days`;
  return days > 0 ? `in ${unit}` : `${unit} ago`;
}

// The engine's three verdict words, and nothing else. No "guaranteed",
// no "approved" — BUSINESS_RULES §2.
export type Verdict = 'eligible' | 'competitive' | 'reach' | string;

export function verdictLabel(verdict: Verdict | null | undefined): string {
  if (verdict === 'eligible' || verdict === 'competitive' || verdict === 'reach') return verdict;
  return 'not assessed';
}

export function verdictTone(verdict: Verdict | null | undefined): 'ok' | 'warn' | 'risk' | 'muted' {
  switch (verdict) {
    case 'eligible':
      return 'ok';
    case 'competitive':
      return 'warn';
    case 'reach':
      return 'risk';
    default:
      return 'muted';
  }
}

/** 0.62 or 62 → "62%". Null-safe; returns "—" when there is nothing to show. */
export function pct(value: number | null | undefined, opts: { fraction?: boolean } = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const asPercent = opts.fraction || (value > 0 && value <= 1) ? value * 100 : value;
  return `${Math.round(asPercent)}%`;
}

export function num(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}${suffix}`;
}

/** Compact JSON for the activity feed / console, never longer than `max`. */
export function shortJson(value: unknown, max = 120): string {
  let text: string;
  try {
    text = JSON.stringify(value) ?? '';
  } catch {
    text = String(value);
  }
  if (text === '{}' || text === '') return '(no input)';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
