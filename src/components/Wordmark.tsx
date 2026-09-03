// The product's wordmark, transcribed from DegreeLume's own
// `src/components/site/Wordmark.tsx`: a small mark (a lit path — squares
// stepping up to a brighter one) beside the product name in the display face.
// `tone` flips it for dark surfaces (the footer); `size` scales mark and text
// together. Do not redraw it — this is the same SVG the product ships.

export function Wordmark({ tone = 'light', size = 'md' }: { tone?: 'light' | 'dark'; size?: 'sm' | 'md' | 'lg' }) {
  const text = tone === 'dark' ? 'text-paper' : 'text-ink';
  const dim = size === 'lg' ? 40 : size === 'sm' ? 18 : 22;
  const textSize = size === 'lg' ? 'text-[2.6rem]' : size === 'sm' ? 'text-[15px]' : 'text-[19px]';
  return (
    <span className={`inline-flex items-center gap-2 ${text}`}>
      <Mark size={dim} />
      <span className={`font-display leading-none ${textSize}`}>DegreeLume</span>
    </span>
  );
}

export function Mark({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="2" y="15" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.35" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.6" />
      <rect x="16" y="3" width="6" height="6" rx="1.5" fill="currentColor" />
      <rect x="9" y="16" width="5" height="5" rx="1.25" fill="currentColor" opacity="0.2" />
      <rect x="16" y="10" width="5" height="5" rx="1.25" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

// "Skip to content" for keyboard users: invisible until focused, first in the
// tab order. Same primitive as the product's SkipLink.
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="skip-link"
      onClick={(e) => {
        e.preventDefault();
        const main = document.getElementById('main-content');
        if (!main) return;
        main.focus({ preventScroll: true });
        main.scrollIntoView({ block: 'start' });
      }}
    >
      Skip to content
    </a>
  );
}
