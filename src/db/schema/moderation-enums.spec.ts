import { describe, it, expect } from 'vitest';
import { violationCategoryEnum, moderationStatusEnum } from './moderation-enums';
import { MODERATION_STATUSES, VIOLATION_CATEGORIES } from '../../types/moderation';

/**
 * pgEnum、路由的 zod schema、前端选项三处共用 types/moderation.ts。
 * 这条测试把 pgEnum 和那份清单钉在一起：如果有人把 pgEnum 改回硬编码，
 * 数据库能接受的分类就可能和前端能选的分类不一致。
 */
describe('moderation enums', () => {
  it('violationCategoryEnum matches the shared category list', () => {
    expect(violationCategoryEnum.enumValues).toEqual([...VIOLATION_CATEGORIES]);
  });

  // 顺序也重要：pgEnum 的顺序决定数据库里的 enum 排序
  it('preserves the declared order', () => {
    expect(violationCategoryEnum.enumValues[0]).toBe('pornography');
    expect(violationCategoryEnum.enumValues.at(-1)).toBe('other');
  });

  it('moderationStatusEnum covers the full publish lifecycle', () => {
    expect(moderationStatusEnum.enumValues).toEqual([
      'draft', 'pending', 'approved', 'rejected', 'hidden',
    ]);
  });

  // 后台队列筛选和作者侧徽标都读 MODERATION_STATUSES，漏一个状态就会出现
  // 数据库里存在、后台却筛不出来的角色
  it('moderationStatusEnum matches the shared status list', () => {
    expect(moderationStatusEnum.enumValues).toEqual([...MODERATION_STATUSES]);
  });
});
