/**
 * 整个前缀归属某个功能模块的 /api/v1 路由（P2-1）。
 *
 * 模块关闭时 index.ts 不挂这些前缀的路由，同时也跳过它们的
 * 租户 / CSRF 中间件，否则 tenantMiddleware 会在路由之前先返回 400，
 * 请求永远走不到 404。
 *
 * 只列「整个前缀都属于该模块」的情形。social 前缀里收藏 / 评论保留，
 * 关注与动态流按路由拆开挂载，不在这里。
 */

import type { ModuleName } from '../../types/modules';

export const moduleOwnedPrefixes: Readonly<Record<string, ModuleName>> = {
  '/api/v1/webhooks': 'webhooks_developer',
  '/api/v1/developer': 'webhooks_developer',
  '/api/v1/plugins': 'plugins',
  '/api/v1/analytics': 'analytics',
  '/api/v1/recommendations': 'recommendations',
};

export function isPrefixClosed(
  prefix: string,
  isEnabled: (name: ModuleName) => boolean
): boolean {
  const owner = moduleOwnedPrefixes[prefix];
  return owner !== undefined && !isEnabled(owner);
}
