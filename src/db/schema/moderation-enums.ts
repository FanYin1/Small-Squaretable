/**
 * 审核相关的共享枚举
 *
 * 单独成文件是因为 characters 和 reports 都要用 violationCategoryEnum，
 * 放在任何一边都会让另一边产生跨表 import。
 */

import { pgEnum } from 'drizzle-orm/pg-core';
import { MODERATION_STATUSES, VIOLATION_CATEGORIES } from '../../types/moderation';

/**
 * 违规分类。
 *
 * 平台不允许色情内容，pornography 是「违规待处置」而不是分级标记。
 * violence 之前在 schema 里完全没有表达能力——只有 characters.isNsfw
 * 一个布尔值，无法区分色情和暴力，审核后台也就拿不到可统计的口径。
 *
 * 清单本身在 types/moderation.ts，前端要渲染同一份选项。
 * 不要在这里另写一遍：漏改一处就会出现前端能选、数据库放不进的分类。
 */
export const violationCategoryEnum = pgEnum('violation_category', VIOLATION_CATEGORIES);

/**
 * 角色的审核状态。
 *
 * - draft：未发布，作者私有，不进任何公开入口。
 * - pending：已申请公开，等人工审核，公开入口不可见。
 * - approved：审核通过，公开入口可见（仍受 isPublic 约束）。
 * - rejected：审核驳回，作者可见可修改，公开入口不可见。
 * - hidden：管理员下架。此前 takeAction('hide') 只写审核日志、
 *   不改任何业务状态，所以后台点「隐藏」返回 200 而角色照常可见。
 *
 * 同 violationCategoryEnum：清单在 types/moderation.ts，后台队列筛选和
 * 作者侧徽标都读同一份，不要在这里另写一遍。
 */
export const moderationStatusEnum = pgEnum('moderation_status', MODERATION_STATUSES);

export type ViolationCategory = (typeof violationCategoryEnum.enumValues)[number];
export type ModerationStatus = (typeof moderationStatusEnum.enumValues)[number];
