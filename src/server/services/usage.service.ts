import { usageRepository } from '../../db/repositories/usage.repository';
import type { Usage } from '../../db/schema/usage';

export type ResourceType = 'llm_tokens' | 'messages' | 'images' | 'api_calls';

export interface UsageStats {
  period: string;
  byResource: Array<{
    resourceType: string;
    amount: number;
  }>;
  total: number;
}

export interface QuotaInfo {
  resourceType: ResourceType;
  currentUsage: number;
  period: string;
}

export class UsageService {
  /**
   * 追踪用量
   *
   * @param tenantId - 租户ID
   * @param resourceType - 资源类型
   * @param amount - 用量数值
   * @param metadata - 可选的元数据
   * @returns 用量记录
   */
  async trackUsage(
    tenantId: string,
    resourceType: ResourceType,
    amount: number,
    metadata?: Record<string, any>
  ): Promise<Usage> {
    // 记录到数据库
    const record = await usageRepository.record(tenantId, resourceType, amount, metadata);

    return record;
  }

  /**
   * 获取用量统计
   *
   * @param tenantId - 租户ID
   * @param period - 可选的时间周期 (YYYY-MM 格式)，默认为当前月份
   * @returns 用量统计信息
   */
  async getUsageStats(tenantId: string, period?: string): Promise<UsageStats> {
    // 如果没有 period，使用当前月份
    const targetPeriod = period || new Date().toISOString().slice(0, 7);

    // 按资源类型分组查询
    const byResource = await usageRepository.getUsageByPeriod(tenantId, targetPeriod);

    // 计算总计
    const total = byResource.reduce((sum, item) => sum + item.total, 0);

    return {
      period: targetPeriod,
      byResource: byResource.map((item) => ({
        resourceType: item.resourceType,
        amount: item.total,
      })),
      total,
    };
  }

  /**
   * 检查配额
   *
   * @param tenantId - 租户ID
   * @param resourceType - 资源类型
   * @returns 配额信息
   */
  async checkQuota(tenantId: string, resourceType: ResourceType): Promise<QuotaInfo> {
    const period = new Date().toISOString().slice(0, 7);

    // 获取当前用量
    const currentUsage = await usageRepository.getUsage(tenantId, resourceType, period);

    return {
      resourceType,
      currentUsage,
      period,
    };
  }
}

export const usageService = new UsageService();
