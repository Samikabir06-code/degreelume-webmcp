import { useState, useSyncExternalStore } from 'react';
import { subscribeStatus, webMcpStatus } from '../webmcp/register';
import { HowToModal } from './HowToModal';
import { Button } from './ui';
import { cx } from '../lib/format';

export function Header() {
  const status = useSyncExternalStore(subscribeStatus, webMcpStatus, webMcpStatus);
  const [howTo, setHowTo] = useState(false);
  const live = status.supported && status.registered > 0;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-[1.05rem] leading-none font-semibold tracking-tight text-ink">
            DegreeLume <span className="text-accent">Assistant</span>
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-faint">
            Beta — El Camino College → 17 UC/CSU campuses · business, computer science, psychology
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
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
            {live ? `${status.registered} site tools registered` : 'WebMCP not enabled in this browser'}
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

      {howTo ? <HowToModal onClose={() => setHowTo(false)} /> : null}
    </header>
  );
}
