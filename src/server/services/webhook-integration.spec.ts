/**
 * Webhook 系统集成测试
 *
 * 验证 EventBus → WebhookService → delivery 创建的完整流程
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from './event-bus.service';
import { WebhookService } from './webhook.service';
import { WebhookWorker } from '../workers/webhook.worker';

describe('Webhook Integration', () => {
  let bus: EventBus;
  let service: WebhookService;
  let worker: WebhookWorker;

  const mockRepo = {
    createEndpoint: vi.fn(),
    findEndpointById: vi.fn(),
    findEndpointsByUserId: vi.fn(),
    findEndpointsByEvent: vi.fn(),
    updateEndpoint: vi.fn(),
    deleteEndpoint: vi.fn(),
    createDelivery: vi.fn(),
    findPendingDeliveries: vi.fn(),
    updateDelivery: vi.fn(),
    findDeliveriesByEndpointId: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    bus = new EventBus();
    service = new WebhookService(mockRepo as any, bus);
    worker = new WebhookWorker(mockRepo as any);
  });

  it('should create delivery when matching event is emitted', async () => {
    mockRepo.findEndpointsByEvent.mockResolvedValue([
      { id: 'ep-1', url: 'https://example.com/hook', secret: 'sec', events: ['character.created'] },
    ]);
    mockRepo.createDelivery.mockResolvedValue({ id: 'del-1', status: 'pending' });

    await bus.emit('character.created', { characterId: 'c-1', name: 'Test' });
    await new Promise((r) => setTimeout(r, 50));

    expect(mockRepo.findEndpointsByEvent).toHaveBeenCalledWith('character.created');
    expect(mockRepo.createDelivery).toHaveBeenCalledTimes(1);
    expect(mockRepo.createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointId: 'ep-1',
        event: 'character.created',
        payload: expect.objectContaining({
          event: 'character.created',
          data: { characterId: 'c-1', name: 'Test' },
        }),
      })
    );
  });

  it('should create deliveries for multiple matching endpoints', async () => {
    mockRepo.findEndpointsByEvent.mockResolvedValue([
      { id: 'ep-1', url: 'https://a.com/hook', secret: 's1', events: ['chat.created'] },
      { id: 'ep-2', url: 'https://b.com/hook', secret: 's2', events: ['chat.created'] },
    ]);
    mockRepo.createDelivery.mockResolvedValue({ id: 'del', status: 'pending' });

    await bus.emit('chat.created', { chatId: 'ch-1' });
    await new Promise((r) => setTimeout(r, 50));

    expect(mockRepo.createDelivery).toHaveBeenCalledTimes(2);
  });

  it('worker should sign payload correctly', () => {
    const sig = worker.sign('my-secret', '{"test":true}');
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
  });
});
