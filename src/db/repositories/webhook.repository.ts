/**
 * Webhook Repository
 *
 * 处理 Webhook 端点和投递记录的数据访问
 */

import { eq, and, sql, or, lte, lt } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import {
  webhookEndpoints,
  webhookDeliveries,
  type WebhookEndpoint,
  type NewWebhookEndpoint,
  type WebhookDelivery,
  type NewWebhookDelivery,
} from '../schema/webhooks';

export class WebhookRepository extends BaseRepository {
  // ── Endpoint CRUD ──

  async createEndpoint(data: NewWebhookEndpoint): Promise<WebhookEndpoint> {
    const result = await this.db.insert(webhookEndpoints).values(data).returning();
    return result[0];
  }

  async findEndpointById(id: string): Promise<WebhookEndpoint | null> {
    const result = await this.db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, id));
    return result[0] ?? null;
  }

  async findEndpointsByUserId(userId: string): Promise<WebhookEndpoint[]> {
    return await this.db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.userId, userId))
      .orderBy(webhookEndpoints.createdAt);
  }

  async findEndpointsByEvent(event: string): Promise<WebhookEndpoint[]> {
    return await this.db
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.isActive, true),
          sql`${event} = ANY(${webhookEndpoints.events})`
        )
      );
  }

  async updateEndpoint(
    id: string,
    userId: string,
    data: Partial<Pick<WebhookEndpoint, 'url' | 'events' | 'isActive' | 'description' | 'metadata'>>
  ): Promise<WebhookEndpoint | null> {
    const result = await this.db
      .update(webhookEndpoints)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.userId, userId)))
      .returning();
    return result[0] ?? null;
  }

  async deleteEndpoint(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // ── Delivery CRUD ──

  async createDelivery(data: NewWebhookDelivery): Promise<WebhookDelivery> {
    const result = await this.db.insert(webhookDeliveries).values(data).returning();
    return result[0];
  }

  async findPendingDeliveries(limit: number): Promise<(WebhookDelivery & { endpoint: WebhookEndpoint })[]> {
    const now = new Date();
    const rows = await this.db
      .select({
        delivery: webhookDeliveries,
        endpoint: webhookEndpoints,
      })
      .from(webhookDeliveries)
      .innerJoin(webhookEndpoints, eq(webhookDeliveries.endpointId, webhookEndpoints.id))
      .where(
        or(
          eq(webhookDeliveries.status, 'pending'),
          and(
            eq(webhookDeliveries.status, 'retrying'),
            lte(webhookDeliveries.nextRetryAt, now)
          )
        )
      )
      .limit(limit)
      .orderBy(webhookDeliveries.createdAt);

    return rows.map((r) => ({ ...r.delivery, endpoint: r.endpoint }));
  }

  async updateDelivery(
    id: string,
    data: Partial<Pick<WebhookDelivery, 'status' | 'httpStatus' | 'response' | 'attempts' | 'nextRetryAt' | 'completedAt'>>
  ): Promise<WebhookDelivery> {
    const result = await this.db
      .update(webhookDeliveries)
      .set(data)
      .where(eq(webhookDeliveries.id, id))
      .returning();
    return result[0];
  }

  async findDeliveriesByEndpointId(
    endpointId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ items: WebhookDelivery[]; total: number }> {
    const items = await this.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.endpointId, endpointId))
      .orderBy(sql`${webhookDeliveries.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.endpointId, endpointId));

    return { items, total: count };
  }
  // ── Cleanup ──

  async deleteOldDeliveries(before: Date): Promise<number> {
    const result = await this.db
      .delete(webhookDeliveries)
      .where(lt(webhookDeliveries.createdAt, before))
      .returning();
    return result.length;
  }
}

export const webhookRepository = new WebhookRepository(db);
