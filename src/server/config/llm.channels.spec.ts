import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
let directory: string;
let config: typeof import('./llm.config');
beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'squaretable-channels-'));
  vi.stubEnv('LLM_CONFIG_PATH', path.join(directory, 'models.json'));
  vi.stubEnv('JWT_SECRET', 'test-only-encryption-key');
  vi.resetModules(); config = await import('./llm.config');
  config.llmConfigs.splice(0);
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true }); });
const channel = { id: 'first', name: 'First', provider: 'custom' as const, apiKey: 'secret-one', baseUrl: 'https://first.invalid/v1/', models: ['gemini'],
  modelLimits: { gemini: { contextWindow: 1000000, maxInputTokens: 900000, maxOutputTokens: 64000, requestOutputTokens: 4096 } } };
describe('independent model channels', () => {
  it('preserves multiple channels, keys, aliases, defaults and limits through an encrypted restart', () => {
    config.updateLLMConfig(channel);
    config.updateLLMConfig({ id: 'second', provider: 'custom', apiKey: 'secret-two', baseUrl: 'https://second.invalid/v1', models: ['other-gemini'],
      modelAliases: { 'other-gemini': 'gemini' }, makeDefault: true });
    expect(config.getDefaultModel()).toBe('other-gemini');
    config.updateLLMConfig({ ...channel, apiKey: '', name: 'Renamed' });
    const stored = fs.readFileSync(config.getPersistedLLMConfigPath(), 'utf8');
    expect(stored).not.toContain('secret-one'); expect(stored).not.toContain('secret-two');
    config.llmConfigs.splice(0); config.loadPersistedLLMConfig();
    expect(config.llmConfigs).toHaveLength(2);
    expect(config.findProviderForModel('gemini')).toMatchObject({ id: 'first', name: 'Renamed', apiKey: 'secret-one', baseUrl: 'https://first.invalid/v1' });
    expect(config.findProviderForModel('other-gemini')).toMatchObject({ apiKey: 'secret-two', modelAliases: { 'other-gemini': 'gemini' } });
    expect(config.getModelMeta('gemini')).toMatchObject({ contextWindow: 1000000, maxInputTokens: 900000, outputCapabilityTokens: 64000, maxOutputTokens: 4096 });
  });
  it('never replaces another custom channel or silently routes duplicate names', () => {
    config.updateLLMConfig(channel);
    expect(() => config.updateLLMConfig({ ...channel, id: 'second', apiKey: '' })).toThrow('API key');
    expect(() => config.updateLLMConfig({ ...channel, id: 'second' })).toThrow('unique');
    expect(config.llmConfigs).toHaveLength(1);
  });
  it('keeps in-memory routing unchanged if persistence fails', () => {
    config.updateLLMConfig(channel);
    fs.unlinkSync(config.getPersistedLLMConfigPath()); fs.mkdirSync(config.getPersistedLLMConfigPath());
    expect(() => config.updateLLMConfig({ ...channel, name: 'Not saved' })).toThrow();
    expect(config.llmConfigs[0].name).toBe('First');
  });
  it('supports legacy channel edits and capacity overrides on native providers', () => {
    config.llmConfigs.push({ provider: 'anthropic', apiKey: 'legacy', baseUrl: 'https://example.invalid/v1', models: ['claude'] });
    config.updateLLMConfig({ provider: 'anthropic', baseUrl: 'https://example.invalid/v1', models: ['claude'],
      modelLimits: { claude: { contextWindow: 200000, maxOutputTokens: 8192, requestOutputTokens: 4000 } } });
    expect(config.llmConfigs).toHaveLength(1);
    expect(config.llmConfigs[0]).toMatchObject({ id: 'anthropic', apiFormat: 'anthropic', apiKey: 'legacy' });
    expect(config.getModelMeta('claude')).toMatchObject({ contextWindow: 200000, maxOutputTokens: 4000 });
  });
  it('allows local Ollama without a key and rejects bad aliases/defaults before persisting', () => {
    config.updateLLMConfig({ id: 'local', provider: 'ollama', baseUrl: 'http://localhost:11434/v1', models: ['qwen'] });
    expect(config.llmConfigs[0].apiKey).toBe('ollama');
    expect(() => config.updateLLMConfig({ ...channel, modelAliases: { missing: 'upstream' } })).toThrow('aliases');
    expect(() => config.updateLLMConfig({ ...channel, defaultModel: 'missing' })).toThrow('default');
  });
});


