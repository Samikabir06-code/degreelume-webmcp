import { DATA_VERSION } from '../data/meta';
import { Wordmark } from './Wordmark';

const REPO = 'https://github.com/Samikabir06-code/degreelume-webmcp';

// The product's closing band, transcribed: the darkest ink surface in the
// system (#191919), the wordmark set large, columns under a hairline, and a
// mono uppercase legal line. It is also the one place the beta status and the
// data snapshot are stated.
const link = 'text-[14px] text-[#b8b8b4] hover:text-paper transition-colors';
const head = 'text-[14px] font-medium text-paper mb-4';

export function Footer() {
  return (
    <footer className="mt-12 bg-umber-ink text-paper">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-6 md:py-16">
        <Wordmark tone="dark" size="lg" />

        <div className="mt-12 grid gap-10 border-t border-white/10 pt-8 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <h2 className={head}>Where the answers come from</h2>
            <p className="max-w-[46ch] text-[14px] leading-relaxed text-[#b8b8b4]">
              Every answer comes from a deterministic engine over official ASSIST agreements and the El Camino catalog;
              a language model never decides.
            </p>
            <p className="mt-4 max-w-[46ch] text-[13px] leading-relaxed text-[#8a8a86]">
              Sample data is labelled. Rows transcribed by machine and not yet read by a person are marked{' '}
              <span className="font-mono">unreviewed</span> wherever they are used.
            </p>
          </div>

          <nav aria-label="Official sources">
            <h2 className={head}>Official sources</h2>
            <ul className="space-y-2.5">
              <li>
                <a href="https://assist.org" target="_blank" rel="noreferrer" className={link}>
                  ASSIST.org
                </a>
              </li>
              <li>
                <a href="https://www.elcamino.edu" target="_blank" rel="noreferrer" className={link}>
                  El Camino College catalog
                </a>
              </li>
              <li>
                <a href="https://admission.universityofcalifornia.edu" target="_blank" rel="noreferrer" className={link}>
                  UC admissions
                </a>
              </li>
            </ul>
          </nav>

          <nav aria-label="This project">
            <h2 className={head}>This project</h2>
            <ul className="space-y-2.5">
              <li>
                <a href={REPO} target="_blank" rel="noreferrer" className={link}>
                  source on GitHub
                </a>
              </li>
              <li>
                <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer" className={link}>
                  MIT licence
                </a>
              </li>
            </ul>
            <p className="mt-6 max-w-[26ch] text-[13px] leading-relaxed text-[#8a8a86]">
              Beta · a planning aid, not an official degree or admission decision.
            </p>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 font-mono text-[11px] tracking-[0.06em] text-[#8a8a86] uppercase sm:flex-row sm:items-center sm:justify-between">
          <p>
            Built for the WebMCP Challenge, September 2026 · data snapshot {DATA_VERSION}
          </p>
          <p>
            <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-paper">
              github.com/Samikabir06-code/degreelume-webmcp
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
