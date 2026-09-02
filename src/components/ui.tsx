import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { cx } from '../lib/format';

export type Tone = 'ok' | 'warn' | 'risk' | 'accent' | 'muted';

const TONE_CLASS: Record<Tone, string> = {
  ok: 'bg-ok-wash text-ok border-ok/20',
  warn: 'bg-warn-wash text-warn border-warn/20',
  risk: 'bg-risk-wash text-risk border-risk/20',
  accent: 'bg-accent-light text-accent border-accent/20',
  muted: 'bg-parchment text-faint border-line',
};

export function Card({
  title,
  subtitle,
  action,
  flash,
  children,
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  flash?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cx(
        'rounded-card border border-line bg-ivory transition-[background-color,box-shadow] duration-700',
        flash,
      )}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[0.95rem] font-semibold tracking-tight text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs leading-relaxed text-faint">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function Pill({ tone = 'muted', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-chip border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Chip({ children, onRemove, title }: { children: ReactNode; onRemove?: () => void; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-chip border border-line bg-paper py-1 pr-1 pl-2.5 font-mono text-xs text-ink"
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${typeof children === 'string' ? children : 'course'}`}
          className="grid size-4 place-items-center rounded-full text-faint transition hover:bg-cloud hover:text-ink"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-chip font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';
  const sizes = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm';
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent-dark',
    secondary: 'border border-line-strong bg-ivory text-ink hover:bg-parchment',
    ghost: 'text-faint hover:bg-parchment hover:text-ink',
    danger: 'border border-risk/30 bg-ivory text-risk hover:bg-risk-wash',
  }[variant];
  return <button type="button" className={cx(base, sizes, variants, className)} {...rest} />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[0.7rem] leading-relaxed text-faint">{hint}</span> : null}
    </label>
  );
}

const CONTROL =
  'w-full rounded-lg border border-line bg-ivory px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(CONTROL, 'appearance-none pr-7', className)} {...rest} />;
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, className)} {...rest} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line bg-paper px-3 py-3 text-sm leading-relaxed text-faint">
      {children}
    </p>
  );
}

export function Bar({ value, max, tone = 'accent' }: { value: number; max: number; tone?: Tone }) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const fill = { ok: 'bg-ok', warn: 'bg-warn', risk: 'bg-risk', accent: 'bg-accent', muted: 'bg-cloud' }[tone];
  return (
    <span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-parchment align-middle">
      <span className={cx('block h-full origin-left rounded-full', fill)} style={{ transform: `scaleX(${share})` }} />
    </span>
  );
}

export function Spinner({ label = 'Working' }: { label?: string }) {
  return <p className="py-2 text-sm text-faint">{label}…</p>;
}
