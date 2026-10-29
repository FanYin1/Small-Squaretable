/**
 * CSRF 保护的覆盖范围
 *
 * index.ts 原来把 CSRF 逐条注册成 `app.use('/api/v1/characters', csrfProtection())`。
 * Hono 的精确路径不匹配子路径，结果只有集合端点被保护，而
 * `POST /api/v1/characters/:id/publish`、发消息、删除等全部子路径写操作都没有
 * CSRF 校验——带上 Authorization 头就能直接通过。
 *
 * 单独成文件而不是内联在 index.ts 里，理由和 public-paths.ts 相同：
 * index.ts 会拉起 Kafka / scheduler / WebSocket，测试没法便宜地导入它，
 * 而覆盖范围漏一条在生产上是静默的安全缺口，必须能自动测。
 */

/**
 * 需要 CSRF 保护的路由前缀。
 *
 * 这里刻意不写尾部 `/*`，由挂载处统一补——写成精确路径正是原来那个缺口的成因，
 * 配置里留一个裸前缀能让测试直接盯住这个约定。
 *
 * 这份清单必须和 index.ts 实际注册的一致，由 csrf-paths.spec.ts 直接比对
 * index.ts 源码来盯住漂移——漏一条就是静默丢掉一个前缀的 CSRF 保护。
 *
 * 注意：`/api/v1` 下仍有前缀不在此列——quick-replies、personas、share、
 * intelligence（挂在 `/api/v1` 根上），以及 analytics/vitals（它在 CSRF 的
 * app.use 之前注册，Hono 按注册顺序派发，所以先被路由吃掉）。它们从一开始
 * 就没被保护。`/api/v1/auth` 是刻意排除的：前端登录前拿不到 token。
 * 把这些补进保护范围是一个独立的、更大的决定，不在本次修复内。
 */
export const csrfProtectedPrefixes = [
  '/api/v1/users',
  '/api/v1/characters',
  '/api/v1/chats',
  '/api/v1/subscriptions',
  '/api/v1/usage',
  '/api/v1/credits',
  '/api/v1/llm',
  '/api/v1/worldbooks',
  '/api/v1/uploads',
  '/api/v1/webhooks',
  '/api/v1/notifications',
  '/api/v1/notification-preferences',
  '/api/v1/social',
  '/api/v1/developer',
  '/api/v1/plugins',
  '/api/v1/analytics',
  '/api/v1/reports',
  '/api/v1/admin',
  '/api/v1/account',
  '/api/v1/recommendations',
  '/api/v1/chat-templates',
  '/api/v1/character-relationships',
  '/api/v1/character-growth',
  '/api/v1/character-collaborators',
  '/api/v1/character-templates',
  '/api/v1/character-collections',
  '/api/v1/presets',
  '/api/v1/search',
] as const;

/**
 * 豁免 CSRF 的路径（精确匹配，允许一个尾部斜杠）。
 *
 * 只放第三方服务器直接调用、结构上不可能携带 CSRF token 的端点。
 * 这类请求的真实性由别的机制保证，不是靠 CSRF。
 *
 * 用精确匹配而不是前缀匹配：前缀匹配会顺带放过 `/webhook-fake` 这类兄弟路径，
 * 把一个安全边界变成一个可绕过的开口。
 */
export const csrfExemptPaths = [
  // Stripe webhook 由 Stripe 服务器直接调用，没有浏览器会话，不可能带 token。
  // 真实性由 stripe-signature 签名校验保证。如果被 CSRF 挡住，表现是所有
  // 付款回调静默失败、订阅状态永不写回库——publicPaths 曾经就漏过这条。
  '/api/v1/subscriptions/webhook',
] as const;

/** 该路径是否豁免 CSRF 校验 */
export function isCsrfExempt(path: string): boolean {
  const normalized = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
  return (csrfExemptPaths as readonly string[]).includes(normalized);
}
