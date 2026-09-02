import { useState, useSyncExternalStore } from 'react';
import { subscribeStatus, webMcpStatus } from '../webmcp/register';
import { HowToModal } from './HowToModal';
import { Button } from './ui';
import { cx } from '../lib/format';
import { usePageState } from '../lib/store';
import { isSample } from '../lib/sampleStudent';
import { useAgentToast } from '../lib/useAgentActivity';

export function Header() {
  const status = useSyncExternalStore(subscribeStatus, webMcpStatus, webMcpStatus);
  const state = usePageState();
  const [howTo, setHowTo] = useState(false);
  const live = status.supported && status.registered > 0;
  const sample = isSample(state);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[1.05rem] leading-none font-semibold tracking-tight text-ink">
            <span>
              DegreeLume <span className="text-accent">Assistant</span>
            </span>
            {/* Nothing on this page may be mistaken for a real student's record,
                not even in a screenshot — so the label travels with the wordmark. */}
            {sample ? (
              <span className="rounded-chip border border-warn/25 bg-warn-wash px-2 py-0.5 text-[0.65rem] font-medium text-warn">
                Sample data
              </span>
            ) : null}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-faint">
            Beta — El Camino College → 17 UC/CSU campuses · business, computer science, psychology
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:shrink-0">
          <span
            className={cx(
              'inline-flex items-center gap-2 rounded-chip border px-3 py-1.5 text-xs font-medium',
              live ? 'border-ok/25 bg-ok-wash text-ok' : 'border-warn/25 bg-warn-wash text-warn',
            )}
            title={
              live
                ? `Registered through ${status.api}.modelContext`
                : 'This browser exposes no Model Context API, so the tools are not offered to an agent here. The page and its console still work.'
            }
          >
            <span className={cx('size-1.5 rounded-full', live ? 'bg-ok' : 'bg-warn')} aria-hidden />
            {live
              ? `${status.registered} site tools registered · ready for your agent`
              : 'WebMCP not enabled in this browser'}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setHowTo(true)}>
            {live ? 'How to use it' : 'How to enable'}
          </Button>
        </div>
      </div>

      {status.error ? (
        <p className="border-t border-line bg-risk-wash px-4 py-1.5 text-center text-xs text-risk sm:px-6">
          Registration reported: {status.error}
        </p>
      ) : null}

      <AgentToast />

      {howTo ? <HowToModal onClose={() => setHowTo(false)} /> : null}
    </header>
  );
}

// Sits directly under the header whatever height the header takes, so it never
// covers the wordmark and never fights the sticky offset.
function AgentToast() {
  const toast = useAgentToast();
  if (!toast) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-full flex justify-center px-4 sm:px-6">
      <div
        role="status"
        aria-live="polite"
        className={cx(
          'mt-2 flex max-w-full items-center gap-2 rounded-chip border px-3 py-1.5 text-xs shadow-sm',
          toast.ok ? 'border-accent/25 bg-accent-light text-ink' : 'border-risk/25 bg-risk-wash text-risk',
        )}
      >
        <span className={cx('size-1.5 shrink-0 rounded-full', toast.ok ? 'bg-accent' : 'bg-risk')} aria-hidden />
        <span className="shrink-0 whitespace-nowrap text-muted">Agent called</span>
        <span className="shrink-0 font-mono text-ink">{toast.tool}</span>
        <span className="truncate text-muted">· {toast.summary}</span>
      </div>
    </div>
  );
}
