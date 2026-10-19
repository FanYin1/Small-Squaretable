import { hashIp } from './ip-hash';

/**
 * 「满 18 岁声明」写入 users 的两列（注册、OAuth 注册、设置页补确认共用）。
 * 时间点 + 哈希 IP 才是这份声明的证据，单个 boolean 事后无法举证。
 * actorIp 必须来自请求头，不能是客户端提交的字段。
 */
export function ageConfirmationFields(actorIp?: string): { ageConfirmedAt: Date; ageConfirmedIp: string | null } {
  return {
    ageConfirmedAt: new Date(),
    ageConfirmedIp: actorIp ? hashIp(actorIp) : null,
  };
}
