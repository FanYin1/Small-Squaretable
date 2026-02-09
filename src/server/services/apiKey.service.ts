/**
 * API Key Service
 *
 * Business logic for API key CRUD operations and validation.
 * Handles key generation, hashing, and user ownership checks.
 */

import type { ApiKeyRepository } from '@db/repositories/apiKey.repository';
import type { UserRepository } from '@db/repositories/user.repository';
import { generateApiKey, hashApiKey, getKeyHint } from '../utils/apiKey';
import { NotFoundError, UnauthorizedError, BadRequestError } from '@/core/errors';
import type { CreateApiKeyInput, UpdateApiKeyInput, ApiKeyInfo, ApiKeyCreatedResponse } from '@/types/apiKey';

const MAX_KEYS_PER_USER = 10;

export class ApiKeyService {
  constructor(
    private apiKeyRepo: ApiKeyRepository,
    private userRepo: UserRepository,
  ) {}

  async createApiKey(userId: string, input: CreateApiKeyInput): Promise<ApiKeyCreatedResponse> {
    const count = await this.apiKeyRepo.countByUserId(userId);
    if (count >= MAX_KEYS_PER_USER) {
      throw new BadRequestError(`Maximum ${MAX_KEYS_PER_USER} API keys per user`);
    }

    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyHint = getKeyHint(rawKey);

    const record = await this.apiKeyRepo.createApiKey({
      userId,
      name: input.name,
      keyHash,
      keyHint,
      scopes: input.scopes,
      rateLimitPerMinute: input.rateLimitPerMinute ?? 60,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });

    return {
      ...this.toApiKeyInfo(record),
      key: rawKey,
    };
  }

  async listApiKeys(userId: string, limit: number, offset: number): Promise<ApiKeyInfo[]> {
    const keys = await this.apiKeyRepo.findByUserId(userId, limit, offset);
    return keys.map((k) => this.toApiKeyInfo(k));
  }

  async getApiKey(id: string, userId: string): Promise<ApiKeyInfo> {
    const key = await this.apiKeyRepo.findById(id, userId);
    if (!key) throw new NotFoundError('API key');
    return this.toApiKeyInfo(key);
  }

  async updateApiKey(id: string, userId: string, input: UpdateApiKeyInput): Promise<ApiKeyInfo> {
    const updated = await this.apiKeyRepo.updateApiKey(id, userId, input);
    if (!updated) throw new NotFoundError('API key');
    return this.toApiKeyInfo(updated);
  }

  async deleteApiKey(id: string, userId: string): Promise<void> {
    const deleted = await this.apiKeyRepo.deleteApiKey(id, userId);
    if (!deleted) throw new NotFoundError('API key');
  }

  async validateApiKey(rawKey: string): Promise<{ userId: string; tenantId: string; scopes: string[] }> {
    const keyHash = hashApiKey(rawKey);
    const key = await this.apiKeyRepo.findByKeyHash(keyHash);

    if (!key || !key.isActive) {
      throw new UnauthorizedError('Invalid or inactive API key');
    }

    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      throw new UnauthorizedError('API key has expired');
    }

    const user = await this.userRepo.findById(key.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive');
    }

    // Update usage stats (fire-and-forget)
    this.apiKeyRepo.incrementRequestCount(keyHash).catch(() => {});

    return {
      userId: user.id,
      tenantId: user.tenantId,
      scopes: key.scopes,
    };
  }

  private toApiKeyInfo(key: any): ApiKeyInfo {
    return {
      id: key.id,
      name: key.name,
      keyHint: key.keyHint,
      scopes: key.scopes,
      rateLimitPerMinute: key.rateLimitPerMinute,
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt?.toISOString?.() ?? key.lastUsedAt ?? null,
      requestCount: key.requestCount,
      expiresAt: key.expiresAt?.toISOString?.() ?? key.expiresAt ?? null,
      createdAt: key.createdAt?.toISOString?.() ?? key.createdAt,
    };
  }
}

// Singleton
import { apiKeyRepository } from '@db/repositories/apiKey.repository';
import { userRepository } from '@db/repositories/user.repository';

export const apiKeyService = new ApiKeyService(apiKeyRepository, userRepository);
