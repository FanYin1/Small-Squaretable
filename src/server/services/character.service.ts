/**
 * 角色服务
 *
 * 处理角色的 CRUD 操作、发布/下架和 Fork 功能
 */

import { characterRepository } from '../../db/repositories/character.repository';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../core/errors';
import type { CreateCharacterInput, UpdateCharacterInput } from '../../types/character';
import type { PaginationParams, PaginatedResponse } from '../../types/api';
import type { Character } from '../../db/schema/characters';
import type { ModerationStatus } from '../../db/schema/moderation-enums';

/**
 * 发布时的审核状态迁移。
 *
 * 公开发现入口要求 moderation_status = 'approved'，所以发布必须显式进入
 * 'pending'——否则新角色停在默认的 'draft' 上，既不可见也进不了审核队列。
 *
 * 两个例外不能覆盖：已 approved 的重新发布不该无谓地退回排队；被管理员
 * 'hidden' 的更不能靠作者自己点一次发布就重新参与审核（那等于绕过处置）。
 */
function publishStatusPatch(
  current: ModerationStatus | null | undefined,
): Partial<{ moderationStatus: ModerationStatus; violationCategory: null; moderationNote: null }> {
  if (current === 'approved' || current === 'hidden') {
    return {};
  }
  // 重新提交时清掉上一轮的驳回结论，避免作者侧继续显示旧理由
  return { moderationStatus: 'pending', violationCategory: null, moderationNote: null };
}

/**
 * 下架时的审核状态迁移：把排队中的角色退回 'draft'，别占着审核队列。
 * 'hidden' 同样保留——作者下架不构成对管理员处置的撤销。
 */
function unpublishStatusPatch(
  current: ModerationStatus | null | undefined,
): Partial<{ moderationStatus: ModerationStatus }> {
  return current === 'pending' ? { moderationStatus: 'draft' } : {};
}

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

    // NSFW 在边界上拦掉，而不是发布成功后静默过滤。
    //
    // PUBLIC_VISIBLE() 无条件排除 isNsfw=true，updateModerationStatus 又不碰
    // 这个字段——标了 NSFW 的角色即使审核通过也永远不可见，且没有任何路径能
    // 改变。此前作者能打开开关、点发布、拿到 200 和「待审核」徽标，内容却
    // 永久隐形。这是和 pending 回归同一类缺陷：可达的路径产出不可见的结果。
    //
    // 平台不允许色情内容，isNsfw 是违规待处置标记而不是分级标记，所以正确的
    // 行为是拒绝并解释，不是假装成功。
    if (character.isNsfw) {
      throw new BadRequestError(
        'NSFW characters cannot be published: this platform does not allow explicit content. Turn off the NSFW flag and edit the character to comply before publishing.',
      );
    }

    const updated = await this.characterRepo.update(characterId, tenantId, {
      isPublic: true,
      ...publishStatusPatch(character.moderationStatus),
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
      ...unpublishStatusPatch(character.moderationStatus),
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
