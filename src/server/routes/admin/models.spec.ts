import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ update: vi.fn(), models: vi.fn() }));
vi.mock('../../middleware/auth', () => ({ authMiddleware: () => async (_c: unknown, next: () => Promise<void>) => next() }));
vi.mock('../../middleware/rbac', () => ({ requireRole: () => async (_c: unknown, next: () => Promise<void>) => next() }));
vi.mock('../../config/llm.config', () => ({ updateLLMConfig: mocks.update, getAvailableModelsWithMeta: mocks.models, llmConfigs: [] }));
import { adminModelRoutes } from './models';
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
