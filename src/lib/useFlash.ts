import { useEffect, useRef, useState } from 'react';

// Tools have to execute VISIBLY (docs/PLAN.md §The page): when a tool call
// changes what a block shows, the block flashes once so a viewer — or a demo
// video — can see which part of the page the agent just touched.
//
// Returns a class string to append to the block's className. It is empty most
// of the time and carries the highlight for `ms` after `key` changes. The first
// render never flashes: a page that lights up on load teaches nothing.
export function useFlash(key: unknown, ms = 900): string {
  const [on, setOn] = useState(false);
  const previous = useRef<unknown>(key);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      previous.current = key;
      return;
    }
    if (Object.is(previous.current, key)) return;
    previous.current = key;
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [key, ms]);

  return on ? 'ring-2 ring-accent-bright/60 bg-accent-light/70' : '';
}
