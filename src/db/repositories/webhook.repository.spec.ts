/**
 * WebhookRepository 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../index';
import { webhookEndpoints, webhookDeliveries } from '../schema/webhooks';
import { users } from '../schema/users';
import { tenants } from '../schema/tenants';
import { WebhookRepository } from './webhook.repository';
import { eq } from 'drizzle-orm';

describe('WebhookRepository', () => {
  let repository: WebhookRepository;
  let testTenantId: string;
  let testUserId: string;

  beforeEach(async () => {
    repository = new WebhookRepository(db);

    // Create test tenant
    const [tenant] = await db.insert(tenants).values({
      name: 'Test Tenant',
      slug: 'test-tenant-' + Date.now(),
    }).returning();
    testTenantId = tenant.id;

    // Create test user
    const [user] = await db.insert(users).values({
      tenantId: testTenantId,
      email: `test-${Date.now()}@example.com`,
      passwordHash: 'hash',
      username: `testuser-${Date.now()}`,
    }).returning();
    testUserId = user.id;
  });

  afterEach(async () => {
    // Clean up in reverse order of dependencies
    await db.delete(webhookDeliveries);
    await db.delete(webhookEndpoints).where(eq(webhookEndpoints.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  });

  describe('createEndpoint', () => {
    it('should create a new webhook endpoint', async () => {
      const endpointData = {
        userId: testUserId,
        url: 'https://example.com/webhook',
        secret: 'test-secret-key',
        events: ['character.created', 'chat.message'],
        description: 'Test webhook endpoint',
      };

      const endpoint = await repository.createEndpoint(endpointData);

      expect(endpoint).toBeDefined();
      expect(endpoint.id).toBeDefined();
      expect(endpoint.userId).toBe(testUserId);
      expect(endpoint.url).toBe('https://example.com/webhook');
      expect(endpoint.secret).toBe('test-secret-key');
      expect(endpoint.events).toEqual(['character.created', 'chat.message']);
      expect(endpoint.isActive).toBe(true);
      expect(endpoint.description).toBe('Test webhook endpoint');
      expect(endpoint.createdAt).toBeDefined();
      expect(endpoint.updatedAt).toBeDefined();
    });
  });

  describe('findEndpointsByUserId', () => {
    it('should return endpoints for a user', async () => {
      // Create two endpoints
      await repository.createEndpoint({
        userId: testUserId,
        url: 'https://example.com/webhook1',
        secret: 'secret1',
        events: ['character.created'],
      });

      await repository.createEndpoint({
        userId: testUserId,
        url: 'https://example.com/webhook2',
        secret: 'secret2',
        events: ['chat.message'],
      });

      const endpoints = await repository.findEndpointsByUserId(testUserId);

      expect(endpoints).toHaveLength(2);
      expect(endpoints[0].userId).toBe(testUserId);
      expect(endpoints[1].userId).toBe(testUserId);
    });

    it('should return empty array if no endpoints exist', async () => {
      const endpoints = await repository.findEndpointsByUserId(testUserId);
      expect(endpoints).toHaveLength(0);
    });
  });

  describe('findEndpointsByEvent', () => {
    it('should return active endpoints matching event', async () => {
      // Create active endpoint with matching event
      await repository.createEndpoint({
        userId: testUserId,
        url: 'https://example.com/webhook-active',
        secret: 'secret1',
        events: ['character.created', 'chat.message'],
        isActive: true,
      });

      // Create inactive endpoint with matching event
      await repository.createEndpoint({
        userId: testUserId,
        url: 'https://example.com/webhook-inactive',
        secret: 'secret2',
        events: ['character.created'],
        isActive: false,
      });

      const endpoints = await repository.findEndpointsByEvent('character.created');

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].url).toBe('https://example.com/webhook-active');
      expect(endpoints[0].isActive).toBe(true);
    });

    it('should return empty array if no endpoints match event', async () => {
      await repository.createEndpoint({
        userId: testUserId,
        url: 'https://example.com/webhook',
        secret: 'secret1',
        events: ['character.created'],
        isActive: true,
      });

      const endpoints = await repository.findEndpointsByEvent('nonexistent.event');
      expect(endpoints).toHaveLength(0);
    });
  });

  describe('createDelivery', () => {
    it('should create a delivery with pending status', async () => {
      const endpoint = await repository.createEndpoint({
        userId: testUserId,
        url: 'https://example.com/webhook',
        secret: 'secret1',
        events: ['character.created'],
      });

      const delivery = await repository.createDelivery({
        endpointId: endpoint.id,
        event: 'character.created',
        payload: { characterId: 'test-char-123', name: 'Test Character' },
      });

      expect(delivery).toBeDefined();
      expect(delivery.id).toBeDefined();
      expect(delivery.endpointId).toBe(endpoint.id);
      expect(delivery.event).toBe('character.created');
      expect(delivery.payload).toEqual({ characterId: 'test-char-123', name: 'Test Character' });
      expect(delivery.status).toBe('pending');
      expect(delivery.attempts).toBe(0);
      expect(delivery.maxAttempts).toBe(5);
      expect(delivery.createdAt).toBeDefined();
    });
  });

  describe('findPendingDeliveries', () => {
    it('should return pending deliveries with endpoint data', async () => {
      const endpoint = await repository.createEndpoint({
        userId: testUserId,
        url: 'https://example.com/webhook',
        secret: 'secret1',
        events: ['character.created'],
      });

      await repository.createDelivery({
        endpointId: endpoint.id,
        event: 'character.created',
        payload: { test: true },
      });

      const pending = await repository.findPendingDeliveries(10);

      expect(pending.length).toBeGreaterThanOrEqual(1);
      const found = pending.find((d) => d.endpointId === endpoint.id);
      expect(found).toBeDefined();
      expect(found!.endpoint).toBeDefined();
      expect(found!.endpoint.url).toBe('https://example.com/webhook');
      expect(found!.status).toBe('pending');
    });

    it('should return retrying deliveries with past nextRetryAt', async () => {
      const endpoint = await repository.createEndpoint({
        userId: testUserId,
        url: 'https://example.com/webhook',
        secret: 'secret1',
        events: ['character.created'],
      });

      const delivery = await repository.createDelivery({
        endpointId: endpoint.id,
        event: 'character.created',
        payload: { test: true },
      });

      // Update to retrying with past nextRetryAt
      const pastDate = new Date(Date.now() - 60000);
      await repository.updateDelivery(delivery.id, {
        status: 'retrying',
        attempts: 1,
        nextRetryAt: pastDate,
      });

      const pending = await repository.findPendingDeliveries(10);

      const found = pending.find((d) => d.id === delivery.id);
      expect(found).toBeDefined();
      expect(found!.status).toBe('retrying');
    });
  });

  describe('updateDelivery', () => {
    it('should update delivery status and fields', async () => {
      const endpoint = await repository.createEndpoint({
        userId: testUserId,
        url: 'https://example.com/webhook',
        secret: 'secret1',
        events: ['character.created'],
      });

      const delivery = await repository.createDelivery({
        endpointId: endpoint.id,
        event: 'character.created',
        payload: { test: true },
      });

      const completedAt = new Date();
      const updated = await repository.updateDelivery(delivery.id, {
        status: 'delivered',
        httpStatus: 200,
        response: '{"ok":true}',
        attempts: 1,
        completedAt,
      });

      expect(updated.status).toBe('delivered');
      expect(updated.httpStatus).toBe(200);
      expect(updated.response).toBe('{"ok":true}');
      expect(updated.attempts).toBe(1);
      expect(updated.completedAt).toBeDefined();
    });
  });

  describe('deleteEndpoint', () => {
    it('should delete endpoint and return true', async () => {
      const endpoint = await repository.createEndpoint({
        userId: testUserId,
        url: 'https://example.com/webhook',
        secret: 'secret1',
        events: ['character.created'],
      });

      const deleted = await repository.deleteEndpoint(endpoint.id, testUserId);
      expect(deleted).toBe(true);

      const found = await repository.findEndpointById(endpoint.id);
      expect(found).toBeNull();
    });

    it('should return false if endpoint not found', async () => {
      const deleted = await repository.deleteEndpoint('00000000-0000-0000-0000-000000000000', testUserId);
      expect(deleted).toBe(false);
    });

    it('should cascade delete deliveries when endpoint is deleted', async () => {
      const endpoint = await repository.createEndpoint({
        userId: testUserId,
        url: 'https://example.com/webhook',
        secret: 'secret1',
        events: ['character.created'],
      });

      // Create a delivery for this endpoint
      await repository.createDelivery({
        endpointId: endpoint.id,
        event: 'character.created',
        payload: { test: true },
      });

      // Delete the endpoint
      await repository.deleteEndpoint(endpoint.id, testUserId);

      // Deliveries should be cascade deleted
      const deliveries = await repository.findDeliveriesByEndpointId(endpoint.id);
      expect(deliveries.items).toHaveLength(0);
      expect(deliveries.total).toBe(0);
    });
  });

  describe('findDeliveriesByEndpointId', () => {
    it('should return paginated deliveries with total count', async () => {
      const endpoint = await repository.createEndpoint({
        userId: testUserId,
        url: 'https://example.com/webhook',
        secret: 'secret1',
        events: ['character.created'],
      });

      // Create 3 deliveries
      for (let i = 0; i < 3; i++) {
        await repository.createDelivery({
          endpointId: endpoint.id,
          event: 'character.created',
          payload: { index: i },
        });
      }

      const result = await repository.findDeliveriesByEndpointId(endpoint.id, 2, 0);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(3);
    });
  });
});
