/**
 * Webhook 路由测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// Mock auth middleware
vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', {
      id: 'user-123',
      tenantId: 'tenant-123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: null,
      role: 'user',
    });
    return next();
  },
}));

// Mock webhook service
vi.mock('../services/webhook.service', () => ({
  webhookService: {
    createEndpoint: vi.fn(),
    listEndpoints: vi.fn(),
    getEndpoint: vi.fn(),
    updateEndpoint: vi.fn(),
    deleteEndpoint: vi.fn(),
    testEndpoint: vi.fn(),
    getDeliveries: vi.fn(),
    retryDelivery: vi.fn(),
  },
}));

import { webhookRoutes } from './webhooks';
import { webhookService } from '../services/webhook.service';

describe('Webhook Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/webhooks', webhookRoutes);
    vi.clearAllMocks();
  });

  // ── POST / (create webhook) ──

  describe('POST /webhooks', () => {
    const validInput = {
      url: 'https://example.com/webhook',
      events: ['character.created', 'chat.message.sent'],
      description: 'Test webhook',
      metadata: { env: 'test' },
    };

    it('should create webhook with valid input and return 201', async () => {
      const mockEndpoint = { id: 'wh-1', ...validInput, userId: 'user-123' };
      vi.mocked(webhookService.createEndpoint).mockResolvedValue(mockEndpoint as any);

      const res = await app.request('/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validInput),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockEndpoint);
      expect(body.meta.timestamp).toBeDefined();
      expect(webhookService.createEndpoint).toHaveBeenCalledWith('user-123', validInput);
    });

    it('should return 400 for invalid URL', async () => {
      const res = await app.request('/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'not-a-url',
          events: ['character.created'],
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 for empty events array', async () => {
      const res = await app.request('/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com/webhook',
          events: [],
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ── GET / (list webhooks) ──

  describe('GET /webhooks', () => {
    it('should return 200 with list of webhooks', async () => {
      const mockEndpoints = [
        { id: 'wh-1', url: 'https://example.com/a' },
        { id: 'wh-2', url: 'https://example.com/b' },
      ];
      vi.mocked(webhookService.listEndpoints).mockResolvedValue(mockEndpoints as any);

      const res = await app.request('/webhooks');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockEndpoints);
      expect(webhookService.listEndpoints).toHaveBeenCalledWith('user-123');
    });
  });

  // ── GET /:id (get webhook) ──

  describe('GET /webhooks/:id', () => {
    it('should return 200 with webhook details', async () => {
      const mockEndpoint = { id: 'wh-1', url: 'https://example.com/a' };
      vi.mocked(webhookService.getEndpoint).mockResolvedValue(mockEndpoint as any);

      const res = await app.request('/webhooks/wh-1');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockEndpoint);
      expect(webhookService.getEndpoint).toHaveBeenCalledWith('wh-1', 'user-123');
    });
  });

  // ── PATCH /:id (update webhook) ──

  describe('PATCH /webhooks/:id', () => {
    it('should update webhook with valid input and return 200', async () => {
      const updateInput = { url: 'https://example.com/updated', isActive: false };
      const mockUpdated = { id: 'wh-1', ...updateInput };
      vi.mocked(webhookService.updateEndpoint).mockResolvedValue(mockUpdated as any);

      const res = await app.request('/webhooks/wh-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateInput),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockUpdated);
      expect(webhookService.updateEndpoint).toHaveBeenCalledWith('wh-1', 'user-123', updateInput);
    });
  });

  // ── DELETE /:id (delete webhook) ──

  describe('DELETE /webhooks/:id', () => {
    it('should delete webhook and return 200 with deleted:true', async () => {
      vi.mocked(webhookService.deleteEndpoint).mockResolvedValue(undefined as any);

      const res = await app.request('/webhooks/wh-1', { method: 'DELETE' });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ deleted: true });
      expect(webhookService.deleteEndpoint).toHaveBeenCalledWith('wh-1', 'user-123');
    });
  });

  // ── POST /:id/test (test webhook) ──

  describe('POST /webhooks/:id/test', () => {
    it('should test webhook and return 201', async () => {
      const mockDelivery = { id: 'del-1', status: 'success' };
      vi.mocked(webhookService.testEndpoint).mockResolvedValue(mockDelivery as any);

      const res = await app.request('/webhooks/wh-1/test', { method: 'POST' });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockDelivery);
      expect(webhookService.testEndpoint).toHaveBeenCalledWith('wh-1', 'user-123');
    });
  });

  // ── GET /:id/deliveries (list deliveries) ──

  describe('GET /webhooks/:id/deliveries', () => {
    it('should return 200 with deliveries using default pagination', async () => {
      const mockResult = { items: [{ id: 'del-1' }], total: 1 };
      vi.mocked(webhookService.getDeliveries).mockResolvedValue(mockResult as any);

      const res = await app.request('/webhooks/wh-1/deliveries');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockResult);
      expect(webhookService.getDeliveries).toHaveBeenCalledWith('wh-1', 'user-123', 20, 0);
    });

    it('should accept custom limit and offset', async () => {
      vi.mocked(webhookService.getDeliveries).mockResolvedValue({ items: [], total: 0 } as any);

      const res = await app.request('/webhooks/wh-1/deliveries?limit=50&offset=10');

      expect(res.status).toBe(200);
      expect(webhookService.getDeliveries).toHaveBeenCalledWith('wh-1', 'user-123', 50, 10);
    });
  });

  // ── POST /:id/deliveries/:did/retry (retry delivery) ──

  describe('POST /webhooks/:id/deliveries/:did/retry', () => {
    it('should retry delivery and return 200', async () => {
      const mockDelivery = { id: 'del-1', status: 'retrying' };
      vi.mocked(webhookService.retryDelivery).mockResolvedValue(mockDelivery as any);

      const res = await app.request('/webhooks/wh-1/deliveries/del-1/retry', { method: 'POST' });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockDelivery);
      expect(webhookService.retryDelivery).toHaveBeenCalledWith('wh-1', 'del-1', 'user-123');
    });
  });
});
