import { validateModelLimits, type ModelLimitsInput } from '../../types/model-limits';
/**
 * LLM 配置模块
 *
 * 管理 LLM 提供商配置和模型映射
 */

import type { LLMProviderConfig, ModelMeta } from '../../types/llm';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 从环境变量加载 LLM 配置
 */
export function loadLLMConfig(): LLMProviderConfig[] {
  const configs: LLMProviderConfig[] = [];

  // OpenAI 配置
  if (process.env.OPENAI_API_KEY) {
    configs.push({
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      models: [
        'gpt-4',
        'gpt-4-turbo',
        'gpt-4-turbo-preview',
        'gpt-3.5-turbo',
        'gpt-3.5-turbo-16k',
      ],
      defaultModel: 'gpt-3.5-turbo',
    });
  }

  // Anthropic 配置
  if (process.env.ANTHROPIC_API_KEY) {
    configs.push({
      provider: 'anthropic',
      apiFormat: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
      models: [
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
        'claude-2.1',
        'claude-2.0',
      ],
      defaultModel: 'claude-3-sonnet-20240229',
    });
  }

  // 自定义端点配置
  if (process.env.CUSTOM_LLM_API_KEY && process.env.CUSTOM_LLM_BASE_URL) {
    const apiFormat = process.env.CUSTOM_LLM_API_FORMAT || 'openai';
    if (apiFormat !== 'openai' && apiFormat !== 'gemini' && apiFormat !== 'anthropic') throw new Error('CUSTOM_LLM_API_FORMAT must be openai, gemini or anthropic');
    const models = process.env.CUSTOM_LLM_MODELS
      ? process.env.CUSTOM_LLM_MODELS.split(',').map((m) => m.trim())
      : ['default'];

    const modelLimits = parseCustomModelLimits(process.env.CUSTOM_LLM_MODEL_LIMITS, models);

    configs.push({
      provider: 'custom',
      apiFormat,
      apiKey: process.env.CUSTOM_LLM_API_KEY,
      baseUrl: process.env.CUSTOM_LLM_BASE_URL,
      models,
      defaultModel: process.env.CUSTOM_LLM_DEFAULT_MODEL || models[0],
      modelLimits,
    });
  }

  // Ollama 本地模型配置 (无需 API Key)
  if (process.env.OLLAMA_BASE_URL) {
    const models = process.env.OLLAMA_MODELS
      ? process.env.OLLAMA_MODELS.split(',').map((m) => m.trim())
      : ['dolphin-mistral:7b-v2.8-q4_K_M'];

    configs.push({
      provider: 'ollama',
      apiKey: 'ollama',
      baseUrl: process.env.OLLAMA_BASE_URL,
      models,
      defaultModel: process.env.OLLAMA_DEFAULT_MODEL || models[0],
    });
  }

  return configs;
}

/**
 * LLM 配置单例
 */
export const llmConfigs = loadLLMConfig();

const persistedConfigPath = process.env.LLM_CONFIG_PATH || path.join(process.cwd(), '.runtime', 'llm-config.json');

function encryptionKey(): Buffer {
  return crypto.createHash('sha256')
    .update(process.env.TOTP_ENCRYPTION_KEY || process.env.JWT_SECRET || 'small-squaretable-runtime-config')
    .digest();
}

