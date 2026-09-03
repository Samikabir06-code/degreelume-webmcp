import { useState } from 'react';
import type { CanvasAssignmentSnapshot, PageState } from '../lib/store';
import { setCourseMapping } from '../lib/canvasClient';
import { runTool } from '../tools';
import { dataKey, usePassiveTool } from './passive';
import { Bar, Button, Card, Empty, Input, Pill, Select, Spinner, type Tone } from './ui';
import { cx, fmtDate, fmtDateTime, num, pct, relative } from '../lib/format';
import { useFlash } from '../lib/useFlash';
import { useAgentBlock } from '../lib/useAgentActivity';

// ── shapes the tools return (docs/PLAN.md §Tool semantics) ──
interface UpcomingWork {
  windowDays: number;
  items: CanvasAssignmentSnapshot[];
  overdue: CanvasAssignmentSnapshot[];
  counts?: Record<string, number>;
}

interface RiskFlag {
  level: 'ok' | 'watch' | 'risk' | string;
  course: {
    canvasCourseCode?: string | null;
    canvasCourseName?: string | null;
    mappedCatalogCode?: string | null;
  };
  requirement: { kind?: string; requiredLabel?: string; source?: string } | null;
  currentLabel: string | null;
  neededRemainingAverage: number | null;
  estimated: boolean;
  message: string;
}

interface GradeRisk {
  flags: RiskFlag[];
  summary: { ok: number; watch: number; risk: number };
  unmapped: string[];
}

interface DeadlineItem {
  kind: 'application' | 'coursework' | 'canvas' | 'reminder' | string;
  date: string;
  label: string;
  action?: string;
  hard?: boolean;
  daysLeft?: number;
  source?: { name: string; url: string };
  context?: string;
}

interface Deadlines {
  before: string;
  items: DeadlineItem[];
}

const LEVEL_TONE: Record<string, Tone> = { ok: 'ok', watch: 'warn', risk: 'risk' };
const KIND_TONE: Record<string, Tone> = {
  application: 'accent',
  coursework: 'warn',
  canvas: 'muted',
  reminder: 'ok',
};

export function Today({ state, catalogCodes }: { state: PageState; catalogCodes: string[] }) {
  const key = dataKey(state);
  const connected = state.canvas !== null;
  const hasTarget = Boolean(state.target.campus && state.target.major);

  const work = usePassiveTool<UpcomingWork>('get_upcoming_work', { days: 7 }, key, connected);
  const risk = usePassiveTool<GradeRisk>('get_grade_risk', {}, key, connected && hasTarget);
  const deadlines = usePassiveTool<Deadlines>('get_deadlines', {}, key);

  return (
    <div className="space-y-4">
      <CurrentCourses state={state} catalogCodes={catalogCodes} />
      <UpcomingWorkBlock result={work} connected={connected} />
      <RiskBlock result={risk} connected={connected} hasTarget={hasTarget} />
      <DeadlinesBlock result={deadlines} />
      <Reminders state={state} />
    </div>
  );
}

