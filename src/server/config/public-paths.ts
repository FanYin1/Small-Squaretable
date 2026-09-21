/**
 * 不需要 X-Tenant-ID 的公开路径
 *
 * `tenantMiddleware` 用前缀匹配（`path.startsWith(p)`）来判断是否跳过租户检查，
 * 所以这里写路径前缀即可，不需要枚举子路径。
 *
 * 单独成文件而不是内联在 index.ts 里，是为了能被测试直接引用：
 * index.ts 会拉起 Kafka / scheduler / WebSocket 等一整套依赖，测试没法便宜地导入它。
 * 漏掉一条（比如 Stripe webhook）在生产上表现为 400，本地很难发现，必须能自动测。
 */
export const publicPaths = [
  '/health',
  '/api/v1/auth',
  '/api/v1/auth/oauth',
  '/api/v1/characters/search',
  '/api/v1/characters/marketplace',
  '/api/v1/characters/:id', // 公开访问角色详情
  '/api/v1/plugins/marketplace',
  '/api/v1/plugins/marketplace/:id',
  '/api/v1/recommendations/trending',
  '/api/v1/recommendations/similar',
  '/api/v1/share',

  // Stripe webhook 由 Stripe 服务器直接调用，不可能带 X-Tenant-ID。
  // 租户身份来自 event 里的 metadata.tenantId / stripeSubscriptionId，
  // 请求真实性由 stripe-signature 签名校验保证，而不是靠这个头。
  '/api/v1/subscriptions/webhook',
];