function encryptApiKey(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptApiKey(value: string): string {
  const [ivHex, tagHex, dataHex] = value.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

interface PersistedLLMConfig {
  providers: Array<Omit<LLMProviderConfig, 'apiKey'> & { encryptedApiKey: string }>;
}

export interface EditableLLMConfig {
  id?: string;
  name?: string;
  modelAliases?: LLMProviderConfig['modelAliases'];
  requestOptions?: LLMProviderConfig['requestOptions'];
  makeDefault?: boolean;
  provider: LLMProviderConfig['provider'];
  apiFormat?: LLMProviderConfig['apiFormat'];
  apiKey?: string;
  baseUrl?: string;
  models: string[];
  defaultModel?: string;
  modelLimits?: Record<string, ModelLimitsInput>;
}

function persistLLMConfigs(providers: LLMProviderConfig[]): void {
  const directory = path.dirname(persistedConfigPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const data: PersistedLLMConfig = {
    providers: providers.map(({ apiKey, ...provider }) => ({
      ...provider,
      encryptedApiKey: encryptApiKey(apiKey),
    })),
  };
  const temporaryPath = `${persistedConfigPath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(temporaryPath, persistedConfigPath);
}

/** Load the administrator's encrypted runtime configuration after migrations. */
export function loadPersistedLLMConfig(): void {
  if (!fs.existsSync(persistedConfigPath)) return;
  try {
    const persisted = JSON.parse(fs.readFileSync(persistedConfigPath, 'utf8')) as PersistedLLMConfig;
    if (!Array.isArray(persisted.providers)) throw new Error('providers must be an array');
    const providers = persisted.providers.map(({ encryptedApiKey, ...provider }) => ({
      ...provider,
      apiKey: decryptApiKey(encryptedApiKey),
    }));
    if (providers.some((provider) => !provider.apiKey || provider.models.length === 0)) {
      throw new Error('runtime model configuration is incomplete');
    }
    llmConfigs.splice(0, llmConfigs.length, ...providers);
  } catch (error) {
    // Keep the environment configuration available if the persisted file is corrupt.
    console.error('Ignoring invalid persisted LLM configuration', error instanceof Error ? error.message : String(error));
  }
}

export function updateLLMConfig(input: EditableLLMConfig): void {
  const id = input.id || input.provider;
  const index = llmConfigs.findIndex(config => (config.id || config.provider) === id);
  const current = llmConfigs[index];
  const apiKey = input.apiKey?.trim() || current?.apiKey || (input.provider === 'ollama' ? 'ollama' : '');
  if (!apiKey) throw new Error('An API key is required for this channel');
  const baseUrl = input.baseUrl?.trim().replace(/\/+$/, '');
  if (!baseUrl || !/^https?:\/\//.test(baseUrl)) throw new Error('An HTTP(S) base URL is required');
  const models = input.models.map(model => model.trim());
  if (!models.length || models.some(model => !model) || new Set(models).size !== models.length) {
    throw new Error('Provide distinct, non-empty model names');
  }
  if (llmConfigs.some((config, position) => position !== index && config.models.some(model => models.includes(model)))) {
    throw new Error('Model names must be unique across channels; use a model alias for another upstream with the same name');
  }
  const modelAliases = input.modelAliases ?? current?.modelAliases ?? {};
  if (Object.entries(modelAliases).some(([alias, upstream]) => !models.includes(alias) || !upstream.trim())) {
    throw new Error('Model aliases must map configured model names to non-empty upstream IDs');
  }
  const modelLimits = input.modelLimits === undefined ? current?.modelLimits
    : parseCustomModelLimits(JSON.stringify(input.modelLimits), models);
  const next: LLMProviderConfig = {
    id, name: input.name?.trim() || current?.name || id,
    provider: input.provider,
    apiFormat: input.apiFormat ?? current?.apiFormat ?? (input.provider === 'anthropic' ? 'anthropic' : 'openai'),
    apiKey, baseUrl, models, modelAliases,
    requestOptions: input.requestOptions ?? current?.requestOptions,
    defaultModel: input.defaultModel?.trim() || models[0], modelLimits,
  };
  if (!models.includes(next.defaultModel!)) throw new Error('The default model must be in the model list');
  const providers = [...llmConfigs];
  if (index < 0) providers.push(next); else providers[index] = next;
  if (input.makeDefault) { providers.splice(providers.indexOf(next), 1); providers.unshift(next); }
  // Publish only after the encrypted file was replaced successfully.
  persistLLMConfigs(providers);
  llmConfigs.splice(0, llmConfigs.length, ...providers);
}

export function getPersistedLLMConfigPath(): string {
  return persistedConfigPath;
}

export function parseCustomModelLimits(raw: string | undefined, models: string[]): NonNullable<LLMProviderConfig['modelLimits']> {
  if (!raw?.trim()) return Object.create(null);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('CUSTOM_LLM_MODEL_LIMITS: invalid JSON'); }
  return Object.fromEntries(Object.entries(validateModelLimits(parsed, models)).map(([model, value]) => [model, {
    contextWindow: value.contextWindow,
    ...(value.maxInputTokens === undefined ? {} : { maxInputTokens: value.maxInputTokens }),
    outputCapabilityTokens: value.maxOutputTokens,
    maxOutputTokens: value.requestOutputTokens,
  }]));
}

/**
 * 获取所有可用模型
 */
export function getAvailableModels(): string[] {
  const models = new Set<string>();
  llmConfigs.forEach((config) => {
    config.models.forEach((model) => models.add(model));
  });
  return Array.from(models);
}

/**
 * 根据模型名称查找提供商配置
 */
export function findProviderForModel(model: string): LLMProviderConfig | null {
  for (const config of llmConfigs) {
    if (config.models.includes(model)) {
      return config;
    }
  }
  return null;
}

/**
 * 获取默认模型
 */
export function getDefaultModel(): string | null {
  if (llmConfigs.length === 0) {
    return null;
  }
  return llmConfigs[0].defaultModel || llmConfigs[0].models[0];
}

/**
 * 已知模型元数据注册表
 */
const MODEL_REGISTRY: Record<string, Omit<ModelMeta, 'id' | 'provider'>> = {
  // OpenAI
  'gpt-4': { contextWindow: 8192, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'gpt-4-turbo': { contextWindow: 128000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'gpt-4-turbo-preview': { contextWindow: 128000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'gpt-3.5-turbo': { contextWindow: 16385, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'gpt-3.5-turbo-16k': { contextWindow: 16385, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  // Anthropic
  'claude-3-opus-20240229': { contextWindow: 200000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'claude-3-sonnet-20240229': { contextWindow: 200000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'claude-3-haiku-20240307': { contextWindow: 200000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'claude-2.1': { contextWindow: 200000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'claude-2.0': { contextWindow: 100000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  // GLM (智谱AI)
  'glm-4': { contextWindow: 128000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'glm-4-plus': { contextWindow: 128000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'glm-4-air': { contextWindow: 128000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'glm-4-airx': { contextWindow: 8192, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'glm-4-flash': { contextWindow: 128000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'glm-4.5-air': { contextWindow: 128000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  // Ollama (Qwen3)
  'huihui_ai/qwen3-abliterated:4b': { contextWindow: 40960, maxOutputTokens: 8192, defaultTemperature: 0.7 },
  'qwen3.5:4b': { contextWindow: 16384, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'qwen3.5:2b': { contextWindow: 12288, maxOutputTokens: 4096, defaultTemperature: 0.7 },
};

/**
 * 未知模型的默认元数据
 */
const DEFAULT_MODEL_META: Omit<ModelMeta, 'id' | 'provider'> = {
  contextWindow: 4096,
  maxOutputTokens: 2048,
  defaultTemperature: 0.7,
};

/**
 * 获取单个模型的元数据
 */
export function getModelMeta(model: string): ModelMeta {
  const provider = findProviderForModel(model);
  const override = provider?.modelLimits?.[model] ?? (provider?.provider === 'custom' && !provider.id
    ? parseCustomModelLimits(process.env.CUSTOM_LLM_MODEL_LIMITS, provider.models)[model] : undefined);
  const meta = override ? { ...DEFAULT_MODEL_META, ...override } : MODEL_REGISTRY[model] || DEFAULT_MODEL_META;
  return {
    id: model,
    provider: provider?.provider || 'unknown',
    ...meta,
  };
}

/**
 * 获取所有可用模型及其元数据
 */
export function getAvailableModelsWithMeta(): ModelMeta[] {
  return getAvailableModels().map(getModelMeta);
}
