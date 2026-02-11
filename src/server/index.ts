/**
 * 服务器入口文件
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { config } from '@/core/config';
import { logger as appLogger, getLogConfig } from './services/logger.service';
import { initializeSentry, closeSentry } from './services/sentry.service';
import { errorHandler } from './middleware/error-handler';
import { requestIdMiddleware } from './middleware/request-id';
import { tenantMiddleware } from './middleware/tenant';
import { securityHeaders, developmentSecurityHeaders } from './middleware/security';
import { csrfProtection, getCsrfToken } from './middleware/csrf';
import { authRateLimit, apiRateLimit, searchRateLimit } from './middleware/rateLimit';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { characterRoutes } from './routes/characters';
import { chatRoutes } from './routes/chats';
import { subscriptionRoutes } from './routes/subscriptions';
import { usageRoutes } from './routes/usage';
import { llmRoutes } from './routes/llm';
import { intelligenceRoutes } from './routes/intelligence';
import { worldbooksRouter } from './routes/worldbooks';
import { uploadRoutes } from './routes/uploads';
import { webhookRoutes } from './routes/webhooks';
import { notificationRoutes } from './routes/notifications';
import { socialRoutes } from './routes/social';
import { developerRoutes } from './routes/developer';
import { pluginRoutes } from './routes/plugins';
import { analyticsRoutes } from './routes/analytics';
import { oauthRoutes } from './routes/oauth';
import { mfaRoutes } from './routes/mfa';
import { pluginBridge } from './services/plugin-bridge';
import { kafkaBridge } from './services/kafka-bridge.service';
import { WebhookWorker } from './workers/webhook.worker';
import { webhookRepository } from '../db/repositories/webhook.repository';
import { basicHealthCheck, livenessCheck, readinessCheck } from './services/health';
import { websocketHandler } from './routes/websocket';
import * as fs from 'fs';
import * as path from 'path';

type Variables = {
  tenantId?: string;
  userId?: string;
  requestId?: string;
  logger?: ReturnType<typeof import('./services/logger.service').createLogger>;
};

const app = new Hono<{ Variables: Variables }>();

// Initialize Sentry for error tracking
appLogger.info('Initializing Sentry', { environment: config.nodeEnv });
initializeSentry();

// Log configuration
const logConfig = getLogConfig();
appLogger.info('Logger initialized', logConfig);

// Security headers first
if (config.nodeEnv === 'production') {
  app.use('*', securityHeaders());
} else {
  app.use('*', developmentSecurityHeaders());
}

// Request ID middleware (must be first to set context)
app.use('*', requestIdMiddleware);

// General middleware
app.use('*', logger());
app.use('*', cors({
  origin: config.corsOrigins.split(',').map((o) => o.trim()),
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID', 'X-API-Key'],
}));

// Apply rate limiting to API routes
app.use('/api/v1/auth/*', authRateLimit);
app.use('/api/v1/characters/search', searchRateLimit);
app.use('/api/v1/*', apiRateLimit);

// Tenant middleware 只应用到需要租户隔离的 API 路由
// 注意：/api/v1/characters/search 和 /api/v1/characters/marketplace 是公开端点，不需要租户 ID
const publicPaths = [
  '/health',
  '/api/v1/auth',
  '/api/v1/auth/oauth',
  '/api/v1/characters/search',
  '/api/v1/characters/marketplace',
  '/api/v1/characters/:id',  // 公开访问角色详情
  '/api/v1/plugins/marketplace',
  '/api/v1/plugins/marketplace/:id',
];

app.use('/api/v1/users/*', tenantMiddleware({ publicPaths }));
app.use('/api/v1/characters/*', tenantMiddleware({ publicPaths }));
app.use('/api/v1/chats/*', tenantMiddleware({ publicPaths }));
app.use('/api/v1/subscriptions/*', tenantMiddleware({ publicPaths }));
app.use('/api/v1/usage/*', tenantMiddleware({ publicPaths }));
app.use('/api/v1/llm/*', tenantMiddleware({ publicPaths }));
app.use('/api/v1/worldbooks/*', tenantMiddleware({ publicPaths }));
app.use('/api/v1/uploads/*', tenantMiddleware({ publicPaths }));
app.use('/api/v1/webhooks/*', tenantMiddleware({ publicPaths }));
app.use('/api/v1/notifications/*', tenantMiddleware({ publicPaths }));
app.use('/api/v1/social/*', tenantMiddleware({ publicPaths }));
app.use('/api/v1/developer/*', tenantMiddleware({ publicPaths }));
app.use('/api/v1/plugins/*', tenantMiddleware({ publicPaths }));
app.use('/api/v1/analytics/*', tenantMiddleware({ publicPaths }));

// 健康检查端点
app.get('/health', async (c) => {
  const health = await basicHealthCheck();
  return c.json(health);
});

app.get('/health/live', async (c) => {
  const health = await livenessCheck();
  return c.json(health);
});

app.get('/health/ready', async (c) => {
  const health = await readinessCheck();
  const statusCode = health.status === 'ok' ? 200 : health.status === 'degraded' ? 200 : 503;
  return c.json(health, statusCode);
});

// API 路由

// CSRF token endpoint (must be before auth routes)
app.get('/api/v1/csrf-token', getCsrfToken);

// Apply CSRF protection to state-changing routes
// Auth endpoints (login/register don't need CSRF as they're public)
app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/auth/oauth', oauthRoutes);
app.route('/api/v1/auth/mfa', mfaRoutes);

// Protected routes with CSRF
app.use('/api/v1/users', csrfProtection());
app.use('/api/v1/characters', csrfProtection());
app.use('/api/v1/chats', csrfProtection());
app.use('/api/v1/subscriptions', csrfProtection());
app.use('/api/v1/usage', csrfProtection());
app.use('/api/v1/llm', csrfProtection());
app.use('/api/v1/worldbooks', csrfProtection());
app.use('/api/v1/uploads', csrfProtection());
app.use('/api/v1/webhooks', csrfProtection());
app.use('/api/v1/notifications', csrfProtection());
app.use('/api/v1/social', csrfProtection());
app.use('/api/v1/developer', csrfProtection());
app.use('/api/v1/plugins', csrfProtection());
app.use('/api/v1/analytics', csrfProtection());

app.route('/api/v1/users', userRoutes);
app.route('/api/v1/characters', characterRoutes);
app.route('/api/v1/chats', chatRoutes);
app.route('/api/v1/subscriptions', subscriptionRoutes);
app.route('/api/v1/usage', usageRoutes);
app.route('/api/v1/llm', llmRoutes);
app.route('/api/v1/worldbooks', worldbooksRouter);
app.route('/api/v1/uploads', uploadRoutes);
app.route('/api/v1/webhooks', webhookRoutes);
app.route('/api/v1/notifications', notificationRoutes);
app.route('/api/v1/social', socialRoutes);
app.route('/api/v1/developer', developerRoutes);
app.route('/api/v1/plugins', pluginRoutes);
app.route('/api/v1/analytics', analyticsRoutes);
app.route('/api/v1', intelligenceRoutes);

app.get('/api/v1', (c) => {
  return c.json({
    message: 'Small Squaretable API v1',
    tenantId: c.get('tenantId'),
    endpoints: {
      health: '/health',
      healthLive: '/health/live',
      healthReady: '/health/ready',
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      characters: '/api/v1/characters',
      chats: '/api/v1/chats',
      worldbooks: '/api/v1/worldbooks',
      subscriptions: '/api/v1/subscriptions',
      usage: '/api/v1/usage',
      llm: '/api/v1/llm',
      uploads: '/api/v1/uploads',
      notifications: '/api/v1/notifications',
      social: '/api/v1/social',
      developer: '/api/v1/developer',
      plugins: '/api/v1/plugins',
      analytics: '/api/v1/analytics',
      docs: '/api/v1/docs',
      ws: '/ws',
    },
  });
});

// Static file serving for uploads
app.get('/uploads/*', async (c) => {
  const filePath = c.req.path;
  const absolutePath = path.resolve(config.storagePath, filePath.replace(/^\/uploads\//, ''));

  // Security: prevent directory traversal
  const resolvedBase = path.resolve(config.storagePath);
  if (!absolutePath.startsWith(resolvedBase)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  try {
    const stat = await fs.promises.stat(absolutePath);
    if (!stat.isFile()) {
      return c.json({ error: 'Not Found' }, 404);
    }

    const fileBuffer = await fs.promises.readFile(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.webm': 'audio/webm',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return c.json({ error: 'Not Found' }, 404);
  }
});

// 404 处理
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// 错误处理
app.onError(errorHandler);

// 启动服务器（仅在非测试环境）
if (process.env.NODE_ENV !== 'test') {
  const port = config.port;

  // Start webhook delivery worker
  const webhookWorker = new WebhookWorker(webhookRepository);
  webhookWorker.start();

  // Start plugin event bridge
  pluginBridge.start();

  // Start Kafka event bridge
  kafkaBridge.start().then(() => {
    console.log('📊 Kafka bridge started');
  }).catch((err) => {
    console.error('Failed to start Kafka bridge:', err);
  });

  console.log(`🚀 Server starting on http://${config.host}:${port}`);

  const serverInstance = serve({
    fetch: app.fetch,
    port,
    hostname: config.host,
  });

  // 初始化 WebSocket
  // @ts-expect-error - Type mismatch between @hono/node-server and ws Server types
  websocketHandler.initialize(serverInstance);

  // 优雅关闭
  process.on('SIGTERM', async () => {
    appLogger.info('SIGTERM received, closing server...');
    websocketHandler.close();
    await closeSentry();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    appLogger.info('SIGINT received, closing server...');
    websocketHandler.close();
    await closeSentry();
    process.exit(0);
  });
}

export { app };
