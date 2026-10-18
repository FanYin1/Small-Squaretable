/**
 * 点数 / token 换算（P3-1）
 *
 * 账本全程用 token 的整数记账，点数只在边界（运营者输入、用户展示）换算。
 * 这样账本里永远没有小数，也就没有浮点累计误差。
 *
 * 1 点 = CREDIT_TOKENS_PER_POINT token（默认 10000，所以 6200 token = 0.62 点）。
 */

import { config } from '../../core/config';

/** 点数最多保留几位小数（输入与展示）。10000 token/点时 4 位小数正好对应 1 token。 */
export const POINT_DECIMALS = 4;

export function getTokensPerPoint(): number {
  return config.creditTokensPerPoint;
}

/**
 * 点数 → token。四舍五入到整数 token。
 * 结果不是有限的正整数（例如输入 0、负数、NaN）时返回 null，由调用方报参数错误。
 */
export function pointsToTokens(points: number, tokensPerPoint: number = getTokensPerPoint()): number | null {
  if (!Number.isFinite(points)) return null;
  const tokens = Math.round(points * tokensPerPoint);
  if (!Number.isSafeInteger(tokens) || tokens <= 0) return null;
  return tokens;
}

/** token → 点数（展示用，保留 POINT_DECIMALS 位小数，去掉浮点噪声）。 */
export function tokensToPoints(tokens: number, tokensPerPoint: number = getTokensPerPoint()): number {
  const factor = 10 ** POINT_DECIMALS;
  return Math.round((tokens / tokensPerPoint) * factor) / factor;
}
