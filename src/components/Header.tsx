import { useEffect, useState, useSyncExternalStore } from 'react';
import { BookOpen } from 'lucide-react';
import { subscribeStatus, webMcpStatus } from '../webmcp/register';
import { HowToModal } from './HowToModal';
import { Button } from './ui';
import { SkipLink, Wordmark } from './Wordmark';
import { cx } from '../lib/format';
import { usePageState } from '../lib/store';
import { isSample } from '../lib/sampleStudent';
import { useAgentToast } from '../lib/useAgentActivity';

// The product's header, anatomy for anatomy: a flat, full-bleed 68px bar that
// sits transparent over the top of the page and earns a hairline rule and a
// frosted ground only once you scroll. Wordmark left, controls right. Below
// it, one hairline strip carries the two standing status lines — what this
// page offers an agent, and what data it covers — because the product states
// scope on a rule, not inside a card.
export function Header() {
  const status = useSyncExternalStore(subscribeStatus, webMcpStatus, webMcpStatus);
  const state = usePageState();
  const [howTo, setHowTo] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const live = status.supported && status.registered > 0;
  const sample = isSample(state);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-30">
      <SkipLink />

      <div
        className={cx(
          'relative flex h-[68px] w-full items-center border-b px-4 transition-colors duration-200 sm:px-6',
          scrolled ? 'header-ground backdrop-blur' : 'border-transparent',
        )}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex shrink-0 items-center gap-2">
              <span className="hidden sm:inline-flex">
                <Wordmark />
              </span>
              <span className="sm:hidden">
                <Wordmark size="sm" />
              </span>
              <span className="font-display leading-none text-accent text-[15px] sm:text-[19px]">Assistant</span>
            </span>
            {/* Nothing on this page may be mistaken for a real student's record,
                not even in a screenshot — so the label travels with the wordmark. */}
            {sample ? (
              <span className="inline-flex shrink-0 items-center rounded-full border border-warn/20 bg-warn-wash px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-warn">
                Sample data
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setHowTo(true)}>
              <BookOpen size={14} aria-hidden="true" />
              <span className="hidden sm:inline">{live ? 'How to use it' : 'How to enable'}</span>
              <span className="sm:hidden">How</span>
            </Button>
          </div>
        </div>
      </div>

      {/* The standing status strip. One hairline, two facts. */}
      <div
        className={cx(
          'w-full border-b border-line px-4 transition-colors duration-200 sm:px-6',
          scrolled ? 'header-ground backdrop-blur' : 'bg-paper',
        )}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1.5 py-2">
          <span
            className={cx(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold',
              live ? 'border-ok/20 bg-ok-wash text-ok' : 'border-warn/20 bg-warn-wash text-warn',
            )}
            title={
              live
                ? `Registered through ${status.api}.modelContext`
                : 'This browser exposes no Model Context API, so the tools are not offered to an agent here. The page and its console still work.'
            }
          >
            <span className={cx('size-1.5 shrink-0 rounded-full', live ? 'bg-ok pulse-dot' : 'bg-warn')} aria-hidden />
            {live
              ? `${status.registered} site tools registered · ready for your agent`
              : 'WebMCP not enabled in this browser'}
          </span>
          {/* `.eyebrow` sets display:inline-flex, which refuses to ellipsize.
              Same metrics, as a block, so the line truncates on a phone. */}
          <span className="min-w-0 flex-1 truncate text-[12px] leading-4 tracking-[-0.015em] text-faint uppercase">
            Beta — El Camino College → 17 UC/CSU campuses · business, computer science, psychology
          </span>
        </div>
      </div>

      {status.error ? (
        <p className="border-b border-risk/20 bg-risk-wash px-4 py-1.5 text-center text-xs text-risk sm:px-6">
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
          'bubble-in mt-2 flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-float',
          toast.ok ? 'border-accent/20 bg-accent-light text-ink' : 'border-risk/20 bg-risk-wash text-risk',
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
