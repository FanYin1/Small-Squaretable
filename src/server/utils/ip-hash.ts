import crypto from 'crypto';

/**
 * 截断的 SHA-256：够用于比对同一来源，又不是明文 IP。
 * 审计日志与年龄声明的举证都用它，改长度会让新旧记录无法互相比对。
 */
export function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}
