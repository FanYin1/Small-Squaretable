import type { Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ update: vi.fn(), models: vi.fn(), saveEntry: vi.fn(), deleteEntry: vi.fn() }));
vi.mock('../../middleware/auth', () => ({ authMiddleware: () => async (c: Context, next: () => Promise<void>) => {
  const role = c.req.header('X-Test-Role') ?? 'admin';
  if (role === 'anonymous') return c.json({ success: false }, 401);
  c.set('user', { role }); return next();
} }));
vi.mock('../../config/llm.config', () => ({ updateLLMConfig: mocks.update, getAvailableModelsWithMeta: mocks.models, getDefaultModel: () => "test", getModelMeta: () => ({ id: "test", maxInputTokens: 900000 }), saveModelEntry: mocks.saveEntry, deleteModelEntry: mocks.deleteEntry, llmConfigs: [{ provider: "custom", models: ["test"], hiddenModels: ["test"] }] }));
import { adminModelRoutes } from './models';
adminModelRoutes.onError((error, c) => c.json({ success: false }, error.message.includes('Requires') ? 403 : 500));
const input = { provider: 'custom', baseUrl: 'https://example.invalid/v1', models: ['test'],
  modelLimits: { test: { contextWindow: 1000000, maxInputTokens: 900000, maxOutputTokens: 128000, requestOutputTokens: 10000 } } };
const put = (body: unknown) => adminModelRoutes.request('/', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.models.mockReturnValue([{ id: 'test', maxInputTokens: 900000 }]); });
describe('administrator capacity API (isolated authorization)', () => {
  it('passes independent input ceilings through the API and exposes capacity metadata', async () => {
    expect((await put(input)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(input);
    const response = await adminModelRoutes.request('/');
    expect((await response.json()).data.models[0].maxInputTokens).toBe(900000);
  });
  it.each([0, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid input capacities before persistence: %s', maxInputTokens => {
    return put({ ...input, modelLimits: { test: { ...input.modelLimits.test, maxInputTokens } } }).then(response => {
      expect(response.status).toBe(400); expect(mocks.update).not.toHaveBeenCalled();
    });
  });
  it('does not silently strip misspelled capacity fields', async () => {
    expect((await put({ ...input, modelLimits: { test: { ...input.modelLimits.test, maxInputs: 8000 } } })).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});


describe('individual model management API', () => {
  it('lists hidden models for administrators without credentials', async () => {
    const data = (await (await adminModelRoutes.request('/')).json()).data;
    expect(data.models[0]).toMatchObject({ id: 'test', hidden: true, channelId: 'custom' });
    expect(data.providers[0].models[0].hidden).toBe(true);
    expect(data.providers[0]).not.toHaveProperty('apiKey');
  });
  it('creates an entry, changes visibility and deletes names containing slashes', async () => {
    const headers = { 'Content-Type': 'application/json' };
    const response = await adminModelRoutes.request('/entries', { method: 'POST', headers,
      body: JSON.stringify({ id: 'vendor/model', channelId: 'custom', limits: input.modelLimits.test }) });
    expect(response.status).toBe(200);
    expect(mocks.saveEntry).toHaveBeenCalledWith('vendor/model', { limits: input.modelLimits.test }, 'custom');
    expect((await adminModelRoutes.request('/entries/vendor%2Fmodel', { method: 'PATCH', headers, body: JSON.stringify({ hidden: true }) })).status).toBe(200);
    expect(mocks.saveEntry).toHaveBeenLastCalledWith('vendor/model', { hidden: true });
    expect((await adminModelRoutes.request('/entries/vendor%2Fmodel', { method: 'DELETE' })).status).toBe(200);
    expect(mocks.deleteEntry).toHaveBeenCalledWith('vendor/model');
  });
  it('rejects malformed visibility and missing create capacity before mutation', async () => {
    const headers = { 'Content-Type': 'application/json' };
    expect((await adminModelRoutes.request('/entries/test', { method: 'PATCH', headers, body: JSON.stringify({ hidden: 'false' }) })).status).toBe(400);
    expect((await adminModelRoutes.request('/entries', { method: 'POST', headers, body: JSON.stringify({ id: 'new', channelId: 'custom' }) })).status).toBe(400);
    expect(mocks.saveEntry).not.toHaveBeenCalled();
  });
});


it.each(['user', 'moderator', 'anonymous'])('blocks model mutations for %s', async role => {
  for (const [method, path] of [['GET', '/'], ['POST', '/entries'], ['PATCH', '/entries/test'], ['DELETE', '/entries/test'], ['PUT', '/']] as const) {
    const response = await adminModelRoutes.request(path, { method, headers: { 'X-Test-Role': role } });
    expect(response.status).toBe(role === 'anonymous' ? 401 : 403);
  }
  expect(mocks.saveEntry).not.toHaveBeenCalled(); expect(mocks.deleteEntry).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
});
