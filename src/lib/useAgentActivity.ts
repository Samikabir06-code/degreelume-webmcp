// ─── Making the agent's work visible ────────────────────────────────────────
//
// docs/PLAN.md asks that tools "execute visibly". The activity feed already
// records every call, but a feed at the bottom of the page is evidence, not a
// signal: in a three-minute video nobody watches a list scroll. So this hook
// watches the newest entry in `state.activity` and turns it into two things:
//
//   • a toast under the header naming the tool the agent just called, and
//   • a flash (plus a scroll, if the block is off-screen) on the one block
//     that tool feeds.
//
// Only calls that came from an agent get the toast; a call the person made in
// the tool console still flashes its block — they pressed the button, they do
// not need to be told.

import { useEffect, useState } from 'react';
import { getState, subscribe } from './store';
import { useFlash } from './useFlash';

/** The blocks on the page a tool call can visibly change. */
export type BlockId =
  | 'courses'
  | 'due'
  | 'risk'
  | 'deadlines'
  | 'credit-carry'
  | 'reminders'
  | 'student'
  | 'activity';

/**
 * Which block each tool feeds. Tools that answer a question without changing
 * any panel (check_course_transfer, explain_requirement) point at the activity
 * feed, because that is where their answer actually lands.
 */
export const BLOCK_FOR_TOOL: Readonly<Record<string, BlockId>> = {
  get_current_courses: 'courses',
  get_upcoming_work: 'due',
  get_grade_risk: 'risk',
  get_deadlines: 'deadlines',
  compare_campuses: 'credit-carry',
  audit_coursework: 'credit-carry',
  add_reminder: 'reminders',
  complete_reminder: 'reminders',
  set_student_target: 'student',
  check_course_transfer: 'activity',
  explain_requirement: 'activity',
};

/** Sticky header height, so "off-screen" means "actually hidden". */
const HEADER_ALLOWANCE = 96;

function scrollBlockIntoView(elementId: string) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(elementId);
  if (!el || typeof el.getBoundingClientRect !== 'function' || !el.scrollIntoView) return;

  // "Off-screen" means the block's own heading is not where a reader would
  // find it: hidden behind the sticky header, or below the fold. Blocks taller
  // than the viewport are the normal case here, so "fully visible" would be a
  // test that never passes.
  const top = el.getBoundingClientRect().top;
  if (top >= HEADER_ALLOWANCE && top <= window.innerHeight - 120) return;

  const startY = window.scrollY;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  // Some embedded browsers ignore smooth scrolling silently. Landing abruptly
  // in the right place beats staying in the wrong one.
  window.setTimeout(() => {
    if (window.scrollY === startY) el.scrollIntoView({ block: 'nearest' });
  }, 350);
}

/**
 * Flash class for one block, driven by tool calls rather than by data changes.
 * Pass the block's DOM id and an agent-driven call also scrolls it into view.
 *
 * It subscribes to the store rather than rendering from it: only a NEW call
 * should signal, and entries restored from localStorage on load are old news —
 * a page that lights up before anyone has done anything teaches nothing.
 */
export function useAgentBlock(block: BlockId, elementId?: string): string {
  const [matched, setMatched] = useState<string | null>(null);

  useEffect(() => {
    let seen = getState().activity[0]?.id ?? null;
    return subscribe(() => {
      const latest = getState().activity[0];
      if (!latest || latest.id === seen) return;
      seen = latest.id;
      if (BLOCK_FOR_TOOL[latest.tool] !== block) return;
      setMatched(latest.id);
      if (latest.via === 'agent' && elementId) scrollBlockIntoView(elementId);
    });
  }, [block, elementId]);

  // useFlash owns the timer, so two calls in a row cannot cut a flash short.
  return useFlash(matched);
}

export interface AgentToast {
  id: string;
  tool: string;
  summary: string;
  ok: boolean;
}

const SUMMARY_CHARS = 80;

function trim(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > SUMMARY_CHARS ? `${clean.slice(0, SUMMARY_CHARS - 1)}…` : clean;
}

/** The most recent agent-made call, for about `ms`, then null again. */
export function useAgentToast(ms = 5000): AgentToast | null {
  const [toast, setToast] = useState<AgentToast | null>(null);

  useEffect(() => {
    let seen = getState().activity[0]?.id ?? null;
    return subscribe(() => {
      const latest = getState().activity[0];
      if (!latest || latest.id === seen) return;
      seen = latest.id;
      // A call the person made in the console needs no announcement: they
      // pressed the button. Only an agent's work is news.
      if (latest.via !== 'agent') return;
      setToast({ id: latest.id, tool: latest.tool, summary: trim(latest.summary), ok: latest.ok });
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(t);
  }, [toast, ms]);

  return toast;
}
