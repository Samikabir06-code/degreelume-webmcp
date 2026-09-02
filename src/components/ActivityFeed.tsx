import { useState } from 'react';
import type { PageState } from '../lib/store';
import { Card, Empty, Pill } from './ui';
import { cx, shortJson } from '../lib/format';
import { useFlash } from '../lib/useFlash';
import { useAgentBlock } from '../lib/useAgentActivity';

export function ActivityFeed({ state }: { state: PageState }) {
  const [open, setOpen] = useState<string | null>(null);
  const dataFlash = useFlash(state.activity[0]?.id ?? null);
  const callFlash = useAgentBlock('activity', 'block-activity');
  const flash = dataFlash || callFlash;

  return (
    <Card
      id="block-activity"
      title="What your agent did on this page"
      subtitle="Every tool call, newest first. Nothing on this page was guessed — each line is an answer the engine computed."
      action={state.activity.length ? <Pill tone="muted">{state.activity.length}</Pill> : null}
      flash={flash}
    >
      {state.activity.length === 0 ? (
        <Empty>
          No tool calls yet. Ask an agent something, or run a tool from the console below — either way it shows up here.
        </Empty>
      ) : (
        <ol className="divide-y divide-line">
          {state.activity.map((a) => {
            const expanded = open === a.id;
            return (
              <li key={a.id} className="py-2 first:pt-0 last:pb-0">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : a.id)}
                  className="flex w-full items-start gap-2.5 text-left"
                >
                  <span className="w-14 shrink-0 pt-0.5 font-mono text-[0.7rem] text-faint">
                    {new Date(a.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </span>
                  <span
                    className={cx(
                      'shrink-0 rounded-chip border px-1.5 py-0.5 text-[0.65rem] font-medium',
                      a.via === 'agent' ? 'border-accent/20 bg-accent-light text-accent' : 'border-line bg-paper text-faint',
                    )}
                  >
                    {a.via}
                  </span>
                  <span className="min-w-0">
                    <span className={cx('font-mono text-xs', a.ok ? 'text-ink' : 'text-risk')}>{a.tool}</span>
                    <span className="ml-2 text-xs leading-snug text-muted">{a.summary}</span>
                  </span>
                </button>
                {expanded ? (
                  <pre className="mt-1.5 ml-16 overflow-x-auto rounded-lg border border-line bg-paper p-2.5 font-mono text-[0.7rem] leading-relaxed text-muted">
                    {JSON.stringify(a.input ?? {}, null, 2)}
                  </pre>
                ) : (
                  <p className="mt-0.5 ml-16 truncate font-mono text-[0.65rem] text-faint">{shortJson(a.input)}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
