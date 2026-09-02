// Read-only Canvas proxy (docs/PLAN.md §Worker).
//
//   GET /api/canvas/hosts
//     -> { hosts: [{id, name, kind, host}] }  — the audited picker list.
//
//   GET /api/canvas/proxy?host=<canvas host>&path=</api/v1/...>
//   Authorization: Bearer <student's Canvas token>
//     -> forwards the GET to https://<host><path> with the same bearer token,
//        only for allow-listed hosts and only for /api/v1/* paths, and
//        returns the upstream status + JSON body. The pagination Link header
//        is copied to the response as x-canvas-link. Nothing but GET is ever
//        issued upstream, and the token is never stored or logged.
//
// This Worker holds no secrets and stores nothing: unlike the main product's
// Canvas Connect, the token lives only in the requesting browser's
// localStorage and rides along on every call (docs/PLAN.md rule 4).

import { CANVAS_INSTITUTIONS, CANVAS_HOSTS } from '../src/data/canvasInstitutions.ts';

const UPSTREAM_TIMEOUT_MS = 15_000;
const MAX_UPSTREAM_BYTES = 2_097_152;
// Instructure enforces a User-Agent on API requests (2026): a request without
// one is answered 403 with an HTML page, and a Worker's fetch sends none.
export const CANVAS_USER_AGENT = 'DegreeLume-Assistant/1.0 (+https://assistant.degreelume.com)';

const RESPONSE_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
});

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...RESPONSE_HEADERS, ...extraHeaders },
  });
}

// ─── Which hosts a token may be sent to ────────────────────────────────────
//
// The host list IS the security boundary: an unrestricted host would let a
// crafted request send a student's Canvas token to an attacker's server. Two
// shapes are allowed and nothing else:
//
//   · any *.instructure.com / *.canvas.com — Instructure operates every one
//     of those, so a token can only ever reach Instructure's own
//     infrastructure;
//   · the audited vanity hosts in src/data/canvasInstitutions.ts, each proven
//     to be that school's Canvas by something only the school controls.
//
// A vanity host that is NOT on the audited list is refused, however
// plausible it looks. Copied from the main product's worker/canvas.js.
export function isAllowedCanvasHost(host) {
  const h = String(host ?? '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(h) || h.includes('..')) return false;
  if (/(\.instructure\.com|\.canvas\.com)$/.test(h)) return true;
  return CANVAS_HOSTS.has(h);
}

function isAllowedPath(path) {
  if (typeof path !== 'string' || !path) return false;
  if (path.includes('..')) return false;
  return path.startsWith('/api/v1/');
}

async function readCappedJson(response) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_UPSTREAM_BYTES) throw new Error('canvas_upstream_too_large');
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_UPSTREAM_BYTES) {
      await reader.cancel();
      throw new Error('canvas_upstream_too_large');
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try {
    return JSON.parse(text || 'null');
  } catch {
    return null;
  }
}

async function timedFetch(input, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function bearerToken(request) {
  const header = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
}

async function handleHosts() {
  const hosts = CANVAS_INSTITUTIONS.map((i) => ({ id: i.id, name: i.name, kind: i.kind, host: i.host }));
  return json({ hosts });
}

async function handleProxy(request) {
  const url = new URL(request.url);
  const host = (url.searchParams.get('host') || '').toLowerCase();
  const path = url.searchParams.get('path') || '';

  // Never log the token — not even its presence/absence beyond this check.
  const token = bearerToken(request);
  if (!token) return json({ error: 'token_required' }, 401);

  if (!isAllowedCanvasHost(host)) return json({ error: 'host_not_allowed' }, 403);
  if (!isAllowedPath(path)) return json({ error: 'bad_path' }, 400);

  let upstream;
  try {
    upstream = await timedFetch(`https://${host}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': CANVAS_USER_AGENT,
      },
    });
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return json({ error: timedOut ? 'canvas_timeout' : 'canvas_unreachable' }, 502);
  }

  let body;
  try {
    body = await readCappedJson(upstream);
  } catch {
    return json({ error: 'canvas_upstream_too_large' }, 502);
  }

  const link = upstream.headers.get('link') || upstream.headers.get('Link');
  const headers = link ? { 'x-canvas-link': link } : {};
  return json(body, upstream.status, headers);
}

export async function handleCanvas(request) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    // Same-origin only — no CORS headers needed.
    return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
  }

  if (url.pathname === '/api/canvas/hosts' && request.method === 'GET') {
    return handleHosts();
  }

  if (url.pathname === '/api/canvas/proxy' && request.method === 'GET') {
    return handleProxy(request);
  }

  if (url.pathname === '/api/canvas/proxy') {
    // Only GET is ever forwarded upstream (docs/PLAN.md rule 4).
    return json({ error: 'method_not_allowed' }, 405);
  }

  return json({ error: 'not_found' }, 404);
}
