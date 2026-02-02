/**
 * LLM 配置模块
 *
 * 管理 LLM 提供商配置和模型映射
 */

import type { LLMProviderConfig } from '../../types/llm';

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
    const models = process.env.CUSTOM_LLM_MODELS
      ? process.env.CUSTOM_LLM_MODELS.split(',').map((m) => m.trim())
      : ['default'];

    configs.push({
      provider: 'custom',
      apiKey: process.env.CUSTOM_LLM_API_KEY,
      baseUrl: process.env.CUSTOM_LLM_BASE_URL,
      models,
      defaultModel: process.env.CUSTOM_LLM_DEFAULT_MODEL || models[0],
    });
  }

  return configs;
}

/**
 * LLM 配置单例
 */
export const llmConfigs = loadLLMConfig();

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
