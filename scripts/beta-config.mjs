import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';

let existing = {};
try { existing = parse(await readFile('.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const source = { ...existing, ...process.env };
const values = {
  APP_URL: process.env.APP_URL || 'http://localhost:3080',
  BETA_PORT: process.env.BETA_PORT || '3080',
  BETA_DB_PASSWORD: randomBytes(32).toString('hex'),
  JWT_SECRET: randomBytes(32).toString('hex'),
  JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
  TOTP_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  PLATFORM_DAILY_TOKEN_LIMIT: process.env.PLATFORM_DAILY_TOKEN_LIMIT || '100000',
  BILLING_MODE: 'credits',
};
for (const key of ['CUSTOM_LLM_API_KEY', 'CUSTOM_LLM_BASE_URL', 'CUSTOM_LLM_API_FORMAT', 'CUSTOM_LLM_MODELS', 'CUSTOM_LLM_DEFAULT_MODEL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']) {
  if (source[key]) values[key] = source[key];
}
for (const value of Object.values(values)) {
  if (/[\r\n']/.test(value)) throw new Error('Configuration values must be single-line and cannot contain a single quote');
}
try {
  await writeFile('.env.beta', Object.entries(values).map(([key, value]) => `${key}='${value}'`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  console.info('Created .env.beta with separate database and authentication secrets. Existing custom model and SMTP settings were copied when available. Review privately before deployment.');
} catch (error) {
  if (error.code === 'EEXIST') throw new Error('.env.beta already exists; refusing to overwrite release configuration');
  throw error;
}
