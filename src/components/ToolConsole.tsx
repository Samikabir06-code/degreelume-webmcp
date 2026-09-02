import { useMemo, useState } from 'react';
import type { Citation, ToolError, ToolOutput } from '../tools/contract';
import { TOOLS, toolDescriptor } from '../tools/contract';
import { exampleInput, runTool } from '../tools';
import { isToolError } from '../tools/runtime';
import { Button, Card, Pill, Select } from './ui';
import { cx } from '../lib/format';

const GROUP_LABEL: Record<string, string> = {
  transfer: 'Transfer (ASSIST agreements + catalog)',
  school: 'School (your Canvas)',
  state: 'This page’s profile',
};

const VERIFICATION_TONE: Record<string, 'ok' | 'warn' | 'risk' | 'muted'> = {
  verified: 'ok',
  unreviewed: 'warn',
  sample: 'warn',
  demo: 'risk',
};

export function ToolConsole() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(TOOLS[0].name);
  // Edits are kept per tool, so switching tools shows that tool's example
  // input again without an effect writing state behind the render.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [ran, setRan] = useState<{ name: string; result: ToolOutput | ToolError } | null>(null);
  const [running, setRunning] = useState(false);
  const [raw, setRaw] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const by = new Map<string, typeof TOOLS>();
    for (const t of TOOLS) by.set(t.group, [...(by.get(t.group) ?? []), t]);
    return [...by.entries()];
  }, []);

  const example = useMemo(() => {
    try {
      return JSON.stringify(exampleInput(name) ?? {}, null, 2);
    } catch {
      return '{}';
    }
  }, [name]);

  const input = edits[name] ?? example;
  const setInput = (value: string) => setEdits((prev) => ({ ...prev, [name]: value }));
  const result = ran && ran.name === name ? ran.result : null;

  const descriptor = toolDescriptor(name);

  async function run() {
    let parsed: unknown;
    try {
      parsed = input.trim() ? JSON.parse(input) : {};
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'That is not valid JSON.');
      return;
    }
    setParseError(null);
    setRunning(true);
    try {
      setRan({ name, result: await runTool(name, parsed, 'console') });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card
      title="Tool console"
      subtitle="Run any tool by hand — the same code path an agent uses, logged in the same feed."
      action={
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Open'}
        </Button>
      }
    >
      {!open ? (
        <p className="text-sm text-faint">
          {TOOLS.length} tools, from <span className="font-mono text-xs">list_options</span> to{' '}
          <span className="font-mono text-xs">compare_campuses</span>. No agent needed.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Select value={name} onChange={(e) => setName(e.target.value)}>
              {groups.map(([group, tools]) => (
                <optgroup key={group} label={GROUP_LABEL[group] ?? group}>
                  {tools.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>

            {descriptor ? (
              <p className="text-xs leading-relaxed text-muted">
                {!descriptor.readOnly ? <Pill tone="warn" className="mr-1.5">changes the page</Pill> : null}
                {descriptor.description}
              </p>
            ) : null}

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              rows={8}
              className="w-full rounded-lg border border-line bg-paper p-2.5 font-mono text-xs text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            {parseError ? <p className="text-xs text-risk">{parseError}</p> : null}
            <Button variant="primary" onClick={run} disabled={running}>
              {running ? 'Running…' : `Run ${name}`}
            </Button>
          </div>

          <div className="min-w-0">
            {!result ? (
              <p className="text-sm text-faint">Output appears here.</p>
            ) : isToolError(result) ? (
              <div className="rounded-lg border border-risk/20 bg-risk-wash p-3">
                <p className="font-mono text-xs text-risk">{result.error}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink">{result.message}</p>
                {result.hint ? <p className="mt-1 text-xs text-muted">{result.hint}</p> : null}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-ink">{result.summary}</p>

                {result.caveats.length ? (
                  <ul className="space-y-1">
                    {result.caveats.map((c) => (
                      <li key={c} className="text-xs leading-relaxed text-warn">
                        Note: {c}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {result.citations.length ? (
                  <ul className="space-y-1">
                    {result.citations.map((c: Citation, i) => (
                      <li key={`${c.sourceUrl}-${i}`} className="text-xs leading-relaxed">
                        <a
                          href={c.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted underline decoration-line-strong underline-offset-2 hover:decoration-accent"
                        >
                          {c.sourceName}
                        </a>{' '}
                        <span className="text-faint">{c.catalogYear}</span>{' '}
                        <span
                          className={cx(
                            'rounded-chip px-1.5 py-0.5 text-[0.65rem]',
                            {
                              ok: 'bg-ok-wash text-ok',
                              warn: 'bg-warn-wash text-warn',
                              risk: 'bg-risk-wash text-risk',
                              muted: 'bg-parchment text-faint',
                            }[VERIFICATION_TONE[c.verification] ?? 'muted'],
                          )}
                        >
                          {c.verification}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <button
                  type="button"
                  onClick={() => setRaw((r) => !r)}
                  className="text-xs text-faint underline decoration-line-strong underline-offset-2 hover:text-ink"
                >
                  {raw ? 'Hide raw JSON' : 'Show raw JSON'}
                </button>
                {raw ? (
                  <pre className="max-h-96 overflow-auto rounded-lg border border-line bg-paper p-2.5 font-mono text-[0.7rem] leading-relaxed text-muted">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
