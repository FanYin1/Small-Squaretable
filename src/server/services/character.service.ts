/**
 * 角色服务
 *
 * 处理角色的 CRUD 操作、发布/下架和 Fork 功能
 */

import { characterRepository } from '../../db/repositories/character.repository';
import { NotFoundError, ForbiddenError } from '../../core/errors';
import type { CreateCharacterInput, UpdateCharacterInput } from '../../types/character';
import type { PaginationParams, PaginatedResponse } from '../../types/api';
import type { Character } from '../../db/schema/characters';

export class CharacterService {
  constructor(private characterRepo = characterRepository) {}

  async create(userId: string, tenantId: string, data: CreateCharacterInput): Promise<Character> {
    return await this.characterRepo.create({
      ...data,
      tenantId,
      creatorId: userId,
    });
  }

  async getById(characterId: string): Promise<Character> {
    const character = await this.characterRepo.findById(characterId);
    if (!character) {
      throw new NotFoundError('Character');
    }
    return character;
  }

  async getByTenantId(
    tenantId: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<Character>> {
    const characters = await this.characterRepo.findByTenantId(tenantId, pagination);
    const total = await this.characterRepo.countByTenantId(tenantId);

    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const totalPages = Math.ceil(total / limit);

    return {
      items: characters,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async update(
    characterId: string,
    userId: string,
    tenantId: string,
    data: UpdateCharacterInput
  ): Promise<Character> {
    const character = await this.characterRepo.findById(characterId);
    if (!character) {
      throw new NotFoundError('Character');
    }

    if (character.creatorId !== userId) {
      throw new ForbiddenError('Only creator can update this character');
    }

    const updated = await this.characterRepo.update(characterId, tenantId, data);
    if (!updated) {
      throw new NotFoundError('Character');
    }

    return updated;
  }

  async delete(characterId: string, userId: string, tenantId: string): Promise<void> {
    const character = await this.characterRepo.findById(characterId);
    if (!character) {
      throw new NotFoundError('Character');
    }

    if (character.creatorId !== userId) {
      throw new ForbiddenError('Only creator can delete this character');
    }

    await this.characterRepo.delete(characterId, tenantId);
  }

  async publish(characterId: string, userId: string, tenantId: string): Promise<Character> {
    const character = await this.characterRepo.findById(characterId);
    if (!character) {
      throw new NotFoundError('Character');
    }

    if (character.creatorId !== userId) {
      throw new ForbiddenError('Only creator can publish this character');
    }

    const updated = await this.characterRepo.update(characterId, tenantId, {
      isPublic: true,
    });

    if (!updated) {
      throw new NotFoundError('Character');
    }

    return updated;
  }

  async unpublish(characterId: string, userId: string, tenantId: string): Promise<Character> {
    const character = await this.characterRepo.findById(characterId);
    if (!character) {
      throw new NotFoundError('Character');
    }

    if (character.creatorId !== userId) {
      throw new ForbiddenError('Only creator can unpublish this character');
    }

    const updated = await this.characterRepo.update(characterId, tenantId, {
      isPublic: false,
    });

    if (!updated) {
      throw new NotFoundError('Character');
    }

    return updated;
  }

  async fork(sourceId: string, userId: string, tenantId: string): Promise<Character> {
    const source = await this.characterRepo.findById(sourceId);
    if (!source || !source.isPublic) {
      throw new NotFoundError('Public character');
    }

    await this.characterRepo.incrementDownloadCount(sourceId);

    return await this.characterRepo.create({
      name: source.name,
      description: source.description,
      avatarUrl: source.avatarUrl,
      cardData: source.cardData,
      tags: source.tags,
      category: source.category,
      isNsfw: source.isNsfw,
      tenantId,
      creatorId: userId,
      isPublic: false,
    });
  }

  async getPublicCharacters(
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<Character>> {
    const characters = await this.characterRepo.findPublic(pagination);
    const total = await this.characterRepo.countPublic();

    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const totalPages = Math.ceil(total / limit);

    return {
      items: characters,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }
}

export const characterService = new CharacterService();
