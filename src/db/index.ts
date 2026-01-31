/**
 * 数据库连接模块
 *
 * 使用 Drizzle ORM 连接 PostgreSQL
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '@/core/config';
import * as schema from './schema';

// 创建 PostgreSQL 连接
const queryClient = postgres(config.databaseUrl, {
  max: config.databasePoolMax,
  idle_timeout: 20,
  connect_timeout: 10,
});

// 创建 Drizzle 实例
export const db = drizzle(queryClient, { schema });

// 导出 schema
export { schema };

// 类型导出
export type Database = typeof db;
