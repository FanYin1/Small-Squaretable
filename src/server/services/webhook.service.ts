/**
 * Webhook 服务
 *
 * 管理 Webhook 端点，监听 EventBus 事件并创建投递记录
 */

import { randomBytes } from 'crypto';
import type { WebhookRepository } from '../../db/repositories/webhook.repository';
import type { WebhookEndpoint, WebhookDelivery } from '../../db/schema/webhooks';
import type { CreateWebhookInput, UpdateWebhookInput, WebhookPayload } from '../../types/webhook';
import type { EventBus } from './event-bus.service';
import { NotFoundError, ForbiddenError } from '../../core/errors';

export class WebhookService {
  constructor(
    private repo: WebhookRepository,
    private eventBus: EventBus,
  ) {
    this.eventBus.on('*', this.handleEvent.bind(this));
  }

  private async handleEvent(event: string, payload: Record<string, unknown>): Promise<void> {
    if (event.startsWith('webhook.')) return;

    try {
      const endpoints = await this.repo.findEndpointsByEvent(event);
      if (endpoints.length === 0) return;

      const deliveryPayload: WebhookPayload = {
        id: randomBytes(16).toString('hex'),
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      };

      await Promise.all(
        endpoints.map((ep) =>
          this.repo.createDelivery({
            endpointId: ep.id,
            event,
            payload: deliveryPayload,
          })
        )
      );
    } catch (error) {
      console.error(`[WebhookService] Failed to process event "${event}":`, error);
    }
  }

  async createEndpoint(userId: string, input: CreateWebhookInput): Promise<WebhookEndpoint & { secret: string }> {
    const secret = randomBytes(32).toString('hex');
    const endpoint = await this.repo.createEndpoint({
      userId,
      url: input.url,
      secret,
      events: input.events,
      description: input.description,
      metadata: input.metadata ?? {},
    });
    return { ...endpoint, secret };
  }

  async getEndpoint(id: string, userId: string): Promise<WebhookEndpoint> {
    const endpoint = await this.repo.findEndpointById(id);
    if (!endpoint) throw new NotFoundError('Webhook endpoint');
    if (endpoint.userId !== userId) throw new ForbiddenError();
    return endpoint;
  }

  async listEndpoints(userId: string): Promise<WebhookEndpoint[]> {
    return this.repo.findEndpointsByUserId(userId);
  }

  async updateEndpoint(id: string, userId: string, input: UpdateWebhookInput): Promise<WebhookEndpoint> {
    const updated = await this.repo.updateEndpoint(id, userId, input);
    if (!updated) throw new NotFoundError('Webhook endpoint');
    return updated;
  }

  async deleteEndpoint(id: string, userId: string): Promise<void> {
    const deleted = await this.repo.deleteEndpoint(id, userId);
    if (!deleted) throw new NotFoundError('Webhook endpoint');
  }

  async testEndpoint(id: string, userId: string): Promise<WebhookDelivery> {
    const endpoint = await this.getEndpoint(id, userId);
    const payload: WebhookPayload = {
      id: randomBytes(16).toString('hex'),
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test webhook delivery' },
    };
    return this.repo.createDelivery({
      endpointId: endpoint.id,
      event: 'webhook.test',
      payload,
    });
  }

  async getDeliveries(endpointId: string, userId: string, limit = 20, offset = 0) {
    await this.getEndpoint(endpointId, userId);
    return this.repo.findDeliveriesByEndpointId(endpointId, limit, offset);
  }

  async retryDelivery(endpointId: string, deliveryId: string, userId: string): Promise<WebhookDelivery> {
    await this.getEndpoint(endpointId, userId);
    return this.repo.updateDelivery(deliveryId, {
      status: 'pending',
      nextRetryAt: null,
    });
  }
}
