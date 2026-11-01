import { describe, expect, it, vi } from 'vitest';
import { createEngineeringStoryResolver, parseEngineeringStoryRoute } from './engineering-story-provider';
import type { LLMProviderConfig } from '../../types/llm';

const provider: LLMProviderConfig = { provider: 'custom', apiFormat: 'gemini', baseUrl: 'https://provider.example/v1beta', apiKey: 'production', models: ['model'] };
const route = parseEngineeringStoryRoute({ chatId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002', tenantId: 'test-tenant', model: 'model',
  baseUrl: 'http://127.0.0.1:41990/v1beta', apiKey: 'test-only-gateway-token-123456', expiresAt: '2026-11-01T00:00:00.000Z' });
const beforeExpiry = () => Date.parse('2026-10-30T00:00:00.000Z');

describe('scoped engineering story routing', () => {
  it('leaves all normal and unscoped calls unchanged, without looking up users', async () => {
    const owner = vi.fn();
    const resolve = createEngineeringStoryResolver(route, owner, beforeExpiry);
    expect(await resolve(provider, 'model')).toBe(provider);
    expect(await resolve(provider, 'model', 'another-story')).toBe(provider);
    expect(await createEngineeringStoryResolver(null, owner)(provider, 'model', route.chatId)).toBe(provider);
    expect(owner).not.toHaveBeenCalled();
  });
  it('routes only the owned story and preserves model and wire format', async () => {
    const resolve = createEngineeringStoryResolver(route, async () => route, beforeExpiry);
    expect(await resolve(provider, 'model', route.chatId)).toEqual({ ...provider, baseUrl: route.baseUrl, apiKey: route.apiKey });
    expect(provider.apiKey).toBe('production');
  });
  it.each([null, { userId: 'other', tenantId: route.tenantId }, { userId: route.userId, tenantId: 'other' }])('fails closed on ownership mismatch', async owner => {
    await expect(createEngineeringStoryResolver(route, async () => owner, beforeExpiry)(provider, 'model', route.chatId))
      .rejects.toMatchObject({ code: 'ENGINEERING_ROUTE_SCOPE' });
  });
  it('fails closed on expiration or model changes', async () => {
    const owner = vi.fn();
    await expect(createEngineeringStoryResolver(route, owner, () => Date.parse(route.expiresAt))(provider, 'model', route.chatId)).rejects.toThrow();
    await expect(createEngineeringStoryResolver(route, owner, beforeExpiry)(provider, 'other', route.chatId)).rejects.toThrow();
    expect(owner).not.toHaveBeenCalled();
  });
  it('rejects malformed privileged configuration', () => {
    for (const value of [{ ...route, chatId: '*' }, { ...route, apiKey: '' }, { ...route, baseUrl: 'file:///tmp/test' }, { ...route, baseUrl: 'http://user:secret@localhost' }]) {
      expect(() => parseEngineeringStoryRoute(value)).toThrow();
    }
  });
});
