import { eq, and, sql, sum } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { usage, type Usage, type NewUsage } from '../schema/usage';

export class UsageRepository extends BaseRepository {
  /**
   * 记录用量
   */
  async record(
    tenantId: string,
    resourceType: 'llm_tokens' | 'messages' | 'images' | 'api_calls',
    amount: number,
    metadata?: Record<string, any>
  ): Promise<Usage> {
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM

    const data: NewUsage = {
      tenantId,
      resourceType,
      amount,
      period,
      metadata: metadata || {},
    };

    const result = await this.db.insert(usage).values(data).returning();
    return result[0];
  }

  /**
   * 查询特定资源类型的用量
   */
  async getUsage(
    tenantId: string,
    resourceType: 'llm_tokens' | 'messages' | 'images' | 'api_calls',
    period: string
  ): Promise<number> {
    const result = await this.db
      .select({ total: sum(usage.amount) })
      .from(usage)
      .where(
        and(
          eq(usage.tenantId, tenantId),
          eq(usage.resourceType, resourceType),
          eq(usage.period, period)
        )
      );

    return Number(result[0]?.total || 0);
  }

  /**
   * 查询总用量（所有资源类型）
   */
  async getTotalUsage(tenantId: string, period: string): Promise<number> {
    const result = await this.db
      .select({ total: sum(usage.amount) })
      .from(usage)
      .where(and(eq(usage.tenantId, tenantId), eq(usage.period, period)));

    return Number(result[0]?.total || 0);
  }

  /**
   * 按资源类型分组查询用量
   */
  async getUsageByPeriod(
    tenantId: string,
    period: string
  ): Promise<Array<{ resourceType: string; total: number }>> {
    const result = await this.db
      .select({
        resourceType: usage.resourceType,
        total: sum(usage.amount),
      })
      .from(usage)
      .where(and(eq(usage.tenantId, tenantId), eq(usage.period, period)))
      .groupBy(usage.resourceType);

    return result.map((row) => ({
      resourceType: row.resourceType,
      total: Number(row.total || 0),
    }));
  }

  /**
   * 查询用量记录列表
   */
  async findByTenantAndPeriod(tenantId: string, period: string): Promise<Usage[]> {
    return await this.db
      .select()
      .from(usage)
      .where(and(eq(usage.tenantId, tenantId), eq(usage.period, period)))
      .orderBy(usage.createdAt);
  }
}

export const usageRepository = new UsageRepository(db);
