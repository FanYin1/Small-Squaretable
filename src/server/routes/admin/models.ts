/**
 * Admin LLM model overview routes.
 *
 * Administrator capacity edits are persisted with encrypted credentials.
 * GET exposes metadata only; credentials are never returned.
 */

import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { getAvailableModelsWithMeta, llmConfigs } from '../../config/llm.config';
import { updateLLMConfig, type EditableLLMConfig } from '../../config/llm.config';
import type { ApiResponse } from '../../../types/api';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

export const adminModelRoutes = new Hono();

adminModelRoutes.use('*', authMiddleware(), requireRole('admin'));

const modelLimitSchema = z.object({
  contextWindow: z.number().int().positive().safe(),
  maxInputTokens: z.number().int().positive().safe().optional(),
  maxOutputTokens: z.number().int().positive().safe(),
  requestOutputTokens: z.number().int().positive().safe(),
}).strict();

const updateModelSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),
  name: z.string().trim().min(1).max(100).optional(),
  makeDefault: z.boolean().optional(),
  modelAliases: z.record(z.string().min(1), z.string().trim().min(1).max(200)).optional(),
  requestOptions: z.object({
    tokenParameter: z.enum(['max_tokens', 'max_completion_tokens']).optional(),
    temperature: z.boolean().optional(), penalties: z.boolean().optional(),
    streamUsage: z.boolean().optional(), jsonMode: z.boolean().optional(),
  }).optional(),
  provider: z.enum(['openai', 'anthropic', 'custom', 'ollama']),
  apiFormat: z.enum(['openai', 'gemini', 'anthropic']).optional(),
  apiKey: z.string().max(1000).optional(),
  baseUrl: z.string().url().max(500),
  models: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
  defaultModel: z.string().trim().min(1).max(200).optional(),
  modelLimits: z.record(z.string(), modelLimitSchema).optional(),
});

adminModelRoutes.get('/', (c) => {
  const models = getAvailableModelsWithMeta();
  const configuredModels = new Set(models.map((model) => model.id));

  return c.json<ApiResponse>({
    success: true,
    data: {
      source: 'runtime',
      restartRequired: false,
      providers: llmConfigs.map((config) => ({
        id: config.id || config.provider,
        name: config.name || config.id || config.provider,
        provider: config.provider,
        modelAliases: config.modelAliases ?? {},
        requestOptions: config.requestOptions ?? {},
        apiFormat: config.apiFormat ?? (config.provider === 'anthropic' ? 'anthropic' : 'openai'),
        baseUrl: config.baseUrl ?? null,
        defaultModel: config.defaultModel ?? config.models[0] ?? null,
        modelCount: config.models.length,
        hasApiKey: Boolean(config.apiKey),
        models: config.models.map((model) => ({
          ...models.find((item) => item.id === model),
          configured: configuredModels.has(model),
        })),
      })),
      models,
      defaultModel: llmConfigs[0]?.defaultModel ?? llmConfigs[0]?.models[0] ?? null,
    },
    meta: { timestamp: new Date().toISOString() },
  });
});

adminModelRoutes.put('/', zValidator('json', updateModelSchema), async (c) => {
  try {
    updateLLMConfig(c.req.valid('json') as EditableLLMConfig);
  } catch (error) {
    return c.json<ApiResponse>({
      success: false,
      error: {
        code: 'INVALID_MODEL_CONFIG',
        message: error instanceof Error ? error.message : 'Invalid model configuration',
      },
      meta: { timestamp: new Date().toISOString() },
    }, 400);
  }

  return c.json<ApiResponse>({
    success: true,
    data: { models: getAvailableModelsWithMeta() },
    meta: { timestamp: new Date().toISOString() },
  });
});
