import { randomBytes, createHash } from 'crypto';

const API_KEY_PREFIX = 'sk_live_';

export function generateApiKey(): string {
  const random = randomBytes(16).toString('hex');
  return `${API_KEY_PREFIX}${random}`;
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function getKeyHint(key: string): string {
  return `${API_KEY_PREFIX}...${key.slice(-4)}`;
}
