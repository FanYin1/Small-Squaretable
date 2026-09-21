/**
 * 用量计量的统一入口
 *
 * 配额是收费的基础：requireQuota 读的是 usage 表的累计值，
 * 如果某条链路只有 gate 没有计量，那条链路上的用量永远是 0，
 * gate 也就永远不会拒绝——发布的套餐上限只是装饰。
 *
 * 这个 helper 存在的原因是消息有两条传输通道（HTTP 路由和 WebSocket），
 * 两边都要计量，而且必须是同一套语义。分别手写两遍，早晚会漂移成
 * 「一边算一边不算」，那种缺口从用量面板上是看不出来的。
 *
 * 两条硬性约定：
 * 1. 计量失败绝不反过来打断用户的请求。消息此时已经落库了，抛异常只会
 *    让用户看到一个假的失败然后重发，等于用丢消息换一行账。
 * 2. 但失败必须留下 error 级日志。静默吞掉会让计量缺口完全不可观测，
 *    这正是当前这个 bug 能存在这么久的原因。
 *
 * 也就是说这里不是 fire-and-forget：调用方要 await，只是不会因此失败。
 */

import { usageService, type ResourceType } from './usage.service';
import { logger } from './logger.service';

const meterLogger = logger.child({ module: 'usage-meter' });

/**
 * 记录一次用量。
 *
 * @param tenantId - 租户 ID；缺失时跳过并告警（无法归属的用量等于没算）
 * @param resourceType - 资源类型
 * @param amount - 用量数值；非正数或非有限值会被跳过
 * @param metadata - 可选元数据，便于事后对账（例如 transport、model）
 * @returns 是否真的写入了一条用量记录
 */
export async function meterUsage(
  tenantId: string | undefined | null,
  resourceType: ResourceType,
  amount: number,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  if (!tenantId) {
    // 走到这里说明调用点拿不到租户上下文，是代码问题，不是数据问题
    meterLogger.warn('Skipped usage metering: missing tenantId', { resourceType, amount });
    return false;
  }

  // amount <= 0 是正常路径（例如流式生成被中断，tokens 为 0），不告警
  if (!Number.isFinite(amount) || amount <= 0) {
    return false;
  }

  try {
    await usageService.trackUsage(tenantId, resourceType, amount, metadata);
    return true;
  } catch (error) {
    meterLogger.error('Failed to record usage', error as Error, {
      tenantId,
      resourceType,
      amount,
    });
    return false;
  }
}
