import { z } from 'zod';

// --- Valid scopes ---
export const API_KEY_SCOPES = [
  'characters:read',
  'characters:write',
  'chats:read',
  'chats:write',
  'webhooks:manage',
  'social:read',
  'social:write',
  'profile:read',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

// --- Create API Key ---
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1),
  rateLimitPerMinute: z.number().int().min(1).max(1000).default(60),
  expiresAt: z.string().datetime().optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

// --- Update API Key ---
export const updateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).optional(),
  rateLimitPerMinute: z.number().int().min(1).max(1000).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;

// --- List API Keys query ---
export const listApiKeysQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListApiKeysQuery = z.infer<typeof listApiKeysQuerySchema>;

// --- API Response types ---
export interface ApiKeyInfo {
  id: string;
  name: string;
  keyHint: string;
  scopes: string[];
  rateLimitPerMinute: number;
  isActive: boolean;
  lastUsedAt: string | null;
  requestCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface ApiKeyCreatedResponse extends ApiKeyInfo {
  /** Full API key — only returned once at creation */
  key: string;
}
