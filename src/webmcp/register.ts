// ─── WebMCP registration ─────────────────────────────────────────────────────
//
// This is the whole point of the page: every tool declared in
// tools/contract.ts are handed to the browser's Model Context API, so an agent
// running in the page (ChatGPT's desktop browser, Chrome 149+ behind
// chrome://flags/#enable-webmcp-testing, or the Model Context Tool Inspector
// extension) can call them directly. The agent never sees the student's Canvas
// token and never decides an answer — it calls a tool, the deterministic
// engine answers, and the call lands in the page's activity feed.
//
// The API moved from navigator.modelContext to document.modelContext during
// the origin trial, so we take whichever this browser has.

import { TOOLS, TOOL_NAMES } from '../tools/contract';
import { runTool, renderForAgent } from '../tools';

export type WebMcpStatus = {
  supported: boolean;
  api: 'document' | 'navigator' | null;
  registered: number;
  error: string | null;
};

// Minimal shape of the Model Context API — deliberately narrow. Builds differ
// (some return void from registerTool, some a promise; unregisterTool and
// provideContext are not everywhere), so everything optional stays optional.
interface ModelContextToolResult {
  content: Array<{ type: 'text'; text: string }>;
}

interface ModelContextToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: unknown) => Promise<ModelContextToolResult>;
}

interface ModelContext {
  registerTool(
    tool: ModelContextToolDefinition,
    options?: { signal?: AbortSignal },
  ): void | Promise<unknown>;
  unregisterTool?(name: string): void | Promise<unknown>;
  provideContext?(context: unknown): void | Promise<unknown>;
}

interface DegreelumeConsoleApi {
  tools: string[];
  run: (name: string, input?: unknown) => Promise<unknown>;
  simulateAgentCall: (name: string, input?: unknown) => Promise<unknown>;
  status: () => WebMcpStatus;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
  interface Navigator {
    modelContext?: ModelContext;
  }
  interface Window {
    __degreelume?: DegreelumeConsoleApi;
  }
}

const UNSUPPORTED: WebMcpStatus = { supported: false, api: null, registered: 0, error: null };

let status: WebMcpStatus = { ...UNSUPPORTED };
let controller: AbortController | null = null;
let started: Promise<WebMcpStatus> | null = null;
const listeners = new Set<(s: WebMcpStatus) => void>();

function publish(next: WebMcpStatus) {
  status = next;
  listeners.forEach((l) => l(status));
}

export function webMcpStatus(): WebMcpStatus {
  return status;
}

export function subscribeStatus(cb: (s: WebMcpStatus) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function pickContext(): { ctx: ModelContext; api: 'document' | 'navigator' } | null {
  if (typeof document !== 'undefined' && document.modelContext) {
    return { ctx: document.modelContext, api: 'document' };
  }
  if (typeof navigator !== 'undefined' && navigator.modelContext) {
    return { ctx: navigator.modelContext, api: 'navigator' };
  }
  return null;
}

// The console handle. Present whether or not WebMCP is: it is how a judge
// without an agent-capable browser drives every tool from DevTools, and
// it is what the Model Context Tool Inspector extension reads.
function exposeConsoleApi() {
  if (typeof window === 'undefined') return;
  window.__degreelume = {
    tools: [...TOOL_NAMES],
    run: (name: string, input: unknown = {}) => runTool(name, input, 'console'),
    // Same call, recorded as an agent's. In a browser with no Model Context
    // API there is no other way to see what the page does when an agent uses
    // it — the toast, the flash, the scroll — so this is how the demo (and
    // anyone reading along) exercises that path.
    simulateAgentCall: (name: string, input: unknown = {}) => runTool(name, input, 'agent'),
    status: webMcpStatus,
  };
}

/**
 * Register every tool with this browser's Model Context API.
 * Idempotent: a second call returns the first call's result and does not
 * register anything twice (React StrictMode mounts effects twice in dev).
 */
export function registerAllTools(): Promise<WebMcpStatus> {
  if (started) return started;
  started = doRegister();
  return started;
}

async function doRegister(): Promise<WebMcpStatus> {
  exposeConsoleApi();

  const picked = pickContext();
  if (!picked) {
    publish({ ...UNSUPPORTED });
    return status;
  }

  controller = new AbortController();
  const { signal } = controller;

  if (typeof window !== 'undefined') {
    // Registration is scoped to this document; aborting on unload tells the
    // agent the tools are gone rather than leaving it holding stale handles.
    window.addEventListener('beforeunload', () => controller?.abort(), { once: true });
  }

  let registered = 0;
  let error: string | null = null;

  for (const t of TOOLS) {
    try {
      // May be sync in one build and a promise in another — await covers both.
      await picked.ctx.registerTool(
        {
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: t.readOnly },
          async execute(input: unknown): Promise<ModelContextToolResult> {
            const out = await runTool(t.name, input ?? {}, 'agent');
            return { content: [{ type: 'text', text: renderForAgent(out) }] };
          },
        },
        { signal },
      );
      registered += 1;
    } catch (err) {
      if (!error) error = err instanceof Error ? err.message : String(err);
    }
  }

  publish({ supported: true, api: picked.api, registered, error });
  return status;
}

/** Drop every registration (used by tests; the page aborts on unload). */
export function unregisterAllTools() {
  controller?.abort();
  controller = null;
  started = null;
  publish({ ...UNSUPPORTED });
}

/** Test seam: forget that registration ever ran, without touching listeners. */
export function __resetRegistrationForTests() {
  controller = null;
  started = null;
  status = { ...UNSUPPORTED };
}
