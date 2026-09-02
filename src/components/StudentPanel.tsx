import { useEffect, useMemo, useState } from 'react';
import { ECC_COURSES } from '../data/courses';
import { SCHOOLS } from '../data/schools';
import { getState, resetState, setState, type PageState } from '../lib/store';
import { campusesWithData } from '../lib/profile';
import { canvasHosts, connectCanvas, disconnectCanvas, refreshCanvas } from '../lib/canvasClient';
import { isSample, loadSampleStudent } from '../lib/sampleStudent';
import { Button, Card, Chip, Empty, Field, Input, Pill, Select } from './ui';
import { fmtDateTime } from '../lib/format';

const MAJOR_OPTIONS = [
  { id: 'business', name: 'Business Administration' },
  { id: 'cs', name: 'Computer Science' },
  { id: 'psych', name: 'Psychology' },
] as const;

const ENTRY_TERMS = [
  'Fall 2022',
  'Spring 2023',
  'Fall 2023',
  'Spring 2024',
  'Fall 2024',
  'Spring 2025',
  'Fall 2025',
  'Spring 2026',
  'Fall 2026',
];

const OTHER_HOST = '__other__';

// The catalog carries a few duplicated rows; the picker shows each code once.
const CATALOG = Array.from(new Map(ECC_COURSES.map((c) => [c.code, c])).values());

type HostRow = { host: string; name?: string };

