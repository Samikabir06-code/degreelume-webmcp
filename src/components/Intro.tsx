import { useEffect, useState } from 'react';
import type { PageState } from '../lib/store';
import { loadSampleStudent } from '../lib/sampleStudent';
import { Button } from './ui';
import { cx } from '../lib/format';

// The three questions the demo asks, in the order it asks them. They are here
// as click-to-copy chips so a judge can paste one straight into their agent
// instead of inventing a prompt for a product they have known for ten seconds.
const PROMPTS = [
  "What's due this week, and is anything putting my transfer at risk?",
  'Compare every campus you cover for computer science — where do my classes count the most?',
  "Why doesn't CSCI 1 count at Cal Poly Pomona?",
];

async function copy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard blocked (no permission, insecure origin) — fall through.
  }
  return false;
}

export function Intro({ state }: { state: PageState }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const empty =
    !state.target.campus &&
    !state.target.major &&
    state.completed.length === 0 &&
    state.inProgress.length === 0 &&
    state.canvas === null;

  return (
    <section className="rounded-card border border-line bg-ivory px-5 py-5 shadow-card sm:px-6">
      <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink">
        Thirteen site tools your AI agent can call: transfer articulation across 17 UC/CSU campuses, your Canvas grades
        and due dates, and what has to happen before your deadline — every answer cited, none of it guessed.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="eyebrow shrink-0">Try asking</span>
        {PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            title="Copy this prompt"
            onClick={() => {
              void copy(p).then((ok) => setCopied(ok ? p : null));
            }}
            className={cx(
              'max-w-full truncate rounded-full border px-3 py-1.5 text-left text-xs transition-colors',
              copied === p
                ? 'border-ok/20 bg-ok-wash text-ok'
                : 'border-line bg-paper text-muted hover:border-accent/30 hover:bg-accent-light hover:text-accent',
            )}
          >
            {copied === p ? 'Copied' : `“${p}”`}
          </button>
        ))}
      </div>

      {empty ? (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-5">
          <Button
            variant="primary"
            className="btn-lift"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              try {
                loadSampleStudent();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Loading…' : 'Load the sample student'}
          </Button>
          <p className="text-[13px] leading-relaxed text-faint">or set your target and courses on the left.</p>
        </div>
      ) : null}
    </section>
  );
}
