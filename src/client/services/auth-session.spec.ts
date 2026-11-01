import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, csrfTokenManager, refreshSessionTokens } from './api';
import { authApi } from './auth.api';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const denied = () => json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid authentication token' } }, 401);
const renewed = () => json({ success: true, data: { accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 21600 } });
function session(token = 'expired', refresh = 'old-refresh', tenant = 'tenant-a') {
  localStorage.setItem('token', token); localStorage.setItem('refreshToken', refresh); localStorage.setItem('tenantId', tenant);
}
beforeEach(() => { localStorage.clear(); session(); csrfTokenManager.clearToken(); vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); csrfTokenManager.clearToken(); });

describe('session rotation and authenticated request recovery', () => {
  it('reads the actual flat refresh contract and stores both rotated tokens', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(renewed());
    expect(await authApi.refreshToken({ refreshToken: 'old-refresh' })).toEqual({ token: 'new-access', refreshToken: 'new-refresh' });
    expect(localStorage.getItem('refreshToken')).toBe('new-refresh');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a rejected model save once with fresh authentication and CSRF, preserving its body', async () => {
    const body = { models: ['model'], apiKey: 'fixture-secret', modelLimits: {} };
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ csrfToken: 'a'.repeat(64) }))
      .mockResolvedValueOnce(denied()).mockResolvedValueOnce(renewed())
      .mockResolvedValueOnce(json({ csrfToken: 'b'.repeat(64) }))
      .mockResolvedValueOnce(json({ success: true, data: { saved: true } }));
    expect(await api.put('/admin/models', body)).toEqual({ saved: true });
    const saves = vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/v1/admin/models');
    expect(saves).toHaveLength(2);
    expect(saves[1][1]).toMatchObject({ headers: { Authorization: 'Bearer new-access', 'X-CSRF-Token': 'b'.repeat(64) }, body: JSON.stringify(body) });
  });

  it('recovers expiration while obtaining CSRF before attempting the business write', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(denied()).mockResolvedValueOnce(renewed())
      .mockResolvedValueOnce(json({ csrfToken: 'b'.repeat(64) })).mockResolvedValueOnce(json({ success: true, data: { saved: true } }));
    await api.put('/admin/models', {});
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/v1/admin/models')).toHaveLength(1);
  });

  it('shares one rotation between simultaneous HTTP and WebSocket/store recovery', async () => {
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === '/api/v1/auth/refresh') return new Promise(resolve => { finish = resolve; });
      return localStorage.getItem('token') === 'expired' ? denied() : json({ success: true, data: { ok: true } });
    });
    const a = api.get('/admin/models'); const b = api.get('/users');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const ws = authApi.refreshToken({ refreshToken: 'old-refresh' });
    finish(renewed());
    const results = await Promise.all([a, b, ws]);
    expect(results[0]).toEqual({ ok: true }); expect(results[1]).toEqual({ ok: true });
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/v1/auth/refresh')).toHaveLength(1);
  });

  it('settles every waiter on failed rotation, clears only that session and keeps the page', async () => {
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(async url => url === '/api/v1/auth/refresh'
      ? new Promise(resolve => { finish = resolve; }) : denied());
    const href = window.location.href;
    const results = Promise.allSettled([api.get('/admin/models'), api.get('/users')]);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    finish(denied());
    expect((await results).every(result => result.status === 'rejected')).toBe(true);
    expect(localStorage.getItem('token')).toBeNull(); expect(localStorage.getItem('tenantId')).toBeNull();
    expect(window.location.href).toBe(href);
  });

  it('does not overwrite a different login when an old refresh completes', async () => {
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = refreshSessionTokens(); session('other-access', 'other-refresh', 'tenant-b');
    finish(renewed());
    await expect(pending).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
    expect(localStorage.getItem('token')).toBe('other-access');
    expect(localStorage.getItem('refreshToken')).toBe('other-refresh');
  });

  it('preserves the session and settles all waiters on a temporary network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
    const results = await Promise.allSettled([refreshSessionTokens(), refreshSessionTokens()]);
    expect(results.every(result => result.status === 'rejected')).toBe(true);
    expect(localStorage.getItem('refreshToken')).toBe('old-refresh'); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not recursively refresh a failed login or an upstream model authentication error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(denied());
    await expect(api.post('/auth/login', {})).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockResolvedValueOnce(json({ success: false, error: { code: 'LLM_API_ERROR', message: 'upstream unauthorized' } }, 401));
    await expect(api.get('/llm/test')).rejects.toMatchObject({ code: 'LLM_API_ERROR' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('stops after one retry when the refreshed token is also rejected', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(denied()).mockResolvedValueOnce(renewed()).mockResolvedValueOnce(denied());
    await expect(api.get('/admin/models')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(fetch).toHaveBeenCalledTimes(3); expect(localStorage.getItem('token')).toBeNull();
  });

  it('does not replay a network failure or an old request after switching accounts', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('offline'));
    await expect(api.get('/admin/models')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockImplementationOnce(async () => { session('other', 'other-refresh', 'tenant-b'); return denied(); });
    await expect(api.get('/admin/models')).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
    expect(localStorage.getItem('token')).toBe('other'); expect(fetch).toHaveBeenCalledTimes(2);
  });
});
