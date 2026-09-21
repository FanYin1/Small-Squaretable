/**
 * Moderation shared types
 *
 * 违规分类的唯一来源。此前这份清单在三个地方各写一遍
 * （db/schema/moderation-enums.ts 的 pgEnum、routes/reports.ts 的 zod
 * schema、以及前端将要渲染的选项），任何一处漏改都会让用户能提交一个
 * 服务端拒收、或者数据库放不进去的分类。
 *
 * 这个文件刻意不引入 zod 或 drizzle：前端要 import 它，
 * 带上任一依赖都会把后端的东西塞进浏览器包里。
 */

export const VIOLATION_CATEGORIES = [
  'pornography',
  'violence',
  'harassment',
  'infringement',
  'other',
] as const;

export type ViolationCategory = (typeof VIOLATION_CATEGORIES)[number];

export const REPORT_TARGET_TYPES = ['character', 'comment', 'user'] as const;

export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

/** reason 是补充说明，分类才是可统计的口径；长度上限与 zod schema 一致 */
export const REPORT_REASON_MAX_LENGTH = 2000;

export interface SubmitReportInput {
  targetType: ReportTargetType;
  targetId: string;
  category: ViolationCategory;
  reason: string;
}
