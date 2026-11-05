import { readGenerationTraces } from '../services/generation-trace-store';
vi.mock('../services/generation-trace-store', () => ({ readGenerationTraces: vi.fn() }));
import { beforeEach, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { chatRepository } from '../../db/repositories/chat.repository';
import { readPromptTraces } from '../services/prompt-trace-store';
import { promptTraceRoutes } from './prompt-traces';
import { AppError } from '../../core/errors';
vi.mock('../../db/repositories/chat.repository', () => ({ chatRepository: { findById: vi.fn() } }));
vi.mock('../services/prompt-trace-store', () => ({ readPromptTraces: vi.fn() }));
vi.mock('../middleware/auth', () => ({ authMiddleware: (): MiddlewareHandler => async (c, next) => {
  if (!c.req.header('Authorization')) return c.json({ error: 'unauthorized' }, 401);
  c.set('user', { id: 'owner', tenantId: 'tenant' } as never); await next();
} }));
const app = new Hono().route('/chats', promptTraceRoutes);
app.onError((error, c) => c.json({ code: error instanceof AppError ? error.code : 'unknown' }, error instanceof AppError ? error.statusCode as 404 : 500));
const id = 'f5f5e045-1991-46b2-b7fc-54011e35d461';
const get = (auth = true) => app.request(`/chats/${id}/prompt-traces`, { headers: auth ? { Authorization: 'fixture' } : {} });
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(chatRepository.findById).mockResolvedValue({ id, userId: 'owner', tenantId: 'tenant' } as never);
  vi.mocked(readPromptTraces).mockResolvedValue({ traces: [], retentionHours: 24, limit: 10 });
});
it('requires authentication before reading any records', async () => {
  expect((await get(false)).status).toBe(401); expect(readPromptTraces).not.toHaveBeenCalled();
});
it.each([{ userId: 'other', tenantId: 'tenant' }, { userId: 'owner', tenantId: 'other' }, null])('denies foreign/deleted stories: %j', async chat => {
  vi.mocked(chatRepository.findById).mockResolvedValue(chat as never);
  expect((await get()).status).toBe(404); expect(readPromptTraces).not.toHaveBeenCalled();
});
it('returns only stored owner records with no-store', async () => {
  const response = await get(); expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(readPromptTraces).toHaveBeenCalledWith('tenant', 'owner', id);
  expect(await response.json()).toMatchObject({ success: true, data: { traces: [] } });
});
it('validates story identifiers', async () => {
  expect((await app.request('/chats/not-uuid/prompt-traces', { headers: { Authorization: 'fixture' } })).status).toBe(400);
  expect(chatRepository.findById).not.toHaveBeenCalled();
});

it('protects execution diagnostics by both owner and tenant, and disables caching', async () => {
  vi.mocked(readGenerationTraces).mockResolvedValue({ traces: [], retentionHours: 168, limit: 30 });
  const url = `/chats/${id}/generation-traces`;
  expect((await app.request(url)).status).toBe(401);
  for (const foreign of [{ userId: 'other', tenantId: 'tenant' }, { userId: 'owner', tenantId: 'other' }, null]) {
    vi.mocked(chatRepository.findById).mockResolvedValue(foreign as never);
    expect((await app.request(url, { headers: { Authorization: 'fixture' } })).status).toBe(404);
  }
  expect(readGenerationTraces).not.toHaveBeenCalled();
  vi.mocked(chatRepository.findById).mockResolvedValue({ userId: 'owner', tenantId: 'tenant' } as never);
  const response = await app.request(url, { headers: { Authorization: 'fixture' } });
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(readGenerationTraces).toHaveBeenCalledExactlyOnceWith('tenant', 'owner', id);
});
