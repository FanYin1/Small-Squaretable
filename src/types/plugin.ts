import { z } from 'zod';

// Plugin permissions
export const PLUGIN_PERMISSIONS = [
  'events:subscribe',
  'kv:read',
  'kv:write',
  'config:read',
] as const;

export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

// Plugin events that plugins can subscribe to
export const PLUGIN_EVENTS = [
  'chat.message.before',
  'chat.message.after',
  'character.created',
  'character.updated',
  'character.deleted',
  'character.greeting',
  'user.login',
  'user.register',
] as const;

export type PluginEvent = (typeof PLUGIN_EVENTS)[number];

export type PluginStatus = 'active' | 'disabled' | 'error';

// --- Input Schemas ---

export const createPluginSchema = z.object({
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver').default('1.0.0'),
  entrypoint: z.string().default('index.js'),
  events: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  configSchema: z.record(z.unknown()).default({}),
  sourceCode: z.string().min(1).max(100_000),
  iconUrl: z.string().url().optional(),
  readme: z.string().max(50_000).optional(),
});

export type CreatePluginInput = z.infer<typeof createPluginSchema>;

export const updatePluginSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  events: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  configSchema: z.record(z.unknown()).optional(),
  sourceCode: z.string().min(1).max(100_000).optional(),
  isPublished: z.boolean().optional(),
  iconUrl: z.string().url().nullable().optional(),
  readme: z.string().max(50_000).nullable().optional(),
});

export type UpdatePluginInput = z.infer<typeof updatePluginSchema>;

export const installPluginSchema = z.object({
  pluginId: z.string().uuid(),
  config: z.record(z.unknown()).default({}),
});

export type InstallPluginInput = z.infer<typeof installPluginSchema>;

export const updateInstallConfigSchema = z.object({
  isEnabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

export type UpdateInstallConfigInput = z.infer<typeof updateInstallConfigSchema>;

export const pluginMarketplaceQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  sort: z.enum(['popular', 'newest', 'name']).default('popular'),
});

export type PluginMarketplaceQuery = z.infer<typeof pluginMarketplaceQuerySchema>;

// --- Response Interfaces ---

export interface PluginInfo {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  authorId: string;
  authorName?: string;
  events: string[];
  permissions: string[];
  configSchema: Record<string, unknown>;
  isPublished: boolean;
  isOfficial: boolean;
  installCount: number;
  iconUrl: string | null;
  readme: string | null;
  createdAt: string;
}

export interface PluginInstallInfo {
  id: string;
  pluginId: string;
  plugin: PluginInfo;
  isEnabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
}

export interface PluginExecutionResult {
  success: boolean;
  duration: number;
  error?: string;
  output?: unknown;
}
