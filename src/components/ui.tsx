import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Check, ChevronDown, Clock, HelpCircle, X } from 'lucide-react';
import { cx } from '../lib/format';

// The product's UI primitives, transcribed from DegreeLume's own
// `src/components/ui/*` so a card, a chip or a status dot here is the same
// object it is in the product: 24px card radius on a hairline over ivory,
// 16px controls, 12px chip radius with true pills at 9999px, one lilac
// accent, and status that never speaks by colour alone.

export type Tone = 'ok' | 'warn' | 'risk' | 'accent' | 'muted';

// Status badges follow the product's FreshnessBadge geometry exactly:
// rounded-full, 10px semibold, px-2 py-0.5, a hairline of the hue at 20%.
const TONE_CLASS: Record<Tone, string> = {
  ok: 'bg-ok-wash text-ok border-ok/20',
  warn: 'bg-warn-wash text-warn border-warn/20',
  risk: 'bg-risk-wash text-risk border-risk/20',
  accent: 'bg-accent-light text-accent border-accent/20',
  muted: 'bg-parchment text-faint border-line',
};

/** A panel. The product's card: hairline on ivory, 24px radius, resting shadow. */
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
        'rounded-card border border-line bg-ivory shadow-card transition-[background-color,box-shadow] duration-700',
        flash,
      )}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-[15px] leading-tight font-semibold text-ink">{title}</h2>
            {subtitle ? <p className="mt-1 text-[12.5px] leading-snug text-faint">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      )}
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

/** A status badge. Product geometry: pill, 10px semibold, hue at 20% hairline. */
export function Pill({ tone = 'muted', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap',
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Status that never speaks by colour alone — the product's StatusDot: a tinted
 * circle carrying a distinct icon plus an accessible label.
 */
export function StatusDot({
  status,
  size = 'md',
}: {
  status: 'done' | 'in-progress' | 'missing' | 'unknown';
  size?: 'sm' | 'md';
}) {
  const CONFIG = {
    done: { icon: Check, bg: 'bg-ok-wash', text: 'text-ok', label: 'Done' },
    'in-progress': { icon: Clock, bg: 'bg-warn-wash', text: 'text-warn', label: 'In progress' },
    missing: { icon: X, bg: 'bg-risk-wash', text: 'text-risk', label: 'Missing' },
    unknown: { icon: HelpCircle, bg: 'bg-steel-bg', text: 'text-steel', label: 'Needs verification' },
  } as const;
  const sz = size === 'sm' ? 'size-5' : 'size-6';
  const iconSz = size === 'sm' ? 12 : 14;
  const { icon: Icon, bg, text, label } = CONFIG[status] ?? CONFIG.missing;
  return (
    <span role="img" aria-label={label} className={cx('inline-flex shrink-0 items-center justify-center rounded-full', sz, bg, text)}>
      <Icon size={iconSz} strokeWidth={2.5} aria-hidden="true" />
    </span>
  );
}

/** A course chip. The product's confirmable chip: a pill on a hairline over ivory. */
export function Chip({ children, onRemove, title }: { children: ReactNode; onRemove?: () => void; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-ivory py-1.5 pr-1.5 pl-3 font-mono text-xs text-ink"
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${typeof children === 'string' ? children : 'course'}`}
          className="grid size-4 place-items-center rounded-full text-faint transition-colors hover:bg-parchment hover:text-ink"
        >
          <X size={11} strokeWidth={2.5} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

/**
 * The product's three button shapes, plus the two quiet ones this page needs.
 * Geometry, height, radius and press scale all live in index.css so a button
 * here is the same object as a button in the product.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'lilac';
  size?: 'sm' | 'md';
}) {
  const shape = {
    primary: 'btn-dark',
    secondary: 'btn-outline',
    lilac: 'btn-lilac',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
  }[variant];
  // ghost and danger are already the dense size; only the three product
  // shapes need the modifier.
  const dense = size === 'sm' && variant !== 'ghost' && variant !== 'danger' ? 'btn-sm' : '';
  return <button type="button" className={cx(shape, dense, className)} {...rest} />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11.5px] leading-relaxed text-faint">{hint}</span> : null}
    </label>
  );
}

// 16px control radius on a hairline over ivory, with the accent as the focus
// ring — the product's search-input, at panel density.
const CONTROL =
  'w-full rounded-control border border-line bg-ivory px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20';

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={cx(CONTROL, 'appearance-none pr-8', className)} {...rest} />
      <ChevronDown
        size={14}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-faint"
      />
    </span>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, 'bg-paper font-mono text-xs leading-relaxed', className)} {...rest} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-control border border-dashed border-line bg-paper px-3.5 py-3 text-sm leading-relaxed text-faint">
      {children}
    </p>
  );
}

/**
 * A coverage bar. Scaled with a transform, never a width — the house rule, so
 * the fill can grow in on first paint and re-target smoothly when the value
 * changes. The resting value lives in `--p`; `.bar-fill` does the rest.
 */
export function Bar({ value, max, tone = 'accent' }: { value: number; max: number; tone?: Tone }) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const fill = { ok: 'bg-ok', warn: 'bg-warn', risk: 'bg-risk', accent: 'bg-accent', muted: 'bg-cloud' }[tone];
  return (
    <span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-parchment align-middle">
      <span
        className={cx('bar-fill block h-full rounded-full', fill)}
        style={{ '--p': share } as React.CSSProperties}
      />
    </span>
  );
}

export function Spinner({ label = 'Working' }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 py-2 text-sm text-faint">
      <span
        aria-hidden="true"
        className="size-3 animate-spin rounded-full border-2 border-line border-t-accent"
      />
      {label}…
    </p>
  );
}

/** The small uppercase section label. The product's `.eyebrow`. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('eyebrow', className)}>{children}</span>;
}
