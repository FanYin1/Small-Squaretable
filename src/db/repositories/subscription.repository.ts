import { eq } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { subscriptions, type Subscription, type NewSubscription } from '../schema/subscriptions';

export class SubscriptionRepository extends BaseRepository {
  async findById(id: string): Promise<Subscription | null> {
    const result = await this.db.select().from(subscriptions).where(eq(subscriptions.id, id));
    return result[0] ?? null;
  }

  async findByTenantId(tenantId: string): Promise<Subscription | null> {
    const result = await this.db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId));
    return result[0] ?? null;
  }

  async findByStripeCustomerId(stripeCustomerId: string): Promise<Subscription | null> {
    const result = await this.db.select().from(subscriptions).where(eq(subscriptions.stripeCustomerId, stripeCustomerId));
    return result[0] ?? null;
  }

  async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<Subscription | null> {
    const result = await this.db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
    return result[0] ?? null;
  }

  async create(data: NewSubscription): Promise<Subscription> {
    const result = await this.db.insert(subscriptions).values(data).returning();
    return result[0];
  }

  async update(id: string, data: Partial<NewSubscription>): Promise<Subscription | null> {
    const result = await this.db
      .update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return result[0] ?? null;
  }

  async updateByTenantId(tenantId: string, data: Partial<NewSubscription>): Promise<Subscription | null> {
    const result = await this.db
      .update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.tenantId, tenantId))
      .returning();
    return result[0] ?? null;
  }

  async updateByStripeSubscriptionId(stripeSubscriptionId: string, data: Partial<NewSubscription>): Promise<Subscription | null> {
    const result = await this.db
      .update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .returning();
    return result[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(subscriptions).where(eq(subscriptions.id, id)).returning();
    return result.length > 0;
  }
}

export const subscriptionRepository = new SubscriptionRepository(db);
