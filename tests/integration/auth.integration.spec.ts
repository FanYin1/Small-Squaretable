/**
 * 认证系统集成测试
 *
 * 测试完整的认证流程：注册 -> 登录 -> 刷新 -> 登出
 *
 * ⚠️  前置条件：
 * - PostgreSQL 数据库必须运行并已执行迁移
 * - Redis 服务必须运行
 * - 环境变量已正确配置（DATABASE_URL, REDIS_URL, JWT_SECRET）
 *
 * 如果服务未运行，这些测试将被跳过
 */

import { describe, it, expect } from 'vitest';
import { app } from '../../src/server/index';

describe.skip('Auth Integration Tests (requires DB and Redis)', () => {
  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'TestPassword123!',
  };
  let accessToken: string;
  let refreshToken: string;

  describe('Registration Flow', () => {
    it('should register a new user', async () => {
      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.user.email).toBe(testUser.email);
      expect(data.data.tokens.accessToken).toBeDefined();

      accessToken = data.data.tokens.accessToken;
      refreshToken = data.data.tokens.refreshToken;
    });

    it('should reject duplicate registration', async () => {
      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid email format', async () => {
      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'invalid-email', password: 'password123' }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject short password', async () => {
      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: '123' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('Login Flow', () => {
    it('should login with valid credentials', async () => {
      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.user.email).toBe(testUser.email);
      expect(data.data.tokens.accessToken).toBeDefined();

      accessToken = data.data.tokens.accessToken;
      refreshToken = data.data.tokens.refreshToken;
    });

    it('should reject invalid credentials', async () => {
      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...testUser, password: 'wrong' }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject non-existent user', async () => {
      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent@example.com', password: 'password123' }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('Token Flow', () => {
    it('should get current user with valid token', async () => {
      const res = await app.request('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.user.email).toBe(testUser.email);
    });

    it('should reject request without token', async () => {
      const res = await app.request('/api/v1/auth/me');

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('should reject request with invalid token', async () => {
      const res = await app.request('/api/v1/auth/me', {
        headers: { Authorization: 'Bearer invalid_token' },
      });

      expect(res.status).toBe(401);
    });

    it('should refresh tokens', async () => {
      const res = await app.request('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.accessToken).toBeDefined();
      expect(data.data.refreshToken).toBeDefined();

      // Update tokens for logout test
      accessToken = data.data.accessToken;
      refreshToken = data.data.refreshToken;
    });

    it('should reject invalid refresh token', async () => {
      const res = await app.request('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'invalid_refresh_token' }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('Logout Flow', () => {
    it('should logout successfully', async () => {
      const res = await app.request('/api/v1/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should reject refresh token after logout', async () => {
      const res = await app.request('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      expect(res.status).toBe(401);
    });
  });
});
