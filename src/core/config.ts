/**
 * 核心配置模块
 *
 * 从环境变量加载配置，提供类型安全的配置访问
 */

import { z } from 'zod';

const configSchema = z.object({
  // Server
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().default(3000),
  host: z.string().default('0.0.0.0'),

  // Database
  databaseUrl: z.string().url(),
  databasePoolMin: z.coerce.number().default(2),
  databasePoolMax: z.coerce.number().default(10),

  // Redis
  redisUrl: z.string().url(),
  redisPassword: z.string().optional(),

  // JWT
  jwtSecret: z.string().min(32),
  jwtExpiresIn: z.string().default('7d'),

  // Storage
  storageType: z.enum(['local', 's3']).default('local'),
  storagePath: z.string().default('./uploads'),
  s3Bucket: z.string().optional(),
  s3Region: z.string().optional(),
  s3AccessKey: z.string().optional(),
  s3SecretKey: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

/**
 * 加载并验证配置
 */
export function loadConfig(): Config {
  const rawConfig = {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    host: process.env.HOST,
    databaseUrl: process.env.DATABASE_URL,
    databasePoolMin: process.env.DATABASE_POOL_MIN,
    databasePoolMax: process.env.DATABASE_POOL_MAX,
    redisUrl: process.env.REDIS_URL,
    redisPassword: process.env.REDIS_PASSWORD,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    storageType: process.env.STORAGE_TYPE,
    storagePath: process.env.STORAGE_PATH,
    s3Bucket: process.env.S3_BUCKET,
    s3Region: process.env.S3_REGION,
    s3AccessKey: process.env.S3_ACCESS_KEY,
    s3SecretKey: process.env.S3_SECRET_KEY,
  };

  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    throw new Error('Invalid configuration');
  }
}

// 导出单例配置
export const config = loadConfig();
