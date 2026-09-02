import { useMemo, useState } from 'react';
import type { PageState } from '../lib/store';
import { dataKey, usePassiveTool } from './passive';
import { Bar, Card, Empty, Pill, Spinner } from './ui';
import { cx, num, verdictLabel, verdictTone } from '../lib/format';
import { useFlash } from '../lib/useFlash';

interface CompareRow {
  campus: string;
  campusName: string;
  system: 'UC' | 'CSU' | string;
  verdict: string;
  impacted?: boolean | string | null;
  gpaTarget?: number | null;
  prepDone: number;
  prepTotal: number;
  coverage?: number | null;
  unitsApplied?: number | null;
  unitsElective?: number | null;
  creditsThatCount?: number | null;
  electivesOnly?: string[] | null;
  estTerms?: number | null;
  provenance?: string | null;
  sourceUrl?: string | null;
  catalogYear?: string | null;
}

interface Compare {
  major: string;
  courses?: string[];
  rows: CompareRow[];
  sortedBy?: string;
}

type SortKey = 'campusName' | 'system' | 'prep' | 'units' | 'verdict' | 'gpaTarget';

const VERDICT_ORDER: Record<string, number> = { eligible: 0, competitive: 1, reach: 2 };

const COLUMNS: Array<{ key: SortKey | null; label: string; align?: string; hint?: string }> = [
  { key: 'campusName', label: 'Campus' },
  { key: 'system', label: 'System' },
  { key: 'prep', label: 'Prep satisfied' },
  { key: 'units', label: 'Units counting' },
  { key: 'verdict', label: 'Verdict' },
  { key: 'gpaTarget', label: 'GPA target' },
  { key: null, label: 'Impacted' },
  { key: null, label: 'Source' },
];

export function CreditCarry({ state }: { state: PageState }) {
  const key = dataKey(state);
  const hasMajor = Boolean(state.target.major);
  const result = usePassiveTool<Compare>('compare_campuses', {}, key, hasMajor);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'prep', dir: 'desc' });
  const data = result.output?.data;
  const flash = useFlash(data);

  const rows = useMemo(() => {
    const list = [...(data?.rows ?? [])];
    const value = (r: CompareRow): number | string => {
      switch (sort.key) {
        case 'prep':
          return r.prepTotal > 0 ? r.prepDone / r.prepTotal : -1;
        case 'units':
          return r.creditsThatCount ?? r.unitsApplied ?? -1;
        case 'verdict':
          return VERDICT_ORDER[r.verdict] ?? 9;
        case 'gpaTarget':
          return r.gpaTarget ?? -1;
        case 'system':
          return r.system;
        default:
          return r.campusName;
      }
    };
    list.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [data, sort]);

  function toggle(k: SortKey) {
    setSort((prev) => (prev.key === k ? { key: k, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'desc' }));
  }

  return (
    <Card
      id="credit-carry"
      title="Credit-Carry report"
      subtitle={
        result.output?.summary ??
        'The same coursework against every covered campus — the comparison ASSIST cannot show, because it prints one campus pair at a time.'
      }
      flash={flash}
    >
      {!hasMajor ? (
        <Empty>Pick a major on the left (or let your agent set one) and every covered campus is compared here.</Empty>
      ) : result.loading ? (
        <Spinner label="Auditing every campus" />
      ) : result.error ? (
        <Empty>{result.error.message}</Empty>
      ) : rows.length === 0 ? (
        <Empty>No campus in this data slice has an agreement for that major.</Empty>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="text-left text-[0.7rem] tracking-wide text-faint uppercase">
                {COLUMNS.map((c) => (
                  <th key={c.label} className="px-2 pb-2 font-medium">
                    {c.key ? (
                      <button
                        type="button"
                        onClick={() => toggle(c.key as SortKey)}
                        className={cx(
                          'inline-flex items-center gap-1 transition hover:text-ink',
                          sort.key === c.key && 'text-ink',
                        )}
                      >
                        {c.label}
                        <span aria-hidden className="text-[0.6rem]">
                          {sort.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.campus} className="align-top">
                  <td className="px-2 py-2.5 font-medium text-ink">{r.campusName}</td>
                  <td className="px-2 py-2.5 text-xs text-muted">{r.system}</td>
                  <td className="px-2 py-2.5">
                    <span className="text-ink">
                      {r.prepDone}/{r.prepTotal}
                    </span>{' '}
                    <Bar
                      value={r.prepDone}
                      max={Math.max(r.prepTotal, 1)}
                      tone={verdictTone(r.verdict) === 'muted' ? 'accent' : verdictTone(r.verdict)}
                    />
                  </td>
                  <td className="px-2 py-2.5 text-xs text-muted">
                    <span className="text-ink">{num(r.creditsThatCount ?? r.unitsApplied)}</span> counting
                    {r.unitsElective !== null && r.unitsElective !== undefined ? (
                      <span className="block text-faint">{num(r.unitsElective)} elective-only</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2.5">
                    <Pill tone={verdictTone(r.verdict)}>{verdictLabel(r.verdict)}</Pill>
                  </td>
                  <td className="px-2 py-2.5 text-xs text-muted">{r.gpaTarget ? r.gpaTarget.toFixed(2) : '—'}</td>
                  <td className="px-2 py-2.5 text-xs text-muted">
                    {r.impacted === true ? 'yes' : r.impacted === false ? 'no' : (r.impacted ?? '—')}
                  </td>
                  <td className="px-2 py-2.5 text-xs whitespace-nowrap">
                    {r.sourceUrl ? (
                      <a
                        href={r.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted underline decoration-line-strong underline-offset-2 hover:decoration-accent"
                      >
                        {r.catalogYear ?? 'agreement'}
                      </a>
                    ) : (
                      <span className="text-faint">{r.catalogYear ?? '—'}</span>
                    )}
                    {r.provenance ? (
                      <span
                        className={cx(
                          'ml-1.5 rounded-chip px-1.5 py-0.5 text-[0.65rem]',
                          r.provenance === 'verified' ? 'bg-ok-wash text-ok' : 'bg-warn-wash text-warn',
                        )}
                      >
                        {r.provenance}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.output?.caveats?.length ? (
            <ul className="mt-3 space-y-1 text-xs leading-relaxed text-faint">
              {result.output.caveats.map((c) => (
                <li key={c}>Note: {c}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Card>
  );
}
