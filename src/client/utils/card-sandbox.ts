export function buildCardSandboxDocument(html: string, interactive = false, bootstrap = '') {
  const policy = `default-src 'none'; script-src ${interactive ? "'unsafe-inline'" : "'none'"}; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'`;
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}"><style>body{margin:12px;background:#fff;color:#20242b;font:14px/1.6 system-ui}</style>${interactive ? bootstrap : ''}${html}`;
}

export function scriptString(value: string) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function unflattenCardVariables(variables: Record<string, string>) {
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(variables)) {
    const parts = key.split('.');
    if (parts.length > 32 || parts.some(part => !part || ['__proto__', 'prototype', 'constructor'].includes(part))) continue;
    let current = result;
    for (const part of parts.slice(0, -1)) {
      if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part])) current[part] = Object.create(null);
      current = current[part] as Record<string, unknown>;
    }
    try { current[parts[parts.length - 1]] = JSON.parse(value); }
    catch { current[parts[parts.length - 1]] = value; }
  }
  return result;
}

export function flattenCardVariables(value: unknown): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  const seen = new WeakSet<object>();
  let count = 0;
  function visit(current: unknown, prefix: string, depth: number) {
    if (!current || typeof current !== 'object' || Array.isArray(current) || depth > 16 || seen.has(current)) throw new Error('INVALID_VARIABLE_OBJECT');
    seen.add(current);
    for (const [key, child] of Object.entries(current)) {
      if (++count > 512 || !key || key.length > 128 || key.split('.').some(part => !part || ['__proto__', 'constructor', 'prototype'].includes(part))) throw new Error('INVALID_VARIABLE_PATH');
      const path = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === 'object' && !Array.isArray(child)) visit(child, path, depth + 1);
      else {
        const text = typeof child === 'string' ? child : JSON.stringify(child);
        if (typeof text !== 'string' || text.length > 16384) throw new Error('INVALID_VARIABLE_VALUE');
        result[path] = text;
      }
    }
  }
  visit(value, '', 0);
  return result;
}
