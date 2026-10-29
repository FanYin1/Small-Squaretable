export function safeReturnPath(value: unknown, fallback = '/chat'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return fallback;
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return fallback; }
  if (decoded.includes('\\') || [...decoded].some(character => character.charCodeAt(0) <= 32) || decoded.startsWith('//')) return fallback;
  const pathname = decoded.split(/[?#]/)[0];
  if (!/^\/(?:chat(?:\/[\w-]+)?|market|characters\/[\w-]+|my-characters|profile|subscription|personas|worldbooks|presets)$/.test(pathname)) return fallback;
  return value;
}
