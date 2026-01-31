/**
 * Drizzle Kit 配置
 *
 * 用于数据库迁移和 Studio 管理界面
 */

import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/sillytavern_saas',
  },
  verbose: true,
  strict: true,
} satisfies Config;
