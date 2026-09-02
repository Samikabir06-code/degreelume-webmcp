import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './ui';
import { cx } from '../lib/format';

const PROMPTS = [
  'What is due this week, and is anything putting my transfer at risk?',
  'If I applied to every UC and CSU you cover for computer science, where do my classes count the most?',
  "Why doesn't PHYS 1A count at Cal Poly Pomona?",
  'Audit my coursework against UCLA computer science and tell me what is still missing.',
  'Remind me to file my UC TAG before September 30.',
];

const WAYS = [
  {
    title: "ChatGPT's desktop app",
    body: 'Open this page in the app’s built-in browser. A "site tools" arrow appears in the address bar; click it and you will see every tool this page offers. Then just ask.',
  },
  {
    title: 'Chrome 149 or newer',
    body: 'Visit chrome://flags/#enable-webmcp-testing, set it to Enabled, relaunch, and reload this page. The pill above turns green when document.modelContext exists.',
    code: 'chrome://flags/#enable-webmcp-testing',
  },
  {
    title: 'Model Context Tool Inspector extension',
    body: 'The inspector extension lists and runs the page’s tools without an agent. It reads the same registrations, plus the window.__degreelume handle this page exposes for DevTools.',
    code: 'await window.__degreelume.run("list_options")',
  },
];

export function HowToModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
    } catch {
      setCopied(null);
    }
  }

  // The header sets backdrop-blur, which makes it a containing block for
  // position:fixed children — so the dialog goes straight to the body.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-band/40 p-4 backdrop-blur-[2px] sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="How to use this page with an agent"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-card border border-line bg-ivory shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Use this page with an agent</h2>
            <p className="mt-1 text-xs leading-relaxed text-faint">
              The page registers its WebMCP tools with the browser. Any browser that speaks the Model Context API can call them —
              nothing is installed, and the tools answer from the same engine the page renders from.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </header>

        <div className="space-y-4 px-6 py-5">
          <ol className="space-y-3">
            {WAYS.map((w, i) => (
              <li key={w.title} className="flex gap-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-light text-[0.7rem] font-semibold text-accent">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{w.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{w.body}</p>
                  {w.code ? (
                    <button
                      type="button"
                      onClick={() => copy(w.code)}
                      className={cx(
                        'mt-1.5 block w-full truncate rounded-lg border border-line bg-paper px-2.5 py-1.5 text-left font-mono text-[0.7rem] text-muted transition hover:border-line-strong hover:text-ink',
                      )}
                    >
                      {copied === w.code ? 'Copied' : w.code}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          <div className="rounded-card border border-line bg-paper p-4">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Five prompts to try</p>
            <ul className="mt-2 space-y-1.5">
              {PROMPTS.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => copy(p)}
                    className="w-full rounded-lg px-2 py-1.5 text-left text-sm leading-snug text-ink transition hover:bg-accent-light"
                  >
                    <span className="text-faint">“</span>
                    {p}
                    <span className="text-faint">”</span>
                    <span className="ml-2 text-[0.7rem] text-faint">{copied === p ? 'copied' : 'copy'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs leading-relaxed text-faint">
            No agent handy? Everything is also runnable from the tool console at the bottom of the page, or from DevTools
            through <code className="font-mono">window.__degreelume</code>.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
