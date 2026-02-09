import { pgTable, uuid, text, boolean, integer, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * 插件注册表 - 存储已发布的插件元数据
 */
export const plugins = pgTable('plugins', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  version: text('version').notNull().default('1.0.0'),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entrypoint: text('entrypoint').notNull().default('index.js'),
  events: text('events').array().notNull().default([]),
  permissions: text('permissions').array().notNull().default([]),
  configSchema: jsonb('config_schema').notNull().default({}),
  sourceCode: text('source_code').notNull(),
  isPublished: boolean('is_published').notNull().default(false),
  isOfficial: boolean('is_official').notNull().default(false),
  installCount: integer('install_count').notNull().default(0),
  iconUrl: text('icon_url'),
  readme: text('readme'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  authorIdx: index('idx_plugins_author').on(table.authorId),
  slugIdx: uniqueIndex('idx_plugins_slug').on(table.slug),
  publishedIdx: index('idx_plugins_published').on(table.isPublished),
}));

export type Plugin = typeof plugins.$inferSelect;
export type NewPlugin = typeof plugins.$inferInsert;

/**
 * 插件安装表 - 用户安装的插件实例
 */
export const pluginInstalls = pgTable('plugin_installs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  pluginId: uuid('plugin_id').notNull().references(() => plugins.id, { onDelete: 'cascade' }),
  isEnabled: boolean('is_enabled').notNull().default(true),
  config: jsonb('config').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('idx_plugin_installs_user').on(table.userId),
  pluginIdx: index('idx_plugin_installs_plugin').on(table.pluginId),
  uniqueInstall: uniqueIndex('idx_plugin_installs_unique').on(table.userId, table.pluginId),
}));

export type PluginInstall = typeof pluginInstalls.$inferSelect;
export type NewPluginInstall = typeof pluginInstalls.$inferInsert;

/**
 * 插件 KV 存储 - 插件运行时键值存储
 */
export const pluginKvStore = pgTable('plugin_kv_store', {
  id: uuid('id').primaryKey().defaultRandom(),
  pluginId: uuid('plugin_id').notNull().references(() => plugins.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: jsonb('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  lookupIdx: uniqueIndex('idx_plugin_kv_lookup').on(table.pluginId, table.userId, table.key),
}));

export type PluginKv = typeof pluginKvStore.$inferSelect;
export type NewPluginKv = typeof pluginKvStore.$inferInsert;
