// Passive tool calls.
//
// The page and the agent must never disagree, so every number on screen comes
// out of the same implementation the agent calls. But `runTool` also RECORDS
// the call in the activity feed, and that feed is the demo's evidence of what
// the agent did — a page that logged its own renders would drown it.
//
// So passive panels call the implementation directly with a read-only
// ToolContext: same code, same data, no activity entry. Anything a person or
// an agent actually triggers still goes through `runTool`.

import { useEffect, useState } from 'react';
import { getState, type PageState } from '../lib/store';
import type { ToolError, ToolOutput } from '../tools/contract';
import { isToolError, type ToolImplMap } from '../tools/runtime';
import { SCHOOL_IMPLS } from '../tools/school';
import { TRANSFER_IMPLS } from '../tools/transfer';

const IMPLS: ToolImplMap = { ...TRANSFER_IMPLS, ...SCHOOL_IMPLS };

/** The slice of page state any read-only tool can see. Recomputing on every
 *  activity entry would re-run seventeen campus audits for nothing. */
export function dataKey(state: PageState): string {
  return JSON.stringify([
    state.target,
    state.completed,
    state.inProgress,
    state.canvas ? [state.canvas.source, state.canvas.host, state.canvas.fetchedAt, state.canvas.courses.length] : null,
    state.canvas?.courses.map((c) => [c.canvasCourseId, c.mappedCatalogCode]),
    state.reminders.map((r) => [r.id, r.done, r.due, r.title]),
  ]);
}

export async function callImpl<T>(name: string, input: unknown): Promise<ToolOutput<T> | ToolError> {
  const impl = IMPLS[name];
  if (!impl) {
    return { error: 'not_implemented', message: `${name} is not wired on this page yet.` };
  }
  try {
    const out = await impl(input ?? {}, {
      state: getState(),
      // Read-only path: a passive render must never write to the store.
      setState: () => {},
      now: new Date(),
    });
    return out as ToolOutput<T> | ToolError;
  } catch (err) {
    return { error: 'tool_failed', message: err instanceof Error ? err.message : String(err) };
  }
}

export interface PassiveResult<T> {
  output: ToolOutput<T> | null;
  error: ToolError | null;
  loading: boolean;
}

/**
 * Run a read-only tool whenever the student's data changes. `enabled` lets a
 * panel stay honestly empty instead of calling a tool that has nothing to work
 * with (no target set, no Canvas connected).
 */
export function usePassiveTool<T>(
  name: string,
  input: unknown,
  key: string,
  enabled = true,
): PassiveResult<T> {
  const inputKey = JSON.stringify(input ?? {});
  const request = `${name}|${inputKey}|${key}`;
  // Keyed by the request that produced it, so a stale answer is never shown
  // for new data — the panel says "loading" instead of lying for one frame.
  const [entry, setEntry] = useState<{ request: string; output: ToolOutput<T> | null; error: ToolError | null } | null>(
    null,
  );

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    callImpl<T>(name, JSON.parse(inputKey)).then((out) => {
      if (!live) return;
      setEntry(
        isToolError(out)
          ? { request, output: null, error: out }
          : { request, output: out, error: null },
      );
    });
    return () => {
      live = false;
    };
  }, [name, inputKey, request, enabled]);

  if (!enabled) return { output: null, error: null, loading: false };
  const fresh = entry && entry.request === request ? entry : null;
  return { output: fresh?.output ?? null, error: fresh?.error ?? null, loading: !fresh };
}
