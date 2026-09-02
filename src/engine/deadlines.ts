import type { AuditResult, StudentProfile } from '../types';
import type { DeadlineRule } from '../data/deadlines';
import { getRequirements } from '../data/requirements';
import { summarizeReqs } from './runAudit';

// Deadline engine (D2): turns the seeded calendar into the student's "what's
// next" list — only the rules that apply to their goal and target system, keyed
// to their actual gaps. Pure function over (profile, result, rules, now), like
// runAudit: same inputs, same answer.

export interface UpcomingDeadline {
  id: string;
  label: string;
  action: string;
  date: Date;
  dateLabel: string; // "Sep 30, 2026"
  daysLeft: number;
  hard: boolean;
  category: DeadlineRule['category'];
  sourceUrl: string;
  context: string | null; // the student's own gap, e.g. "still missing 2 required prep courses"
}

// Next annual occurrence of month/day strictly today-or-later.
export function nextOccurrence(month: number, day: number, now: Date): Date {
  const candidate = new Date(now.getFullYear(), month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return candidate >= today ? candidate : new Date(now.getFullYear() + 1, month - 1, day);
}

const DAY_MS = 86_400_000;

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((to.getTime() - a.getTime()) / DAY_MS);
}

const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Pre-audit deadline preview (ONB-2): the generic calendar for a goal + target
// system before any personal result exists — no gap context, same rules.
export function genericDeadlines(
  goal: StudentProfile['goal'],
  schoolSystem: 'UC' | 'CSU',
  rules: DeadlineRule[],
  now: Date,
  limit = 3,
  college?: StudentProfile['college'],
  targetSchool?: StudentProfile['school'],
  major?: StudentProfile['major'],
): UpcomingDeadline[] {
  const wantsTransfer = goal === 'transfer' || goal === 'both';
  const wantsGraduation = goal === 'graduate' || goal === 'both';
  const out: UpcomingDeadline[] = [];
  for (const rule of rules) {
    if (rule.appliesTo === 'transfer' && !wantsTransfer) continue;
    if (rule.appliesTo === 'graduation' && !wantsGraduation) continue;
    if (rule.system && rule.system !== schoolSystem) continue;
    if (rule.college && rule.college !== college) continue;
    // TAG is not a system-wide UC deadline. Only surface it when this exact
    // campus + major has an affirmative TAG eligibility record. UCLA,
    // Berkeley and UC San Diego do not participate at all; participating
    // campuses also exclude specific majors.
    if (rule.category === 'tag' && !getRequirements(targetSchool ?? '', major ?? '', college)?.tag?.eligible) continue;
    const date = nextOccurrence(rule.month, rule.day, now);
    out.push({
      id: rule.id,
      label: rule.label,
      action: rule.action,
      date,
      dateLabel: fmt(date),
      daysLeft: daysBetween(now, date),
      hard: rule.hard,
      category: rule.category,
      sourceUrl: rule.sourceUrl,
      context: null,
    });
  }
  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out.slice(0, limit);
}

export function upcomingDeadlines(
  profile: StudentProfile,
  result: AuditResult,
  rules: DeadlineRule[],
  schoolSystem: 'UC' | 'CSU',
  now: Date,
  opts: { horizonDays?: number; limit?: number } = {},
): UpcomingDeadline[] {
  const { horizonDays = 365, limit } = opts;
  const wantsTransfer = profile.goal === 'transfer' || profile.goal === 'both';
  const wantsGraduation = profile.goal === 'graduate' || profile.goal === 'both';

  // Only REQUIRED gaps belong in the urgency message, counted group-aware:
  // a select-3 group with nothing done is 3 missing courses (not 6 rows), and
  // alternates inside a satisfied group are not gaps. Never overstate.
  const requiredMissing = result.transfer
    ? summarizeReqs(result.transfer.majorPrep).requiredMissing
    : 0;
  const gapContext =
    requiredMissing > 0
      ? `You're still missing ${requiredMissing} required prep course${requiredMissing === 1 ? '' : 's'}.`
      : null;

  const out: UpcomingDeadline[] = [];
  for (const rule of rules) {
    if (rule.appliesTo === 'transfer' && !wantsTransfer) continue;
    if (rule.appliesTo === 'graduation' && !wantsGraduation) continue;
    if (rule.system && rule.system !== schoolSystem) continue;
    // A college's own date belongs only to that college's students.
    if (rule.college && rule.college !== profile.college) continue;
    // A UC target does not imply TAG eligibility. The deadline is relevant
    // only when the exact requirement set says that campus + major offers it.
    if (rule.category === 'tag' && !getRequirements(profile.school, profile.major, profile.college)?.tag?.eligible) continue;

    const date = nextOccurrence(rule.month, rule.day, now);
    const daysLeft = daysBetween(now, date);
    if (daysLeft > horizonDays) continue;

    out.push({
      id: rule.id,
      label: rule.label,
      action: rule.action,
      date,
      dateLabel: fmt(date),
      daysLeft,
      hard: rule.hard,
      category: rule.category,
      sourceUrl: rule.sourceUrl,
      // Tie hard transfer deadlines (applications AND the TAG cutoff) to the
      // student's own gaps ("…and you're not done yet").
      context: rule.hard && (rule.category === 'application' || rule.category === 'tag') ? gapContext : null,
    });
  }

  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return limit ? out.slice(0, limit) : out;
}
