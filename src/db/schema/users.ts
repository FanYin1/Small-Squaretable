/**
 * 用户表 Schema
 *
 * 存储用户认证信息和基本资料
 */

import { pgTable, pgEnum, uuid, varchar, timestamp, boolean, integer, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const userRoleEnum = pgEnum('user_role', ['user', 'moderator', 'admin']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  displayName: varchar('display_name', { length: 100 }),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  bio: varchar('bio', { length: 500 }),
  role: userRoleEnum('role').default('user').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  emailVerificationToken: varchar('email_verification_token', { length: 64 }),
  totpSecret: varchar('totp_secret', { length: 255 }),
  totpEnabled: boolean('totp_enabled').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
  followerCount: integer('follower_count').default(0).notNull(),
  followingCount: integer('following_count').default(0).notNull(),

  /**
   * 满 18 岁声明。
   *
   * 存的是「用户在什么时候声明过自己成年」这个事实，不是出生日期——
   * 不收集出生日期就不用承担多一份敏感个人信息的合规负担。
   * 时间点 + IP 是这份声明的证据，出事时需要能举证「用户自己勾的」，
   * 所以不能只存一个 boolean。IP 与 audit_logs 一致做 SHA-256 截断。
   */
  ageConfirmedAt: timestamp('age_confirmed_at', { withTimezone: true }),
  ageConfirmedIp: varchar('age_confirmed_ip', { length: 64 }),
}, (table) => ({
  tenantIdIdx: index('idx_users_tenant_id').on(table.tenantId),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
