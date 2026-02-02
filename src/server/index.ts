/**
 * 服务器入口文件
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { config } from '@/core/config';
import { errorHandler } from './middleware/error-handler';
import { tenantMiddleware } from './middleware/tenant';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { characterRoutes } from './routes/characters';
import { chatRoutes } from './routes/chats';
import { subscriptionRoutes } from './routes/subscriptions';
import { usageRoutes } from './routes/usage';
import { llmRoutes } from './routes/llm';
import { basicHealthCheck, livenessCheck, readinessCheck } from './services/health';
import { websocketHandler } from './routes/websocket';

type Variables = {
  tenantId?: string;
};

const app = new Hono<{ Variables: Variables }>();

// 中间件
app.use('*', logger());
app.use('*', cors());

// Tenant middleware 只应用到需要租户隔离的 API 路由
app.use('/api/v1/users/*', tenantMiddleware());
app.use('/api/v1/characters/*', tenantMiddleware());
app.use('/api/v1/chats/*', tenantMiddleware());
app.use('/api/v1/subscriptions/*', tenantMiddleware());
app.use('/api/v1/usage/*', tenantMiddleware());
app.use('/api/v1/llm/*', tenantMiddleware());

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
app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/users', userRoutes);
app.route('/api/v1/characters', characterRoutes);
app.route('/api/v1/chats', chatRoutes);
app.route('/api/v1/subscriptions', subscriptionRoutes);
app.route('/api/v1/usage', usageRoutes);
app.route('/api/v1/llm', llmRoutes);

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
      subscriptions: '/api/v1/ions',
      usage: '/api/v1/usage',
      llm: '/api/v1/llm',
      docs: '/api/v1/docs',
      ws: '/ws',
    },
  });
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
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    websocketHandler.close();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, closing server...');
    websocketHandler.close();
    process.exit(0);
  });
}

export { app };