export function StudentPanel({ state }: { state: PageState }) {
  const [query, setQuery] = useState('');
  const [host, setHost] = useState(state.canvasConnection?.host ?? '');
  const [otherHost, setOtherHost] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<null | 'connect' | 'refresh' | 'sample'>(null);
  const [error, setError] = useState<string | null>(null);

  const [hosts, setHosts] = useState<HostRow[]>([]);
  useEffect(() => {
    let live = true;
    // The audited host list comes from the Worker, with a static fallback.
    // Districts run one Canvas for several colleges, so the same host arrives
    // more than once — the picker shows each host once, naming the rest.
    canvasHosts().then((rows) => {
      if (!live) return;
      const byHost = new Map<string, string[]>();
      for (const r of rows) byHost.set(r.host, [...(byHost.get(r.host) ?? []), r.name]);
      setHosts(
        [...byHost.entries()].map(([host, names]) => ({
          host,
          name: names.length > 1 ? `${names[0]} + ${names.length - 1} more` : names[0],
        })),
      );
    });
    return () => {
      live = false;
    };
  }, []);

  const withData = useMemo(() => {
    if (!state.target.major) return null;
    return new Set<string>(campusesWithData(state.target.major).map((c) => c.id));
  }, [state.target.major]);

  const ready = SCHOOLS.filter((s) => s.ready);
  const uc = ready.filter((s) => s.system === 'UC');
  const csu = ready.filter((s) => s.system === 'CSU');

  const results = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (q.length < 2) return [];
    const taken = new Set([...state.completed, ...state.inProgress]);
    return CATALOG.filter(
      (c) => !taken.has(c.code) && (c.code.toUpperCase().startsWith(q) || c.name.toUpperCase().includes(q)),
    ).slice(0, 8);
  }, [query, state.completed, state.inProgress]);

  function addCourse(code: string, to: 'completed' | 'inProgress') {
    setState((prev) => ({
      completed:
        to === 'completed' ? [...new Set([...prev.completed, code])] : prev.completed.filter((c) => c !== code),
      inProgress:
        to === 'inProgress' ? [...new Set([...prev.inProgress, code])] : prev.inProgress.filter((c) => c !== code),
    }));
    setQuery('');
  }

  function removeCourse(code: string, from: 'completed' | 'inProgress') {
    setState((prev) =>
      from === 'completed'
        ? { completed: prev.completed.filter((c) => c !== code) }
        : { inProgress: prev.inProgress.filter((c) => c !== code) },
    );
  }

  const chosenHost = host === OTHER_HOST ? otherHost.trim() : host;

  async function onConnect() {
    setError(null);
    if (!chosenHost || !token.trim()) {
      setError('Pick your school and paste a token first.');
      return;
    }
    setBusy('connect');
    try {
      await connectCanvas(chosenHost, token.trim());
      setToken('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onRefresh() {
    setError(null);
    setBusy('refresh');
    try {
      await refreshCanvas();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onSample() {
    setBusy('sample');
    try {
      await Promise.resolve(loadSampleStudent());
    } finally {
      setBusy(null);
    }
  }

  const canvas = state.canvas;
  const sample = isSample(state);

  return (
    <div className="space-y-4">
      <Card title="Your transfer target" subtitle="Everything on this page defaults to what you set here.">
        <div className="space-y-3">
          <Field label="Target campus">
            <Select
              value={state.target.campus}
              onChange={(e) => setState((prev) => ({ target: { ...prev.target, campus: e.target.value } }))}
            >
              <option value="">Not set</option>
              <optgroup label="University of California">
                {uc.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {withData && !withData.has(s.id) ? ' — no agreement for this major' : ''}
                  </option>
                ))}
              </optgroup>
              <optgroup label="California State University">
                {csu.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {withData && !withData.has(s.id) ? ' — no agreement for this major' : ''}
                  </option>
                ))}
              </optgroup>
            </Select>
          </Field>

          <Field label="Major">
            <Select
              value={state.target.major}
              onChange={(e) =>
                setState((prev) => ({
                  target: { ...prev.target, major: e.target.value as PageState['target']['major'] },
                }))
              }
            >
              <option value="">Not set</option>
              {MAJOR_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="First community-college term"
            hint="Decides which transfer GE pattern applies — Cal-GETC, or IGETC if you started early enough. Unknown means Cal-GETC."
          >
            <Select
              value={state.target.entryTerm}
              onChange={(e) => setState((prev) => ({ target: { ...prev.target, entryTerm: e.target.value } }))}
            >
              <option value="">Unknown</option>
              {ENTRY_TERMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>

          {!state.target.campus || !state.target.major ? (
            <Empty>
              No target set. Pick a campus and major, or let your agent call{' '}
              <code className="font-mono text-xs">set_student_target</code>.
            </Empty>
          ) : null}
        </div>
      </Card>

      <Card title="Your coursework" subtitle="El Camino courses you have finished or are taking now.">
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Completed ({state.completed.length})</p>
            {state.completed.length ? (
              <div className="flex flex-wrap gap-1.5">
                {state.completed.map((c) => (
                  <Chip key={c} onRemove={() => removeCourse(c, 'completed')}>
                    {c}
                  </Chip>
                ))}
              </div>
            ) : (
              <Empty>Nothing recorded. Search below, or load the sample student.</Empty>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">In progress ({state.inProgress.length})</p>
            {state.inProgress.length ? (
              <div className="flex flex-wrap gap-1.5">
                {state.inProgress.map((c) => (
                  <Chip key={c} onRemove={() => removeCourse(c, 'inProgress')}>
                    {c}
                  </Chip>
                ))}
              </div>
            ) : (
              <Empty>Nothing in progress.</Empty>
            )}
          </div>

          <div>
            <Field label="Add a course" hint={`${CATALOG.length} El Camino courses, 2025–26 catalog.`}>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="MATH 190, or “calculus”"
                spellCheck={false}
              />
            </Field>
            {results.length ? (
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
                {results.map((c) => (
                  <li key={c.code} className="flex items-center justify-between gap-2 bg-ivory px-2.5 py-2">
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-ink">{c.code}</span>
                      <span className="ml-2 text-xs text-faint">{c.name}</span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" onClick={() => addCourse(c.code, 'completed')}>
                        Completed
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => addCourse(c.code, 'inProgress')}>
                        In progress
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : query.trim().length >= 2 ? (
              <p className="mt-2 text-xs text-faint">No catalog match for “{query.trim()}”.</p>
            ) : null}
          </div>
        </div>
      </Card>

      <Card
        title="Canvas"
        subtitle="Read-only. Your grades and due dates, straight from your own school."
        action={
          canvas ? (
            <Pill tone={sample ? 'warn' : 'ok'}>{sample ? 'Sample data' : 'Live'}</Pill>
          ) : (
            <Pill tone="muted">Not connected</Pill>
          )
        }
      >
        <div className="space-y-3">
          {canvas ? (
            <div className="rounded-lg border border-line bg-paper px-3 py-2.5 text-xs leading-relaxed text-muted">
              <p className="text-ink">
                {canvas.userName ?? 'Connected'} · <span className="font-mono">{canvas.host}</span>
              </p>
              <p className="mt-0.5 text-faint">
                {canvas.courses.length} courses, {canvas.assignments.length} assignments · fetched{' '}
                {fmtDateTime(canvas.fetchedAt)}
              </p>
              <div className="mt-2 flex gap-1.5">
                {!sample ? (
                  <Button size="sm" onClick={onRefresh} disabled={busy !== null}>
                    {busy === 'refresh' ? 'Refreshing…' : 'Refresh'}
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => disconnectCanvas()}>
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Field label="Your school">
                <Select value={host} onChange={(e) => setHost(e.target.value)}>
                  <option value="">Choose…</option>
                  {hosts.map((h) => (
                    <option key={h.host} value={h.host}>
                      {h.name ? `${h.name} — ${h.host}` : h.host}
                    </option>
                  ))}
                  <option value={OTHER_HOST}>Other *.instructure.com</option>
                </Select>
              </Field>
              {host === OTHER_HOST ? (
                <Input
                  value={otherHost}
                  onChange={(e) => setOtherHost(e.target.value)}
                  placeholder="yourschool.instructure.com"
                  spellCheck={false}
                />
              ) : null}
              <Field
                label="Canvas access token"
                hint="Read-only. Stays in this browser; sent only to your Canvas through our proxy; never stored."
              >
                <Input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Account → Settings → New access token"
                  autoComplete="off"
                />
              </Field>
              <Button variant="primary" onClick={onConnect} disabled={busy !== null}>
                {busy === 'connect' ? 'Connecting…' : 'Connect Canvas'}
              </Button>
            </>
          )}

          {error ? <p className="text-xs leading-relaxed text-risk">{error}</p> : null}
        </div>
      </Card>

      <Card title="Start here" subtitle="No Canvas account? See the whole product in one click.">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onSample} disabled={busy !== null} className="grow">
            {busy === 'sample' ? 'Loading…' : 'Load the sample student'}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const s = getState();
              const hasData = s.completed.length || s.inProgress.length || s.canvas || s.reminders.length;
              if (hasData && !confirm('Clear the profile, coursework, Canvas connection, reminders and activity?'))
                return;
              resetState();
            }}
          >
            Clear everything
          </Button>
        </div>
        <p className="mt-2 text-[0.7rem] leading-relaxed text-faint">
          The sample student is fictional and labelled <span className="font-mono">sample</span> in every citation and
          summary, so no answer built on it can be mistaken for your own record.
        </p>
      </Card>
    </div>
  );
}
