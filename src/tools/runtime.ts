// Shared runtime types for tool implementations. Fixed so the transfer tools,
// the school tools and the dispatcher can be built independently.

import type { PageState } from '../lib/store';
import type { ToolError, ToolOutput } from './contract';

export interface ToolContext {
  state: PageState;
  setState: (patch: Partial<PageState> | ((prev: PageState) => Partial<PageState>)) => void;
  now: Date;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolImpl<I = any, O = unknown> = (
  input: I,
  ctx: ToolContext,
) => Promise<ToolOutput<O> | ToolError> | ToolOutput<O> | ToolError;

export type ToolImplMap = Record<string, ToolImpl>;

export function toolError(error: string, message: string, hint?: string): ToolError {
  return hint ? { error, message, hint } : { error, message };
}

export function isToolError(x: unknown): x is ToolError {
  return typeof x === 'object' && x !== null && 'error' in x && 'message' in x && !('summary' in x);
}
