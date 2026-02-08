/**
 * WebhookService 单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from './event-bus.service';
import { WebhookService } from './webhook.service';
import { NotFoundError, ForbiddenError } from '../../core/errors';

function createMockRepo() {
  return {
    createEndpoint: vi.fn(),
    findEndpointById: vi.fn(),
    findEndpointsByUserId: vi.fn(),
    findEndpointsByEvent: vi.fn(),
    updateEndpoint: vi.fn(),
    deleteEndpoint: vi.fn(),
    createDelivery: vi.fn(),
    findDeliveriesByEndpointId: vi.fn(),
    updateDelivery: vi.fn(),
    findPendingDeliveries: vi.fn(),
  };
}

type MockRepo = ReturnType<typeof createMockRepo>;

describe('WebhookService', () => {
  let eventBus: EventBus;
  let repo: MockRepo;
  let service: WebhookService;

  beforeEach(() => {
    eventBus = new EventBus();
    repo = createMockRepo();
    service = new WebhookService(repo as any, eventBus);
  });

  describe('createEndpoint', () => {
    it('should create endpoint with generated secret', async () => {
      const fakeEndpoint = {
        id: 'ep-1',
        userId: 'user-1',
        url: 'https://example.com/hook',
        secret: 'hashed',
        events: ['character.created'],
        isActive: true,
        description: 'Test',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      repo.createEndpoint.mockResolvedValue(fakeEndpoint);

      const result = await service.createEndpoint('user-1', {
        url: 'https://example.com/hook',
        events: ['character.created'],
        description: 'Test',
      });

      expect(repo.createEndpoint).toHaveBeenCalledTimes(1);
      const callArg = repo.createEndpoint.mock.calls[0][0];
      expect(callArg.userId).toBe('user-1');
      expect(callArg.url).toBe('https://example.com/hook');
      expect(callArg.events).toEqual(['character.created']);
      expect(callArg.secret).toBeTypeOf('string');
      expect(callArg.secret.length).toBe(64); // 32 bytes hex
      expect(result.secret).toBe(callArg.secret);
      expect(result.id).toBe('ep-1');
    });

    it('should default metadata to empty object when not provided', async () => {
      repo.createEndpoint.mockResolvedValue({ id: 'ep-2' });

      await service.createEndpoint('user-1', {
        url: 'https://example.com/hook',
        events: ['chat.created'],
      });

      const callArg = repo.createEndpoint.mock.calls[0][0];
      expect(callArg.metadata).toEqual({});
    });
  });

  describe('getEndpoint', () => {
    it('should return endpoint if owned by user', async () => {
      const ep = { id: 'ep-1', userId: 'user-1' };
      repo.findEndpointById.mockResolvedValue(ep);

      const result = await service.getEndpoint('ep-1', 'user-1');
      expect(result).toEqual(ep);
    });

    it('should throw NotFoundError if endpoint does not exist', async () => {
      repo.findEndpointById.mockResolvedValue(null);
      await expect(service.getEndpoint('ep-999', 'user-1')).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError if user does not own endpoint', async () => {
      repo.findEndpointById.mockResolvedValue({ id: 'ep-1', userId: 'other-user' });
      await expect(service.getEndpoint('ep-1', 'user-1')).rejects.toThrow(ForbiddenError);
    });
  });

  describe('listEndpoints', () => {
    it('should delegate to repo', async () => {
      const eps = [{ id: 'ep-1' }, { id: 'ep-2' }];
      repo.findEndpointsByUserId.mockResolvedValue(eps);

      const result = await service.listEndpoints('user-1');
      expect(repo.findEndpointsByUserId).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(eps);
    });
  });

  describe('updateEndpoint', () => {
    it('should update and return endpoint', async () => {
      const updated = { id: 'ep-1', url: 'https://new.com/hook' };
      repo.updateEndpoint.mockResolvedValue(updated);

      const result = await service.updateEndpoint('ep-1', 'user-1', { url: 'https://new.com/hook' });
      expect(repo.updateEndpoint).toHaveBeenCalledWith('ep-1', 'user-1', { url: 'https://new.com/hook' });
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundError if update returns null', async () => {
      repo.updateEndpoint.mockResolvedValue(null);
      await expect(service.updateEndpoint('ep-999', 'user-1', {})).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteEndpoint', () => {
    it('should delete endpoint', async () => {
      repo.deleteEndpoint.mockResolvedValue(true);
      await expect(service.deleteEndpoint('ep-1', 'user-1')).resolves.toBeUndefined();
      expect(repo.deleteEndpoint).toHaveBeenCalledWith('ep-1', 'user-1');
    });

    it('should throw NotFoundError if delete returns false', async () => {
      repo.deleteEndpoint.mockResolvedValue(false);
      await expect(service.deleteEndpoint('ep-999', 'user-1')).rejects.toThrow(NotFoundError);
    });
  });

  describe('handleEvent (EventBus integration)', () => {
    it('should create deliveries for matching endpoints when event is emitted', async () => {
      const endpoints = [
        { id: 'ep-1', url: 'https://a.com/hook' },
        { id: 'ep-2', url: 'https://b.com/hook' },
      ];
      repo.findEndpointsByEvent.mockResolvedValue(endpoints);
      repo.createDelivery.mockResolvedValue({ id: 'del-1' });

      await eventBus.emit('character.created', { characterId: 'char-1' });

      expect(repo.findEndpointsByEvent).toHaveBeenCalledWith('character.created');
      expect(repo.createDelivery).toHaveBeenCalledTimes(2);

      const call1 = repo.createDelivery.mock.calls[0][0];
      expect(call1.endpointId).toBe('ep-1');
      expect(call1.event).toBe('character.created');
      expect(call1.payload.event).toBe('character.created');
      expect(call1.payload.data).toEqual({ characterId: 'char-1' });
      expect(call1.payload.id).toBeTypeOf('string');
      expect(call1.payload.timestamp).toBeTypeOf('string');

      const call2 = repo.createDelivery.mock.calls[1][0];
      expect(call2.endpointId).toBe('ep-2');
    });

    it('should not create deliveries if no endpoints match', async () => {
      repo.findEndpointsByEvent.mockResolvedValue([]);

      await eventBus.emit('character.updated', { characterId: 'char-1' });

      expect(repo.findEndpointsByEvent).toHaveBeenCalledWith('character.updated');
      expect(repo.createDelivery).not.toHaveBeenCalled();
    });

    it('should skip events starting with "webhook."', async () => {
      await eventBus.emit('webhook.test', { data: 'test' });

      expect(repo.findEndpointsByEvent).not.toHaveBeenCalled();
      expect(repo.createDelivery).not.toHaveBeenCalled();
    });

    it('should not throw if repo.findEndpointsByEvent fails', async () => {
      repo.findEndpointsByEvent.mockRejectedValue(new Error('DB error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(eventBus.emit('chat.created', {})).resolves.not.toThrow();

      consoleSpy.mockRestore();
    });
  });

  describe('testEndpoint', () => {
    it('should create a test delivery for the endpoint', async () => {
      const ep = { id: 'ep-1', userId: 'user-1', url: 'https://example.com/hook' };
      repo.findEndpointById.mockResolvedValue(ep);
      const fakeDelivery = { id: 'del-1', event: 'webhook.test' };
      repo.createDelivery.mockResolvedValue(fakeDelivery);

      const result = await service.testEndpoint('ep-1', 'user-1');

      expect(repo.findEndpointById).toHaveBeenCalledWith('ep-1');
      expect(repo.createDelivery).toHaveBeenCalledTimes(1);
      const callArg = repo.createDelivery.mock.calls[0][0];
      expect(callArg.endpointId).toBe('ep-1');
      expect(callArg.event).toBe('webhook.test');
      expect(callArg.payload.event).toBe('webhook.test');
      expect(callArg.payload.data).toEqual({ message: 'This is a test webhook delivery' });
      expect(result).toEqual(fakeDelivery);
    });

    it('should throw NotFoundError if endpoint does not exist', async () => {
      repo.findEndpointById.mockResolvedValue(null);
      await expect(service.testEndpoint('ep-999', 'user-1')).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError if user does not own endpoint', async () => {
      repo.findEndpointById.mockResolvedValue({ id: 'ep-1', userId: 'other-user' });
      await expect(service.testEndpoint('ep-1', 'user-1')).rejects.toThrow(ForbiddenError);
    });
  });

  describe('getDeliveries', () => {
    it('should return deliveries after ownership check', async () => {
      repo.findEndpointById.mockResolvedValue({ id: 'ep-1', userId: 'user-1' });
      const deliveries = { items: [{ id: 'del-1' }], total: 1 };
      repo.findDeliveriesByEndpointId.mockResolvedValue(deliveries);

      const result = await service.getDeliveries('ep-1', 'user-1', 10, 0);
      expect(repo.findDeliveriesByEndpointId).toHaveBeenCalledWith('ep-1', 10, 0);
      expect(result).toEqual(deliveries);
    });
  });

  describe('retryDelivery', () => {
    it('should reset delivery status to pending', async () => {
      repo.findEndpointById.mockResolvedValue({ id: 'ep-1', userId: 'user-1' });
      const updated = { id: 'del-1', status: 'pending' };
      repo.updateDelivery.mockResolvedValue(updated);

      const result = await service.retryDelivery('ep-1', 'del-1', 'user-1');
      expect(repo.updateDelivery).toHaveBeenCalledWith('del-1', {
        status: 'pending',
        nextRetryAt: null,
      });
      expect(result).toEqual(updated);
    });
  });
});
