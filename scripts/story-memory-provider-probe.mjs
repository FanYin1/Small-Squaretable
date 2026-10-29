import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import { requireEngineeringGateway } from './lib/engineering-model-client.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--config') throw new Error('PROBE_CONFIG_ARGUMENT_REQUIRED');
const settings = parse(await readFile(args[1]));
await requireEngineeringGateway(settings);
const apiFormat = settings.CUSTOM_LLM_API_FORMAT || 'openai';
if (!['openai', 'gemini'].includes(apiFormat)) throw new Error('PROBE_API_FORMAT_INVALID');
const model = settings.CUSTOM_LLM_DEFAULT_MODEL || settings.CUSTOM_LLM_MODELS?.split(',')[0]?.trim();
const report = { date: new Date().toISOString(), scope: 'single synthetic availability probe, not long-form memory acceptance',
  configured: Boolean(settings.CUSTOM_LLM_BASE_URL && settings.CUSTOM_LLM_API_KEY && model), apiFormat, maxOutputTokens: 32, attempts: 1 };
if (report.configured) {
  try {
    const request = { model, messages: [{ role: 'user', content: '这是合成可用性检查，请仅回复：就绪。' }], max_tokens: 32, stream: false };
    const adapter = apiFormat === 'gemini'
      ? await (await import('tsx/esm/api')).tsImport('../src/server/services/gemini-adapter.ts', import.meta.url) : null;
    const native = adapter?.buildGeminiRequest(settings.CUSTOM_LLM_BASE_URL, settings.CUSTOM_LLM_API_KEY, request);
    const response = native ? await fetch(native.url, { ...native.init, signal: AbortSignal.timeout(20000) })
      : await fetch(`${settings.CUSTOM_LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.CUSTOM_LLM_API_KEY}` },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(20000), redirect: 'error',
    });
    report.status = response.status;
    report.retryAfter = response.headers.get('retry-after');
    report.contentType = response.headers.get('content-type');
    const body = adapter ? await adapter.readGeminiCompletion(response, model) : await response.json().catch(() => null);
    report.usable = response.ok && typeof body?.choices?.[0]?.message?.content === 'string' && body.choices[0].message.content.trim().length > 0;
  } catch { report.usable = false; report.error = report.status ? 'PROVIDER_RESPONSE_UNUSABLE' : 'PROVIDER_NETWORK_OR_TIMEOUT'; }
} else report.usable = false;
console.info(JSON.stringify(report, null, 2));
