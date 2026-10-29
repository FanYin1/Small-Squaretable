import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { api, csrfTokenManager } from './api';

const csrf = (value: string) => ({ ok: true, json: async () => ({ csrfToken: value.repeat(64) }) });
const success = () => ({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ success: true, data: { saved: true } }) });

describe('CSRF cache follows the access credential', () => {
  beforeEach(() => { localStorage.clear(); csrfTokenManager.clearToken(); vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); csrfTokenManager.clearToken(); });

  it('coalesces concurrent reads and fetches anew after credential refresh', async () => {
    localStorage.setItem('token', 'first');
    vi.mocked(fetch).mockResolvedValueOnce(csrf('a') as Response).mockResolvedValueOnce(csrf('b') as Response);
    expect(await Promise.all([csrfTokenManager.getToken(), csrfTokenManager.getToken()])).toEqual(['a'.repeat(64), 'a'.repeat(64)]);
    expect(fetch).toHaveBeenCalledTimes(1);
    localStorage.setItem('token', 'refreshed');
    expect(await csrfTokenManager.getToken()).toBe('b'.repeat(64));
    expect(fetch).toHaveBeenLastCalledWith('/api/v1/csrf-token', { headers: { Authorization: 'Bearer refreshed' } });
  });

  it('does not send a mutation or poison the next account cache after an old fetch resolves', async () => {
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(csrf('b') as Response);
    localStorage.setItem('token', 'first');
    const mutation = api.post('/characters', { name: 'old-account-action' });
    const rejected = expect(mutation).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
    localStorage.setItem('token', 'second');
    expect(await csrfTokenManager.getToken()).toBe('b'.repeat(64));
    finish(csrf('a') as Response);
    await rejected;
    expect(await csrfTokenManager.getToken()).toBe('b'.repeat(64));
    expect(vi.mocked(fetch).mock.calls.every(([url]) => url === '/api/v1/csrf-token')).toBe(true);
  });

  it('clearing login state invalidates an in-flight fetch', async () => {
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    localStorage.setItem('token', 'first');
    const pending = csrfTokenManager.getToken();
    const rejected = expect(pending).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
    localStorage.removeItem('token');
    csrfTokenManager.clearToken();
    finish(csrf('a') as Response);
    await rejected;
    expect(await csrfTokenManager.getToken()).toBeNull();
  });

  it('uses the new credential and CSRF pair for the first write after refresh', async () => {
    localStorage.setItem('token', 'first');
    vi.mocked(fetch).mockResolvedValueOnce(csrf('a') as Response);
    await csrfTokenManager.getToken();
    localStorage.setItem('token', 'refreshed');
    vi.mocked(fetch).mockResolvedValueOnce(csrf('b') as Response).mockResolvedValueOnce(success() as Response);
    await api.post('/characters', { name: 'new-action' });
    expect(fetch).toHaveBeenLastCalledWith('/api/v1/characters', expect.objectContaining({ headers: expect.objectContaining({
      Authorization: 'Bearer refreshed', 'X-CSRF-Token': 'b'.repeat(64),
    }) }));
  });

  it('obtains a renewed access token on an expired-session CSRF response without replaying the write', async () => {
    localStorage.setItem('token', 'expired');
    localStorage.setItem('refreshToken', 'refresh');
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401 } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { accessToken: 'renewed', refreshToken: 'renewed-refresh' } }) } as Response);
    await expect(api.post('/characters', { name: 'one-action' })).rejects.toMatchObject({ code: 'CSRF_TOKEN_UNAVAILABLE' });
    expect(localStorage.getItem('token')).toBe('renewed');
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['/api/v1/csrf-token', '/api/v1/auth/refresh']);
  });

  it('blocks writes when the CSRF service returns invalid data', async () => {
    localStorage.setItem('token', 'first');
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);
    await expect(api.post('/characters', {})).rejects.toMatchObject({ code: 'CSRF_TOKEN_UNAVAILABLE' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
