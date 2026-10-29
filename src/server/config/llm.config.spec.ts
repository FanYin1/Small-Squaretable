import { afterEach, expect, it, vi } from 'vitest';
import { getModelMeta, llmConfigs, loadLLMConfig, parseCustomModelLimits } from './llm.config';

afterEach(() => vi.unstubAllEnvs());

it('separates user-provided capacity from the request ceiling for only the exact custom model', () => {
  const limits = JSON.stringify({ 'capacity-test': { contextWindow: 1000000, maxOutputTokens: 64000, requestOutputTokens: 2048 } });
  vi.stubEnv('CUSTOM_LLM_MODEL_LIMITS', limits);
  llmConfigs.push({ provider: 'custom', apiKey: 'synthetic', models: ['capacity-test', 'other-test'] });
  try {
    expect(getModelMeta('capacity-test')).toMatchObject({ contextWindow: 1000000, outputCapabilityTokens: 64000, maxOutputTokens: 2048 });
    expect(getModelMeta('other-test')).toMatchObject({ contextWindow: 4096, maxOutputTokens: 2048 });
    expect(getModelMeta('gpt-4')).toMatchObject({ contextWindow: 8192, maxOutputTokens: 4096 });
    vi.stubEnv('CUSTOM_LLM_MODEL_LIMITS', '');
    expect(getModelMeta('capacity-test')).toMatchObject({ contextWindow: 4096, maxOutputTokens: 2048 });
  } finally { llmConfigs.pop(); }
});

it.each([
  '{', '[]', 'null', '{"unconfigured":{}}',
  ...[
    { contextWindow: 1000000, maxOutputTokens: 64000 },
    { contextWindow: '1M', maxOutputTokens: 64000, requestOutputTokens: 2048 },
    { contextWindow: 1000000, maxOutputTokens: 64000, requestOutputTokens: 64001 },
    { contextWindow: 4096, maxOutputTokens: 64000, requestOutputTokens: 2048 },
    { contextWindow: 1000000, maxOutputTokens: 64000, requestOutputTokens: 0 },
    { contextWindow: 1000000, maxOutputTokens: 64000, requestOutputTokens: 1.5 },
    { contextWindow: 1000000, maxOutputTokens: 64000, requestOutputTokens: 2048, typo: true },
    { contextWindow: 200, maxOutputTokens: 150, requestOutputTokens: 101 },
  ].map(value => JSON.stringify({ 'capacity-test': value })),
])('rejects invalid capacity settings without echoing configuration: %s', raw => {
  expect(() => parseCustomModelLimits(raw, ['capacity-test'])).toThrow('CUSTOM_LLM_MODEL_LIMITS');
});

it('validates capacity during configuration loading rather than waiting for a paid request', () => {
  vi.stubEnv('CUSTOM_LLM_API_KEY', 'synthetic-key');
  vi.stubEnv('CUSTOM_LLM_BASE_URL', 'https://provider.invalid');
  vi.stubEnv('CUSTOM_LLM_API_FORMAT', 'gemini');
  vi.stubEnv('CUSTOM_LLM_MODEL_LIMITS', '{');
  expect(() => loadLLMConfig()).toThrow('CUSTOM_LLM_MODEL_LIMITS');
});

it('keeps existing custom providers on OpenAI format and explicitly opts into Gemini', () => {
  vi.stubEnv('CUSTOM_LLM_API_KEY', 'synthetic-key');
  vi.stubEnv('CUSTOM_LLM_BASE_URL', 'https://provider.invalid');
  vi.stubEnv('CUSTOM_LLM_API_FORMAT', '');
  expect(loadLLMConfig().find(config => config.provider === 'custom')?.apiFormat).toBe('openai');
  vi.stubEnv('CUSTOM_LLM_API_FORMAT', 'gemini');
  expect(loadLLMConfig().find(config => config.provider === 'custom')?.apiFormat).toBe('gemini');
  vi.stubEnv('CUSTOM_LLM_API_FORMAT', 'typo');
  expect(() => loadLLMConfig()).toThrow('CUSTOM_LLM_API_FORMAT');
});
