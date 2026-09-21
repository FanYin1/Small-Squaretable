/**
 * 有效套餐解析
 *
 * 订阅表里 plan 和 status 是两个独立字段：plan 记录「买的是什么」，
 * status 记录「现在还算不算有效」。之前所有 gating 都只读 plan，
 * 于是付款失败（past_due）甚至已取消（canceled）的订阅照样享有 pro 权限——
 * 用户停止付费后功能一直开着，这是直接漏钱。
 *
 * 所有权限判断都必须走这里，不要再出现 `subscription?.plan || 'free'`。
 */

import type { PlanType, SubscriptionStatus } from './subscription.service';

/**
 * past_due 宽限期。
 *
 * Stripe 在首次扣款失败后会继续重试若干天（dunning），这段时间里把用户
 * 立刻降级会伤到只是卡过期的正常付费用户。所以给一个宽限窗口，
 * 窗口的起点是 currentPeriodEnd（用户已经付费覆盖到的时间点）。
 */
export const PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/** 解析有效套餐所需的最小字段，方便调用方传部分对象和测试构造数据 */
export interface EntitlementSource {
  plan: PlanType;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
}

export type EntitlementReason =
  | 'no_subscription'
  | 'active'
  | 'trialing'
  | 'past_due_grace'
  | 'past_due_expired'
  | 'canceled';

export interface Entitlement {
  /** 实际生效的套餐，权限和配额都按这个算 */
  plan: PlanType;
  /** 用户买的套餐。降级时用来提示「你的 pro 因为付款失败暂停了」而不是「请升级」 */
  purchasedPlan: PlanType;
  reason: EntitlementReason;
}

const FREE: PlanType = 'free';

/**
 * 计算租户当前真正享有的套餐
 *
 * @param subscription - 订阅记录，没有订阅传 null/undefined
 * @param now - 判定时间点，测试用
 */
export function resolveEntitlement(
  subscription: EntitlementSource | null | undefined,
  now: Date = new Date()
): Entitlement {
  if (!subscription) {
    return { plan: FREE, purchasedPlan: FREE, reason: 'no_subscription' };
  }

  const purchasedPlan = subscription.plan;

  switch (subscription.status) {
    case 'active':
      return { plan: purchasedPlan, purchasedPlan, reason: 'active' };

    case 'trialing':
      // 试用期是我们主动给的，按买到的套餐算
      return { plan: purchasedPlan, purchasedPlan, reason: 'trialing' };

    case 'past_due': {
      const paidThrough = subscription.currentPeriodEnd;
      // 没有周期终点可参照时不给宽限：宁可少放权限，也不要无限期免费。
      const withinGrace =
        paidThrough != null && now.getTime() <= paidThrough.getTime() + PAST_DUE_GRACE_MS;

      return withinGrace
        ? { plan: purchasedPlan, purchasedPlan, reason: 'past_due_grace' }
        : { plan: FREE, purchasedPlan, reason: 'past_due_expired' };
    }

    case 'canceled':
      // 取消后 Stripe 会把订阅留到周期结束才置为 canceled，
      // 所以到了 canceled 就是真的结束了，不再给宽限。
      return { plan: FREE, purchasedPlan, reason: 'canceled' };

    default:
      // 出现未知状态时保守处理，而不是默认放行
      return { plan: FREE, purchasedPlan, reason: 'canceled' };
  }
}

/** 便捷入口：只要有效套餐 */
export function resolveEffectivePlan(
  subscription: EntitlementSource | null | undefined,
  now?: Date
): PlanType {
  return resolveEntitlement(subscription, now).plan;
}

/** 权限被暂停（买了但当前不生效），用于区分「请升级」和「请更新付款方式」 */
export function isSuspended(entitlement: Entitlement): boolean {
  return entitlement.plan !== entitlement.purchasedPlan;
}
