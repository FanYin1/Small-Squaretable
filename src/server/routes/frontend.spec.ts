import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { createFrontendRoutes } from './frontend';

describe('production frontend delivery', () => {
  let directory: string;
  const app = new Hono();

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'squaretable-frontend-'));
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'index.html'), '<!doctype html><title>Story</title>');
    await writeFile(join(directory, 'assets/app-123.js'), 'export const ready = true;');
    await writeFile(join(directory, 'story-experience-demo.html'), 'demo');
    await writeFile(join(directory, 'stats.html'), 'stats');
    app.get('/api/v1/status', (context) => context.json({ success: true }));
    app.route('/', createFrontendRoutes(directory));
  });

  afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

  it('serves the app on a refreshed story URL with revalidation', async () => {
    const response = await app.request('/chat/story-id', { headers: { Accept: 'text/html' } });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<title>Story</title>');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
  });

  it('caches hashed assets and supports HEAD', async () => {
    const response = await app.request('/assets/app-123.js', { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('immutable');
    expect(await response.text()).toBe('');
  });

  it.each(['/api/v1/missing', '/ws/missing', '/health/missing', '/uploads/missing', '/assets/missing.js', '/story-experience-demo.html', '/stats.html'])(
    'does not replace %s with the app', async (url) => {
      const response = await app.request(url, { headers: { Accept: 'text/html' } });
      expect(response.status).toBe(404);
    },
  );

  it('preserves API routing and rejects non-navigation fallbacks', async () => {
    expect(await (await app.request('/api/v1/status')).json()).toEqual({ success: true });
    expect((await app.request('/chat/story-id')).status).toBe(404);
    expect((await app.request('/chat/story-id', { method: 'POST', headers: { Accept: 'text/html' } })).status).toBe(404);
  });
});
