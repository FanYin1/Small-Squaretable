/**
 * JWT Token 验证工具
 */

/**
 * 验证 JWT token 是否有效（未过期）
 * @param token - JWT token 字符串
 * @returns 如果 token 有效返回 true，否则返回 false
 */
export function isTokenValid(token: string | null): boolean {
  if (!token) return false;

  try {
    // JWT 格式: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // 解析 payload (Base64 URL 编码)
    const payload = JSON.parse(atob(parts[1]));

    // 检查是否有过期时间字段
    if (!payload.exp) {
      // 如果没有 exp 字段，认为 token 永久有效
      return true;
    }

    // exp 是 Unix 时间戳（秒），需要转换为毫秒
    const expirationTime = payload.exp * 1000;
    const currentTime = Date.now();

    // 检查是否过期
    return expirationTime > currentTime;
  } catch (error) {
    // 解析失败，token 无效
    console.error('Failed to parse JWT token:', error);
    return false;
  }
}

/**
 * 从 token 中提取 payload 信息
 * @param token - JWT token 字符串
 * @returns payload 对象，如果解析失败返回 null
 */
export function decodeToken(token: string | null): Record<string, any> | null {
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch (error) {
    console.error('Failed to decode JWT token:', error);
    return null;
  }
}

/**
 * 获取 token 的剩余有效时间（毫秒）
 * @param token - JWT token 字符串
 * @returns 剩余时间（毫秒），如果 token 无效或已过期返回 0
 */
export function getTokenRemainingTime(token: string | null): number {
  if (!token) return 0;

  try {
    const payload = decodeToken(token);
    if (!payload || !payload.exp) return 0;

    const expirationTime = payload.exp * 1000;
    const currentTime = Date.now();
    const remaining = expirationTime - currentTime;

    return remaining > 0 ? remaining : 0;
  } catch (error) {
    return 0;
  }
}