describe('individual model lifecycle and visibility', () => {
  const limits = { contextWindow: 200000, maxOutputTokens: 64000, requestOutputTokens: 10000 };
  it('creates, updates, hides, restores and deletes one model without changing sibling capacities or credentials', () => {
    config.updateLLMConfig(channel);
    config.saveModelEntry('vendor/model', { upstreamId: 'upstream', limits, makeDefault: true }, 'first');
    expect(config.getDefaultModel()).toBe('vendor/model');
    expect(config.getAvailableModelsWithMeta()[0].id).toBe('vendor/model');
    config.saveModelEntry('vendor/model', { hidden: true, limits: { ...limits, requestOutputTokens: 8000 } });
    expect(config.getAvailableModels()).toEqual(['gemini']);
    expect(config.getDefaultModel()).toBe('gemini');
    expect(config.getModelMeta('vendor/model').maxOutputTokens).toBe(8000);
    expect(config.findProviderForModel('vendor/model')?.apiKey).toBe('secret-one');
    config.llmConfigs.splice(0); config.loadPersistedLLMConfig();
    expect(config.getAvailableModels()).toEqual(['gemini']);
    expect(config.findProviderForModel('vendor/model')?.modelAliases?.['vendor/model']).toBe('upstream');
    config.saveModelEntry('vendor/model', { hidden: false });
    expect(config.getAvailableModels()).toContain('vendor/model');
    config.deleteModelEntry('vendor/model');
    expect(config.findProviderForModel('vendor/model')).toBeNull();
    expect(config.llmConfigs[0].modelAliases).not.toHaveProperty('vendor/model');
    expect(config.llmConfigs[0].modelLimits).not.toHaveProperty('vendor/model');
    expect(config.getModelMeta('gemini').maxOutputTokens).toBe(4096);
  });
  it('preserves an empty channel for reuse after restart and selects a visible default from another channel', () => {
    config.updateLLMConfig(channel);
    config.updateLLMConfig({ ...channel, id: 'second', models: ['second'], modelLimits: {} });
    config.deleteModelEntry('gemini');
    expect(config.getDefaultModel()).toBe('second');
    config.llmConfigs.splice(0); config.loadPersistedLLMConfig();
    expect(config.llmConfigs[0].models).toEqual([]);
    config.saveModelEntry('replacement', { limits }, 'first');
    expect(config.getDefaultModel()).toBe('replacement');
  });
  it('rejects last-visible removal, duplicates and invalid capacities atomically', () => {
    config.updateLLMConfig(channel);
    const before = fs.readFileSync(config.getPersistedLLMConfigPath(), 'utf8');
    expect(() => config.saveModelEntry('gemini', { hidden: true })).toThrow('至少');
    expect(() => config.deleteModelEntry('gemini')).toThrow('至少');
    expect(() => config.saveModelEntry('gemini', { limits }, 'first')).toThrow('已存在');
    expect(() => config.saveModelEntry('new', { limits: { ...limits, requestOutputTokens: 64001 } }, 'first')).toThrow('CUSTOM_LLM_MODEL_LIMITS');
    expect(fs.readFileSync(config.getPersistedLLMConfigPath(), 'utf8')).toBe(before);
    expect(config.getAvailableModels()).toEqual(['gemini']);
  });
  it('keeps visibility and routing unchanged when writing the encrypted file fails', () => {
    config.updateLLMConfig(channel);
    config.saveModelEntry('new', { limits }, 'first');
    fs.unlinkSync(config.getPersistedLLMConfigPath()); fs.mkdirSync(config.getPersistedLLMConfigPath());
    expect(() => config.saveModelEntry('new', { hidden: true })).toThrow();
    expect(() => config.deleteModelEntry('new')).toThrow();
    expect(config.getAvailableModels()).toEqual(['gemini', 'new']);
  });
});
