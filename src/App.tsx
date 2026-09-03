import { useEffect, useMemo } from 'react';
import { usePageState } from './lib/store';
import { registerAllTools } from './webmcp/register';
import { ECC_COURSES } from './data/courses';
import { Header } from './components/Header';
import { Intro } from './components/Intro';
import { StudentPanel } from './components/StudentPanel';
import { Today } from './components/Today';
import { CreditCarry } from './components/CreditCarry';
import { ActivityFeed } from './components/ActivityFeed';
import { ToolConsole } from './components/ToolConsole';
import { Footer } from './components/Footer';

export default function App() {
  const state = usePageState();

  // Hand the thirteen tools to the browser's Model Context API. Idempotent, so
  // StrictMode's double mount in dev registers nothing twice.
  useEffect(() => {
    void registerAllTools();
  }, []);

  const catalogCodes = useMemo(() => [...new Set(ECC_COURSES.map((c) => c.code))].sort(), []);

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <Header />

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl grow px-4 py-8 outline-none sm:px-6">
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
          {/* The header is 68px of bar over a 33px status strip, so a sticky
              panel has to clear 101px, not the bar alone. */}
          <div className="min-w-0 lg:sticky lg:top-28">
            <StudentPanel state={state} />
          </div>

          {/* min-w-0: without it a grid column refuses to shrink below its
              widest child, and the tables would push the page sideways. */}
          <div className="min-w-0 space-y-4">
            <Intro state={state} />
            <Today state={state} catalogCodes={catalogCodes} />
            <CreditCarry state={state} />
            <ActivityFeed state={state} />
            <ToolConsole />
          </div>
        </div>
      </main>

      <datalist id="ecc-catalog-codes">
        {catalogCodes.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>

      <Footer />
    </div>
  );
}
