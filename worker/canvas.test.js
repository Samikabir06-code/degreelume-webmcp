import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleCanvas, isAllowedCanvasHost } from './canvas.js';

function req(url, init) {
  return new Request(url, init);
}

function fakeCanvasResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isAllowedCanvasHost', () => {
  it('allows any *.instructure.com host', () => {
    expect(isAllowedCanvasHost('elcamino.instructure.com')).toBe(true);
    expect(isAllowedCanvasHost('anything.instructure.com')).toBe(true);
  });

  it('allows any *.canvas.com host', () => {
    expect(isAllowedCanvasHost('foo.canvas.com')).toBe(true);
  });

  it('allows audited vanity hosts from the registry', () => {
    expect(isAllowedCanvasHost('bruinlearn.ucla.edu')).toBe(true);
    expect(isAllowedCanvasHost('canvas.csudh.edu')).toBe(true);
  });

  it('rejects an unaudited vanity host', () => {
    expect(isAllowedCanvasHost('evil.example.com')).toBe(false);
  });

  it('rejects hosts with path traversal or bad characters', () => {
    expect(isAllowedCanvasHost('elcamino.instructure.com/..')).toBe(false);
    expect(isAllowedCanvasHost('el..camino.instructure.com')).toBe(false);
    expect(isAllowedCanvasHost('')).toBe(false);
    expect(isAllowedCanvasHost(undefined)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isAllowedCanvasHost('ELCAMINO.INSTRUCTURE.COM')).toBe(true);
  });
});

describe('handleCanvas — routing', () => {
  it('answers OPTIONS with 204 and no body', async () => {
    const res = await handleCanvas(req('https://x/api/canvas/proxy', { method: 'OPTIONS' }), {});
    expect(res.status).toBe(204);
  });

  it('404s an unknown /api/canvas/* path', async () => {
    const res = await handleCanvas(req('https://x/api/canvas/nope'), {});
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('405s a non-GET proxy request', async () => {
    const res = await handleCanvas(req('https://x/api/canvas/proxy', { method: 'POST' }), {});
    expect(res.status).toBe(405);
  });
});

describe('handleCanvas — GET /api/canvas/hosts', () => {
  it('returns the audited host list', async () => {
    const res = await handleCanvas(req('https://x/api/canvas/hosts'), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.hosts)).toBe(true);
    expect(body.hosts.length).toBeGreaterThan(0);
    const ucla = body.hosts.find((h) => h.id === 'ucla');
    expect(ucla).toMatchObject({ id: 'ucla', name: 'UC Los Angeles', kind: 'university', host: 'bruinlearn.ucla.edu' });
  });
});

describe('handleCanvas — GET /api/canvas/proxy', () => {
  it('401s with no bearer token', async () => {
    const res = await handleCanvas(
      req('https://x/api/canvas/proxy?host=elcamino.instructure.com&path=/api/v1/users/self'),
      {},
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('token_required');
  });

  it('401s with a blank bearer token', async () => {
    const res = await handleCanvas(
      req('https://x/api/canvas/proxy?host=elcamino.instructure.com&path=/api/v1/users/self', {
        headers: { Authorization: 'Bearer   ' },
      }),
      {},
    );
    expect(res.status).toBe(401);
  });

  it('403s a host not on the allow-list', async () => {
    const res = await handleCanvas(
      req('https://x/api/canvas/proxy?host=evil.example.com&path=/api/v1/users/self', {
        headers: { Authorization: 'Bearer tok123' },
      }),
      {},
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('host_not_allowed');
  });

  it('400s a path that does not start with /api/v1/', async () => {
    const res = await handleCanvas(
      req('https://x/api/canvas/proxy?host=elcamino.instructure.com&path=/other/thing', {
        headers: { Authorization: 'Bearer tok123' },
      }),
      {},
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad_path');
  });

  it('400s a path containing ..', async () => {
    const res = await handleCanvas(
      req('https://x/api/canvas/proxy?host=elcamino.instructure.com&path=/api/v1/../secret', {
        headers: { Authorization: 'Bearer tok123' },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it('forwards an allowed GET with the bearer token and Accept header, and returns the upstream body', async () => {
    const fetchMock = vi.fn(async (input, init) => {
      expect(String(input)).toBe('https://elcamino.instructure.com/api/v1/users/self');
      expect(init.method).toBe('GET');
      expect(init.headers.Authorization).toBe('Bearer tok123');
      expect(init.headers.Accept).toBe('application/json');
      return fakeCanvasResponse({ id: 1, name: 'Sam' }, 200);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await handleCanvas(
      req('https://x/api/canvas/proxy?host=elcamino.instructure.com&path=/api/v1/users/self', {
        headers: { Authorization: 'Bearer tok123' },
      }),
      {},
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await res.json()).toEqual({ id: 1, name: 'Sam' });
  });

  it('passes through the upstream status code (e.g. an invalid token)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeCanvasResponse({ errors: [{ message: 'bad token' }] }, 401)));

    const res = await handleCanvas(
      req('https://x/api/canvas/proxy?host=elcamino.instructure.com&path=/api/v1/users/self', {
        headers: { Authorization: 'Bearer bad' },
      }),
      {},
    );
    expect(res.status).toBe(401);
  });

  it('copies the upstream Link header to x-canvas-link', async () => {
    const link = '<https://elcamino.instructure.com/api/v1/courses?page=2>; rel="next"';
    vi.stubGlobal('fetch', vi.fn(async () => fakeCanvasResponse([{ id: 1 }], 200, { Link: link })));

    const res = await handleCanvas(
      req('https://x/api/canvas/proxy?host=elcamino.instructure.com&path=/api/v1/courses', {
        headers: { Authorization: 'Bearer tok123' },
      }),
      {},
    );
    expect(res.headers.get('x-canvas-link')).toBe(link);
  });

  it('omits x-canvas-link when the upstream sends none', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeCanvasResponse([{ id: 1 }], 200)));

    const res = await handleCanvas(
      req('https://x/api/canvas/proxy?host=elcamino.instructure.com&path=/api/v1/courses', {
        headers: { Authorization: 'Bearer tok123' },
      }),
      {},
    );
    expect(res.headers.get('x-canvas-link')).toBeNull();
  });

  it('accepts a Canvas-hosted vanity domain proven in the registry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeCanvasResponse({ id: 2, name: 'Bruin' }, 200)));

    const res = await handleCanvas(
      req('https://x/api/canvas/proxy?host=bruinlearn.ucla.edu&path=/api/v1/users/self', {
        headers: { Authorization: 'Bearer tok123' },
      }),
      {},
    );
    expect(res.status).toBe(200);
  });
});
