/**
 * WebhookRepository unit tests (mocked DB)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  const c: any = {};
  c.insert = vi.fn(() => c);
  c.values = vi.fn(() => c);
  c.returning = vi.fn();
  c.select = vi.fn(() => c);
  c.from = vi.fn(() => c);
  c.where = vi.fn(() => c);
  c.update = vi.fn(() => c);
  c.set = vi.fn(() => c);
  c.delete = vi.fn(() => c);
  c.innerJoin = vi.fn(() => c);
  c.orderBy = vi.fn(() => c);
  c.limit = vi.fn(() => c);
  c.offset = vi.fn();
  return { mockDb: c };
});

vi.mock('../index', () => ({ db: mockDb }));

vi.mock('../schema/webhooks', () => ({
  webhookEndpoints: {
    id: 'id', userId: 'user_id', url: 'url', secret: 'secret',
    events: 'events', isActive: 'is_active', description: 'description',
    metadata: 'metadata', createdAt: 'created_at', updatedAt: 'updated_at',
  },
  webhookDeliveries: {
    id: 'id', endpointId: 'endpoint_id', event: 'event', payload: 'payload',
    status: 'status', httpStatus: 'http_status', response: 'response',
    attempts: 'attempts', maxAttempts: 'max_attempts',
    nextRetryAt: 'next_retry_at', completedAt: 'completed_at',
    createdAt: 'created_at',
  },
}));

vi.mock('../schema/users', () => ({
  users: { id: 'id', tenantId: 'tenant_id' },
}));
vi.mock('../schema/tenants', () => ({
  tenants: { id: 'id' },
}));

import { WebhookRepository } from './webhook.repository';

function resetChain() {
  mockDb.insert.mockImplementation(() => mockDb);
  mockDb.values.mockImplementation(() => mockDb);
  mockDb.select.mockImplementation(() => mockDb);
  mockDb.from.mockImplementation(() => mockDb);
  mockDb.where.mockImplementation(() => mockDb);
  mockDb.update.mockImplementation(() => mockDb);
  mockDb.set.mockImplementation(() => mockDb);
  mockDb.delete.mockImplementation(() => mockDb);
  mockDb.innerJoin.mockImplementation(() => mockDb);
  mockDb.orderBy.mockImplementation(() => mockDb);
  mockDb.limit.mockImplementation(() => mockDb);
}

const now = new Date('2026-01-01T00:00:00Z');

describe('WebhookRepository', () => {
  let repository: WebhookRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
    repository = new WebhookRepository(mockDb as any);
  });

  describe('createEndpoint', () => {
    it('should create a new webhook endpoint', async () => {
      const fakeEndpoint = {
        id: 'ep-1', userId: 'u-1', url: 'https://example.com/webhook',
        secret: 'test-secret-key', events: ['character.created', 'chat.message'],
        isActive: true, description: 'Test webhook endpoint',
        createdAt: now, updatedAt: now,
      };
      mockDb.returning.mockResolvedValueOnce([fakeEndpoint]);

      const endpoint = await repository.createEndpoint({
        userId: 'u-1', url: 'https://example.com/webhook',
        secret: 'test-secret-key', events: ['character.created', 'chat.message'],
        description: 'Test webhook endpoint',
      } as any);

      expect(endpoint.id).toBe('ep-1');
      expect(endpoint.url).toBe('https://example.com/webhook');
      expect(endpoint.events).toEqual(['character.created', 'chat.message']);
      expect(endpoint.isActive).toBe(true);
    });
  });

  describe('findEndpointsByUserId', () => {
    it('should return endpoints for a user', async () => {
      const fakeEndpoints = [
        { id: 'ep-1', userId: 'u-1', url: 'https://example.com/webhook1' },
        { id: 'ep-2', userId: 'u-1', url: 'https://example.com/webhook2' },
      ];
      mockDb.orderBy.mockResolvedValueOnce(fakeEndpoints);

      const endpoints = await repository.findEndpointsByUserId('u-1');

      expect(endpoints).toHaveLength(2);
      expect(endpoints[0].userId).toBe('u-1');
    });

    it('should return empty array if no endpoints exist', async () => {
      mockDb.orderBy.mockResolvedValueOnce([]);

      const endpoints = await repository.findEndpointsByUserId('u-1');
      expect(endpoints).toHaveLength(0);
    });
  });

  describe('findEndpointsByEvent', () => {
    it('should return active endpoints matching event', async () => {
      const fakeEndpoints = [
        { id: 'ep-1', url: 'https://example.com/webhook-active', isActive: true },
      ];
      mockDb.where.mockResolvedValueOnce(fakeEndpoints);

      const endpoints = await repository.findEndpointsByEvent('character.created');

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].isActive).toBe(true);
    });

    it('should return empty array if no endpoints match event', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const endpoints = await repository.findEndpointsByEvent('nonexistent.event');
      expect(endpoints).toHaveLength(0);
    });
  });
  describe('createDelivery', () => {
    it('should create a delivery with pending status', async () => {
      const fakeDelivery = {
        id: 'del-1', endpointId: 'ep-1', event: 'character.created',
        payload: { characterId: 'test-char-123' }, status: 'pending',
        attempts: 0, maxAttempts: 5, createdAt: now,
      };
      mockDb.returning.mockResolvedValueOnce([fakeDelivery]);

      const delivery = await repository.createDelivery({
        endpointId: 'ep-1', event: 'character.created',
        payload: { characterId: 'test-char-123' },
      } as any);

      expect(delivery.id).toBe('del-1');
      expect(delivery.status).toBe('pending');
      expect(delivery.attempts).toBe(0);
      expect(delivery.maxAttempts).toBe(5);
    });
  });

  describe('findPendingDeliveries', () => {
    it('should return pending deliveries with endpoint data', async () => {
      const rows = [{
        delivery: {
          id: 'del-1', endpointId: 'ep-1', status: 'pending',
          event: 'character.created', payload: { test: true },
        },
        endpoint: { id: 'ep-1', url: 'https://example.com/webhook' },
      }];
      mockDb.orderBy.mockResolvedValueOnce(rows);

      const pending = await repository.findPendingDeliveries(10);

      expect(pending.length).toBeGreaterThanOrEqual(1);
      expect(pending[0].endpoint).toBeDefined();
      expect(pending[0].endpoint.url).toBe('https://example.com/webhook');
      expect(pending[0].status).toBe('pending');
    });
  });

  describe('updateDelivery', () => {
    it('should update delivery status and fields', async () => {
      const fakeUpdated = {
        id: 'del-1', status: 'delivered', httpStatus: 200,
        response: '{"ok":true}', attempts: 1, completedAt: now,
      };
      mockDb.returning.mockResolvedValueOnce([fakeUpdated]);

      const updated = await repository.updateDelivery('del-1', {
        status: 'delivered', httpStatus: 200,
        response: '{"ok":true}', attempts: 1, completedAt: now,
      } as any);

      expect(updated.status).toBe('delivered');
      expect(updated.httpStatus).toBe(200);
      expect(updated.attempts).toBe(1);
    });
  });

  describe('deleteEndpoint', () => {
    it('should delete endpoint and return true', async () => {
      mockDb.returning.mockResolvedValueOnce([{ id: 'ep-1' }]);

      const deleted = await repository.deleteEndpoint('ep-1', 'u-1');
      expect(deleted).toBe(true);
    });

    it('should return false if endpoint not found', async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      const deleted = await repository.deleteEndpoint('00000000-0000-0000-0000-000000000000', 'u-1');
      expect(deleted).toBe(false);
    });
  });

  describe('findDeliveriesByEndpointId', () => {
    it('should return paginated deliveries with total count', async () => {
      // First where call: chain continues (items query)
      mockDb.where.mockImplementationOnce(() => mockDb);
      // offset terminates items query
      mockDb.offset.mockResolvedValueOnce([
        { id: 'del-1' },
        { id: 'del-2' },
      ]);
      // Second where call: terminates count query
      mockDb.where.mockResolvedValueOnce([{ count: 3 }]);

      const result = await repository.findDeliveriesByEndpointId('ep-1', 2, 0);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(3);
    });
  });
});
