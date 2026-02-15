/**
 * 核心配置模块
 *
 * 从环境变量加载配置，提供类型安全的配置访问
 */

import 'dotenv/config';
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

  // Kafka
  kafkaBrokers: z.string().default('localhost:9092'),
  kafkaClientId: z.string().default('small-squaretable'),

  // ClickHouse
  clickhouseUrl: z.string().default('http://localhost:8123'),
  clickhouseDatabase: z.string().default('analytics'),

  // Email (SMTP)
  smtpHost: z.string().default('localhost'),
  smtpPort: z.coerce.number().default(587),
  smtpUser: z.string().default(''),
  smtpPass: z.string().default(''),
  smtpFrom: z.string().default('Small Squaretable <noreply@localhost>'),

  // App URL (used in email links)
  appUrl: z.string().default('http://localhost:5173'),

  // OAuth
  googleClientId: z.string().default(''),
  googleClientSecret: z.string().default(''),
  githubClientId: z.string().default(''),
  githubClientSecret: z.string().default(''),
  oauthCallbackBase: z.string().default('http://localhost:3000/api/v1/auth/oauth'),

  // Stripe
  stripeSecretKey: z.string().default(''),
  stripeWebhookSecret: z.string().default(''),
  stripeProMonthlyPrice: z.string().default(''),
  stripeProYearlyPrice: z.string().default(''),
  stripeTeamMonthlyPrice: z.string().default(''),

  // Tunable limits
  memoryLimitFree: z.coerce.number().default(100),
  memoryLimitPro: z.coerce.number().default(500),
  memoryLimitTeam: z.coerce.number().default(2000),
  cacheTtlDefault: z.coerce.number().default(300),
  recommendationCacheTtl: z.coerce.number().default(900),
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
    kafkaBrokers: process.env.KAFKA_BROKERS,
    kafkaClientId: process.env.KAFKA_CLIENT_ID,
    clickhouseUrl: process.env.CLICKHOUSE_URL,
    clickhouseDatabase: process.env.CLICKHOUSE_DATABASE,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpFrom: process.env.SMTP_FROM,
    appUrl: process.env.APP_URL,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    githubClientId: process.env.GITHUB_CLIENT_ID,
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
    oauthCallbackBase: process.env.OAUTH_CALLBACK_BASE,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    stripeProMonthlyPrice: process.env.STRIPE_PRICE_PRO_MONTHLY,
    stripeProYearlyPrice: process.env.STRIPE_PRICE_PRO_YEARLY,
    stripeTeamMonthlyPrice: process.env.STRIPE_PRICE_TEAM_MONTHLY,
    memoryLimitFree: process.env.MEMORY_LIMIT_FREE,
    memoryLimitPro: process.env.MEMORY_LIMIT_PRO,
    memoryLimitTeam: process.env.MEMORY_LIMIT_TEAM,
    cacheTtlDefault: process.env.CACHE_TTL_DEFAULT,
    recommendationCacheTtl: process.env.RECOMMENDATION_CACHE_TTL,
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
