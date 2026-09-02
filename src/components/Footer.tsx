import { DATA_VERSION } from '../data/meta';

const REPO = 'https://github.com/Samikabir06-code/degreelume-webmcp';

export function Footer() {
  return (
    <footer className="mt-10 border-t border-line bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <p className="max-w-3xl text-sm leading-relaxed text-muted">
          Every answer comes from a deterministic engine over official ASSIST agreements and the El Camino catalog; a
          language model never decides.
        </p>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-faint">
          Data snapshot <span className="font-mono">{DATA_VERSION}</span>. Sample data is labelled. Rows transcribed by
          machine and not yet read by a person are marked <span className="font-mono">unreviewed</span> wherever they
          are used. MIT —{' '}
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-line-strong underline-offset-2 hover:text-ink hover:decoration-accent"
          >
            source on GitHub
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
