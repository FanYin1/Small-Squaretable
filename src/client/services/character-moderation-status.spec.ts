/**
 * 审核状态必须透传到前端
 *
 * 后端 publish() 把角色置为 'pending'，公开入口要求 'approved'。如果
 * transformCharacter 把 moderationStatus 丢掉，作者侧就只能看到「已发布」
 * 一种状态，分不清在审、被驳回、已上线——而被驳回的角色永远不会出现在市场里，
 * 作者却以为自己发布成功了。
 */

import { describe, it, expect } from 'vitest';
import { transformCharacter, mapSearchItemToCharacter } from './character.api';

const backendCharacter = {
  id: 'char-1',
  tenantId: 'tenant-1',
  name: 'A',
  isPublic: true,
  isNsfw: false,
  downloadCount: 0,
  viewCount: 0,
  ratingCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('transformCharacter 审核字段', () => {
  it('保留 moderationStatus', () => {
    const result = transformCharacter({ ...backendCharacter, moderationStatus: 'pending' } as never);
    expect(result.moderationStatus).toBe('pending');
  });

  it('保留驳回理由——作者需要知道改什么', () => {
    const result = transformCharacter({
      ...backendCharacter,
      moderationStatus: 'rejected',
      violationCategory: 'violence',
      moderationNote: '过度暴力描写',
    } as never);

    expect(result.moderationStatus).toBe('rejected');
    expect(result.violationCategory).toBe('violence');
    expect(result.moderationNote).toBe('过度暴力描写');
  });

  it('老数据没有这些字段时不报错，留 undefined', () => {
    const result = transformCharacter(backendCharacter as never);
    expect(result.moderationStatus).toBeUndefined();
    expect(result.moderationNote).toBeUndefined();
  });

  it('null 转成 undefined，避免模板里 v-if 判到一个假的值', () => {
    const result = transformCharacter({
      ...backendCharacter,
      moderationStatus: 'approved',
      violationCategory: null,
      moderationNote: null,
    } as never);

    expect(result.violationCategory).toBeUndefined();
    expect(result.moderationNote).toBeUndefined();
  });
});

describe('mapSearchItemToCharacter 审核字段', () => {
  // 搜索结果只包含已通过审核的角色（publiclyVisible），但字段仍需一致，
  // 否则同一个 Character 对象在不同来源下形状不同，组件得写两套判断
  it('把搜索结果里的审核状态带上', () => {
    const result = mapSearchItemToCharacter({
      id: 'char-1',
      name: 'A',
      isPublic: true,
      isNsfw: false,
      ratingCount: 0,
      downloadCount: 0,
      viewCount: 0,
      moderationStatus: 'approved',
    } as never);

    expect(result.moderationStatus).toBe('approved');
  });
});
