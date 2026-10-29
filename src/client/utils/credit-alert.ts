/**
 * 点数不足报警（P3-1 遗留）
 *
 * WebSocket 与 HTTP 两条聊天通道收到 INSUFFICIENT_CREDITS 时都走这里。
 * 弹窗打开期间重复触发不会再弹第二个。
 */

import { ElMessageBox } from 'element-plus';
import i18n from '@client/i18n';
import { createLogger } from '@client/utils/logger';

const logger = createLogger('CreditAlert');

export const INSUFFICIENT_CREDITS_CODE = 'INSUFFICIENT_CREDITS';

/** 服务端 InsufficientCreditsError 的 details（字段都可能缺失） */
export interface InsufficientCreditsDetails {
  requiredPoints?: number;
  availablePoints?: number;
}

let alertOpen = false;

function formatPoints(points: number): string {
  return points.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function readPoints(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function buildMessage(details: unknown): string {
  const t = i18n.global.t;
  const source = (details ?? {}) as InsufficientCreditsDetails;
  const required = readPoints(source.requiredPoints);
  const available = readPoints(source.availablePoints);

  if (required === undefined || available === undefined) {
    return t('credits.insufficient');
  }
  return `${t('credits.insufficientDetail', {
    required: formatPoints(required),
    available: formatPoints(available),
  })}${t('credits.insufficientContact')}`;
}

/**
 * 弹出点数不足提示，带「查看余额」按钮跳到订阅页。
 * 已有提示打开时直接返回。
 */
export async function showInsufficientCreditsAlert(details?: unknown): Promise<void> {
  if (alertOpen) return;
  alertOpen = true;
  let viewBalance = false;
  try {
    await ElMessageBox.alert(buildMessage(details), i18n.global.t('credits.insufficientTitle'), {
      type: 'warning',
      confirmButtonText: i18n.global.t('credits.viewBalance'),
      showClose: true,
    });
    viewBalance = true;
  } catch {
    // 用户关闭了弹窗（关闭/ESC 会 reject），不跳转
  } finally {
    alertOpen = false;
  }

  if (viewBalance) {
    try {
      // 动态导入 router，避免 store -> router -> store 的循环依赖
      const { default: router } = await import('@client/router');
      await router.push({ name: 'Subscription' });
    } catch (e) {
      logger.error('Failed to open subscription page', e);
    }
  }
}

/** 错误是否是点数不足（HTTP 通道的 ApiError 或 WS 错误事件） */
export function isInsufficientCredits(error: unknown): error is { code: string; details?: unknown } {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === INSUFFICIENT_CREDITS_CODE
  );
}
