// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOOLS, TOOL_NAMES } from '../tools/contract';

// The dispatcher is stubbed: this file tests the WebMCP wiring, not the
// engine. Agent A's tools/index.ts has its own tests.
vi.mock('../tools', () => ({
  runTool: vi.fn(async (name: string, input: unknown) => ({
    summary: `ran ${name}`,
    data: { echoed: input },
    citations: [],
    caveats: [],
  })),
  renderForAgent: (out: unknown) => JSON.stringify(out),
}));

import {
  registerAllTools,
  webMcpStatus,
  subscribeStatus,
  unregisterAllTools,
  __resetRegistrationForTests,
} from './register';

type Registered = {
  name: string;
  description: string;
  inputSchema: unknown;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
};

function fakeContext(mode: 'sync' | 'async' = 'sync') {
  const tools: Registered[] = [];
  return {
    tools,
    registerTool(tool: Registered, options?: { signal?: AbortSignal }) {
      if (options?.signal?.aborted) throw new Error('aborted');
      tools.push(tool);
      return mode === 'async' ? Promise.resolve() : undefined;
    },
  };
}

beforeEach(() => {
  __resetRegistrationForTests();
  delete (document as { modelContext?: unknown }).modelContext;
  delete (navigator as { modelContext?: unknown }).modelContext;
  delete (window as { __degreelume?: unknown }).__degreelume;
});

describe('registerAllTools', () => {
  it('registers every contract tool with document.modelContext', async () => {
    const ctx = fakeContext();
    (document as { modelContext?: unknown }).modelContext = ctx;

    const status = await registerAllTools();

    expect(status.supported).toBe(true);
    expect(status.api).toBe('document');
    expect(status.registered).toBe(TOOL_NAMES.length);
    expect(status.registered).toBe(TOOLS.length);
    expect(status.error).toBeNull();
    expect(ctx.tools.map((t) => t.name)).toEqual([...TOOL_NAMES]);
  });

  it('marks read-only tools with readOnlyHint and passes the JSON schema through', async () => {
    const ctx = fakeContext();
    (document as { modelContext?: unknown }).modelContext = ctx;
    await registerAllTools();

    const audit = ctx.tools.find((t) => t.name === 'audit_coursework');
    const setTarget = ctx.tools.find((t) => t.name === 'set_student_target');
    expect(audit?.annotations?.readOnlyHint).toBe(true);
    expect(setTarget?.annotations?.readOnlyHint).toBe(false);
    expect(audit?.inputSchema).toMatchObject({ type: 'object' });
    expect(audit?.description.length).toBeGreaterThan(40);
  });

  it('execute returns MCP text content built by renderForAgent', async () => {
    const ctx = fakeContext();
    (document as { modelContext?: unknown }).modelContext = ctx;
    await registerAllTools();

    const tool = ctx.tools.find((t) => t.name === 'list_options')!;
    const result = await tool.execute({});

    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('ran list_options');
  });

  it('awaits a registerTool that returns a promise', async () => {
    const ctx = fakeContext('async');
    (document as { modelContext?: unknown }).modelContext = ctx;
    const status = await registerAllTools();
    expect(status.registered).toBe(TOOL_NAMES.length);
  });

  it('falls back to the deprecated navigator.modelContext', async () => {
    const ctx = fakeContext();
    (navigator as { modelContext?: unknown }).modelContext = ctx;
    const status = await registerAllTools();
    expect(status.api).toBe('navigator');
    expect(status.registered).toBe(TOOL_NAMES.length);
  });

  it('reports unsupported — not an error — when the browser has no Model Context API', async () => {
    const status = await registerAllTools();
    expect(status).toEqual({ supported: false, api: null, registered: 0, error: null });
    expect(webMcpStatus().registered).toBe(0);
  });

  it('still exposes window.__degreelume for the console and the inspector extension', async () => {
    await registerAllTools();
    expect(window.__degreelume?.tools).toEqual([...TOOL_NAMES]);
    const out = (await window.__degreelume!.run('list_options', {})) as { summary: string };
    expect(out.summary).toBe('ran list_options');
    expect(window.__degreelume!.status().supported).toBe(false);
  });

  it('is idempotent — a second call registers nothing twice', async () => {
    const ctx = fakeContext();
    (document as { modelContext?: unknown }).modelContext = ctx;
    const a = await registerAllTools();
    const b = await registerAllTools();
    expect(b).toBe(a);
    expect(ctx.tools).toHaveLength(TOOL_NAMES.length);
  });

  it('captures the first failure and keeps registering the rest', async () => {
    const ctx = fakeContext();
    let calls = 0;
    const failing = {
      registerTool(tool: Registered) {
        calls += 1;
        if (calls === 2) throw new Error('registerTool exploded');
        ctx.tools.push(tool);
      },
    };
    (document as { modelContext?: unknown }).modelContext = failing;

    const status = await registerAllTools();
    expect(status.supported).toBe(true);
    expect(status.registered).toBe(TOOL_NAMES.length - 1);
    expect(status.error).toBe('registerTool exploded');
  });

  it('notifies subscribers and resets on unregister', async () => {
    const ctx = fakeContext();
    (document as { modelContext?: unknown }).modelContext = ctx;
    const seen: number[] = [];
    const stop = subscribeStatus((s) => seen.push(s.registered));

    await registerAllTools();
    expect(seen).toEqual([TOOL_NAMES.length]);

    unregisterAllTools();
    expect(seen).toEqual([TOOL_NAMES.length, 0]);
    expect(webMcpStatus().supported).toBe(false);
    stop();
  });
});
