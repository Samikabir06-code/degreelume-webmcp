// Cloudflare Worker for DegreeLume Assistant.
//
// Static assets (the Vite bundle) are served by Cloudflare; this module only
// runs for /api/*. Today that is the read-only Canvas proxy (see canvas.js).
// `handleApi` is also mounted by vite-plugin-api.ts in dev so localhost and
// production behave the same.

import { handleCanvas } from './canvas.js';

const SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS },
  });
}

export async function handleApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') {
    return json({ ok: true, service: 'degreelume-webmcp', time: new Date().toISOString() });
  }
  if (url.pathname.startsWith('/api/canvas/')) {
    return handleCanvas(request, env);
  }
  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    // Everything else is a static asset; run_worker_first only covers /api/*.
    return env.ASSETS.fetch(request);
  },
};