function CurrentCourses({ state, catalogCodes }: { state: PageState; catalogCodes: string[] }) {
  const canvas = state.canvas;
  const active = canvas?.courses.filter((c) => c.enrollmentState === 'active') ?? [];
  const done = canvas?.courses.filter((c) => c.enrollmentState === 'completed') ?? [];
  // Two signals, one highlight: the data changed, or a tool call named this block.
  const dataFlash = useFlash(canvas?.fetchedAt ?? null);
  const callFlash = useAgentBlock('courses', 'block-courses');
  const flash = dataFlash || callFlash;

  return (
    <Card
      id="block-courses"
      title="Your courses"
      subtitle={canvas ? `${canvas.host} · fetched ${fmtDateTime(canvas.fetchedAt)}` : undefined}
      action={canvas ? <Pill tone={canvas.source === 'sample' ? 'warn' : 'ok'}>{canvas.source}</Pill> : null}
      flash={flash}
    >
      {!canvas ? (
        <Empty>
          Canvas is not connected, so this page knows nothing about your grades. Connect it on the left — an agent
          cannot enter the token for you — or load the sample student.
        </Empty>
      ) : active.length === 0 ? (
        <Empty>No active enrollments in this Canvas.</Empty>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-[11px] text-faint uppercase">
                <th className="px-1 pb-2 font-medium">Course</th>
                <th className="px-1 pb-2 font-medium">Term</th>
                <th className="px-1 pb-2 font-medium">Grade</th>
                <th className="px-1 pb-2 font-medium">Ungraded</th>
                <th className="px-1 pb-2 font-medium">Counts as</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {active.map((c) => (
                <tr key={c.canvasCourseId} className="align-top">
                  <td className="px-1 py-2">
                    <p className="leading-snug font-medium text-ink">{c.name}</p>
                    {c.courseCode ? <p className="font-mono text-[11px] text-faint">{c.courseCode}</p> : null}
                  </td>
                  <td className="px-1 py-2 text-xs text-faint">{c.termName ?? '—'}</td>
                  <td className="px-1 py-2">
                    <span className="text-ink">{c.grade ?? '—'}</span>
                    {c.score !== null ? <span className="ml-1 text-xs text-faint">{pct(c.score)}</span> : null}
                  </td>
                  <td className="px-1 py-2 text-xs text-muted">
                    {c.remainingWeight === null ? (
                      <span className="text-faint">unknown</span>
                    ) : (
                      <>
                        {pct(c.remainingWeight, { fraction: true })}{' '}
                        <Bar value={c.remainingWeight} max={1} tone="muted" />
                      </>
                    )}
                  </td>
                  <td className="px-1 py-2">
                    {c.mappingCandidates.length > 1 ? (
                      <Select
                        className="min-w-[8.5rem] text-xs"
                        value={c.mappedCatalogCode ?? ''}
                        onChange={(e) => setCourseMapping(c.canvasCourseId, e.target.value || null)}
                      >
                        <option value="">Pick the catalog course…</option>
                        {c.mappingCandidates.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </Select>
                    ) : c.mappedCatalogCode ? (
                      <span className="font-mono text-xs text-ink">{c.mappedCatalogCode}</span>
                    ) : (
                      <MappingPicker course={c.canvasCourseId} catalogCodes={catalogCodes} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {done.length ? (
            <p className="mt-3 text-xs leading-relaxed text-faint">
              Completed in Canvas:{' '}
              {done.map((c) => `${c.mappedCatalogCode ?? c.courseCode ?? c.name}${c.finalGrade ? ` (${c.finalGrade})` : ''}`).join(' · ')}
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}

// A course Canvas could not match to the catalog is reported as unmapped, never
// guessed — but the student can say what it is.
function MappingPicker({ course, catalogCodes }: { course: string; catalogCodes: string[] }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        not matched — set
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <Input
        list="ecc-catalog-codes"
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        placeholder="MATH 190"
        className="w-28 font-mono text-xs"
      />
      <Button
        size="sm"
        onClick={() => {
          if (catalogCodes.includes(value.trim())) {
            setCourseMapping(course, value.trim());
            setOpen(false);
          }
        }}
      >
        Save
      </Button>
    </span>
  );
}

function UpcomingWorkBlock({
  result,
  connected,
}: {
  result: ReturnType<typeof usePassiveTool<UpcomingWork>>;
  connected: boolean;
}) {
  const data = result.output?.data;
  // Two signals, one highlight: the data changed, or a tool call named this block.
  const dataFlash = useFlash(data);
  const callFlash = useAgentBlock('due', 'block-due');
  const flash = dataFlash || callFlash;
  const overdue = data?.overdue ?? [];
  const upcoming = (data?.items ?? []).filter((i) => !overdue.some((o) => o.id === i.id));

  return (
    <Card
      id="block-due"
      title="Due in the next 7 days"
      subtitle={result.output?.summary}
      action={overdue.length ? <Pill tone="risk">{overdue.length} overdue</Pill> : null}
      flash={flash}
    >
      {!connected ? (
        <Empty>Connect Canvas, or load the sample student, to see what is due.</Empty>
      ) : result.loading ? (
        <Spinner label="Reading Canvas" />
      ) : result.error ? (
        <Empty>{result.error.message}</Empty>
      ) : overdue.length === 0 && upcoming.length === 0 ? (
        <Empty>Nothing due in the next seven days.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {[...overdue, ...upcoming].map((item) => {
            const late = overdue.some((o) => o.id === item.id);
            return (
              <li key={item.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm leading-snug text-ink">
                    {item.htmlUrl ? (
                      <a
                        href={item.htmlUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-line-strong underline-offset-2 hover:decoration-accent"
                      >
                        {item.name}
                      </a>
                    ) : (
                      item.name
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-faint">
                    <span className="font-mono">{item.courseLabel}</span>
                    {item.pointsPossible !== null ? ` · ${num(item.pointsPossible)} pts` : ''}
                    {item.dueAt ? ` · due ${fmtDateTime(item.dueAt)}` : ' · no due date'}
                  </p>
                </div>
                <span className="shrink-0">
                  {late ? (
                    <Pill tone="risk">{item.missing ? 'missing' : 'overdue'}</Pill>
                  ) : (
                    <span className="text-xs text-muted">{relative(item.dueAt)}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RiskBlock({
  result,
  connected,
  hasTarget,
}: {
  result: ReturnType<typeof usePassiveTool<GradeRisk>>;
  connected: boolean;
  hasTarget: boolean;
}) {
  const data = result.output?.data;
  // Two signals, one highlight: the data changed, or a tool call named this block.
  const dataFlash = useFlash(data);
  const callFlash = useAgentBlock('risk', 'block-risk');
  const flash = dataFlash || callFlash;

  return (
    <Card
      id="block-risk"
      title="Grade risk radar"
      subtitle={result.output?.summary}
      action={
        data ? (
          <span className="flex gap-1">
            {data.summary.risk > 0 ? <Pill tone="risk">{data.summary.risk} at risk</Pill> : null}
            {data.summary.watch > 0 ? <Pill tone="warn">{data.summary.watch} to watch</Pill> : null}
            {data.summary.risk + data.summary.watch === 0 ? <Pill tone="ok">clear</Pill> : null}
          </span>
        ) : null
      }
      flash={flash}
    >
      {!connected || !hasTarget ? (
        <Empty>
          The radar needs both a target (campus and major) and Canvas grades — it compares one against the other. Set
          what is missing on the left.
        </Empty>
      ) : result.loading ? (
        <Spinner label="Checking grades against requirements" />
      ) : result.error ? (
        <Empty>{result.error.message}</Empty>
      ) : !data || data.flags.length === 0 ? (
        <Empty>No in-progress course maps to a requirement in this plan, so there is nothing to judge.</Empty>
      ) : (
        <ul className="space-y-2">
          {data.flags.map((f, i) => (
            <li
              key={`${f.course.mappedCatalogCode ?? f.course.canvasCourseCode ?? i}-${i}`}
              className={cx(
                'rounded-control border px-3.5 py-3',
                f.level === 'risk'
                  ? 'border-risk/20 bg-risk-wash'
                  : f.level === 'watch'
                    ? 'border-warn/20 bg-warn-wash'
                    : 'border-line bg-paper',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-ink">
                  <span className="font-mono">
                    {f.course.mappedCatalogCode ?? f.course.canvasCourseCode ?? f.course.canvasCourseName}
                  </span>
                  {f.requirement?.requiredLabel ? (
                    <span className="font-normal text-muted">
                      {' '}
                      → needs {f.requirement.requiredLabel} for{' '}
                      {f.requirement.kind === 'ge' ? 'transfer GE' : 'major prep'}
                    </span>
                  ) : null}
                </p>
                <Pill tone={LEVEL_TONE[f.level] ?? 'muted'}>{f.level}</Pill>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted">{f.message}</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                {f.currentLabel ? `Now: ${f.currentLabel}. ` : ''}
                {f.neededRemainingAverage !== null
                  ? `Needs ${pct(f.neededRemainingAverage)} average on the remaining work${f.estimated ? ' (estimated)' : ''}. `
                  : ''}
                {f.requirement?.source ?? ''}
              </p>
            </li>
          ))}
          {data.unmapped.length ? (
            <li className="text-xs leading-relaxed text-faint">
              Not judged, because they match no requirement in this plan: {data.unmapped.join(', ')}.
            </li>
          ) : null}
        </ul>
      )}
    </Card>
  );
}

function DeadlinesBlock({ result }: { result: ReturnType<typeof usePassiveTool<Deadlines>> }) {
  const data = result.output?.data;
  // Two signals, one highlight: the data changed, or a tool call named this block.
  const dataFlash = useFlash(data);
  const callFlash = useAgentBlock('deadlines', 'block-deadlines');
  const flash = dataFlash || callFlash;
  const items = data?.items ?? [];

  return (
    <Card
      id="block-deadlines"
      title="Everything before the deadline"
      subtitle={result.output?.summary}
      flash={flash}
    >
      {result.loading ? (
        <Spinner label="Merging deadlines" />
      ) : result.error ? (
        <Empty>{result.error.message}</Empty>
      ) : items.length === 0 ? (
        <Empty>Nothing dated yet. Set a target campus, and application deadlines appear here.</Empty>
      ) : (
        <ol className="divide-y divide-line">
          {items.slice(0, 14).map((item, i) => (
            <li key={`${item.date}-${i}`} className="flex items-start justify-between gap-3 py-2 first:pt-0">
              <div className="min-w-0">
                <p className="text-sm leading-snug text-ink">{item.label}</p>
                {item.action ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.action}</p> : null}
                <p className="mt-1 text-[11px] text-faint">
                  {fmtDate(item.date)} · {relative(item.date)}
                  {item.source ? (
                    <>
                      {' · '}
                      <a
                        href={item.source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-line-strong underline-offset-2 hover:decoration-accent"
                      >
                        {item.source.name}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
              <Pill tone={KIND_TONE[item.kind] ?? 'muted'}>{item.kind}</Pill>
            </li>
          ))}
          {items.length > 14 ? (
            <li className="pt-2 text-xs text-faint">
              {items.length - 14} more — ask your agent for <span className="font-mono">get_deadlines</span>.
            </li>
          ) : null}
        </ol>
      )}
    </Card>
  );
}

function Reminders({ state }: { state: PageState }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const open = state.reminders.filter((r) => !r.done);
  const done = state.reminders.filter((r) => r.done);
  // Two signals, one highlight: the data changed, or a tool call named this block.
  const dataFlash = useFlash(state.reminders);
  const callFlash = useAgentBlock('reminders', 'block-reminders');
  const flash = dataFlash || callFlash;

  async function add() {
    if (!title.trim() || !due) return;
    await runTool('add_reminder', { title: title.trim(), due }, 'console');
    setTitle('');
    setDue('');
  }

  return (
    <Card id="block-reminders" title="Reminders" subtitle="Yours, or ones your agent added for you." flash={flash}>
      <div className="space-y-3">
        {state.reminders.length === 0 ? (
          <Empty>
            No reminders yet. Add one below, or ask your agent — “remind me to file the UC TAG before Sep 30”.
          </Empty>
        ) : (
          <ul className="space-y-1.5">
            {[...open, ...done].map((r) => (
              <li key={r.id} className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={r.done}
                  onChange={(e) => void runTool('complete_reminder', { id: r.id, done: e.target.checked }, 'console')}
                  className="mt-1 size-4 accent-[var(--color-accent)]"
                  aria-label={`Mark ${r.title} done`}
                />
                <div className="min-w-0">
                  <p className={cx('text-sm leading-snug', r.done ? 'text-faint line-through' : 'text-ink')}>
                    {r.title}
                  </p>
                  <p className="text-[11px] text-faint">
                    {fmtDate(r.due)} · {relative(r.due)}
                    {r.createdBy === 'agent' ? ' · added by your agent' : ''}
                    {r.note ? ` · ${r.note}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="File the UC TAG"
            className="min-w-40 grow"
          />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-40" />
          <Button variant="primary" onClick={add} disabled={!title.trim() || !due}>
            Add
          </Button>
        </div>
      </div>
    </Card>
  );
}
