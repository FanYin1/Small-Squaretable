import { createHash } from 'node:crypto';
import { requireEngineeringGateway } from './engineering-model-client.mjs';
import { savePresentationReceipt, verifyReceiptDirectory } from './presentation-receipts.mjs';

export function presentationRequest(prompt, model, format, adapter, baseUrl = 'http://127.0.0.1/v1beta', apiKey = 'offline') {
  if (typeof prompt !== 'string' || Buffer.byteLength(prompt) > 20_000) throw new Error('PRESENTATION_PROMPT_LIMIT');
  const request = { model, messages: [{ role: 'user', content: prompt }], max_tokens: 512, temperature: 0, stream: false };
  const native = format === 'gemini' ? adapter.buildGeminiRequest(baseUrl, apiKey, request) : null;
  const body = native ? native.init.body : JSON.stringify(request);
  return { request, native, digest: createHash('sha256').update(body).digest('hex') };
}

export async function decodePresentationResponse(body, model, format, adapter) {
  const completion = format === 'gemini' ? await adapter.readGeminiCompletion(new Response(body), model) : JSON.parse(body);
  const usage = completion.usage;
  if (![usage?.prompt_tokens, usage?.completion_tokens, usage?.total_tokens].every(value => Number.isSafeInteger(value) && value >= 0)
    || !Number.isSafeInteger(usage.prompt_tokens + usage.completion_tokens)
    || usage.total_tokens < usage.prompt_tokens + usage.completion_tokens) throw new Error('PRESENTATION_USAGE_INVALID');
  const choice = completion.choices?.length === 1 ? completion.choices[0] : null;
  let selection = null;
  if (choice?.finish_reason === 'stop' && typeof choice.message?.content === 'string' && choice.message.content.length <= 4096) {
    const text = choice.message.content.trim();
    const fenced = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(text);
    try { selection = JSON.parse(fenced ? fenced[1] : text); } catch { selection = null; }
  }
  return { selection, tokens: usage.total_tokens };
}

export function createPresentationQueueProvider(settings, adapter) {
  const identifier = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const model = settings.CUSTOM_LLM_DEFAULT_MODEL;
  if (!identifier.test(settings.PRESENTATION_WORKER_USER_ID ?? '') || !identifier.test(settings.PRESENTATION_WORKER_TENANT_ID ?? '')
    || !model || model.length > 200 || !['gemini', 'openai'].includes(settings.CUSTOM_LLM_API_FORMAT)
    || settings.CUSTOM_LLM_API_FORMAT === 'gemini' && !adapter) throw new Error('PRESENTATION_WORKER_CONFIG_INVALID');
  async function ready() {
    if (settings.PRESENTATION_WORKER_RECEIPTS_DIR) await verifyReceiptDirectory(settings.PRESENTATION_WORKER_RECEIPTS_DIR);
    const gateway = await requireEngineeringGateway(settings);
    if (gateway.persistentRequestIds !== true) throw new Error('PRESENTATION_GATEWAY_IDEMPOTENCY_REQUIRED');
    if (gateway.batch.requests >= gateway.batch.maxRequests || gateway.batch.occupied >= gateway.batch.maxTokens) throw new Error('PRESENTATION_BATCH_EXHAUSTED');
    return gateway;
  }
  return {
    owner: { userId: settings.PRESENTATION_WORKER_USER_ID, tenantId: settings.PRESENTATION_WORKER_TENANT_ID },
    ready: async () => { await ready(); },
    select: async (prompt, dispatchId) => {
      if (!identifier.test(dispatchId)) throw new Error('PRESENTATION_DISPATCH_ID_INVALID');
      const gateway = await ready();
      const { request, native, digest } = presentationRequest(prompt, model, settings.CUSTOM_LLM_API_FORMAT, adapter,
        settings.CUSTOM_LLM_BASE_URL, settings.CUSTOM_LLM_API_KEY);
      const response = await fetch(native?.url ?? `${settings.CUSTOM_LLM_BASE_URL}/chat/completions`, {
        ...(native?.init ?? { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.CUSTOM_LLM_API_KEY}` }, body: JSON.stringify(request) }),
        headers: { ...(native?.init.headers ?? { 'content-type': 'application/json', authorization: `Bearer ${settings.CUSTOM_LLM_API_KEY}` }), 'x-engineering-request-id': dispatchId },
        redirect: 'error', signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('PRESENTATION_PROVIDER_FAILED'); }
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.length;
          if (size > 65_536) throw new Error('PRESENTATION_RESPONSE_LIMIT');
          chunks.push(Buffer.from(next.value));
        }
      } finally { await reader.cancel(); }
      const body = Buffer.concat(chunks).toString('utf8');
      if (settings.PRESENTATION_WORKER_RECEIPTS_DIR) await savePresentationReceipt(settings.PRESENTATION_WORKER_RECEIPTS_DIR, {
        version: 1, dispatchId, ledgerId: gateway.ledgerId, batchId: gateway.batch.id, format: settings.CUSTOM_LLM_API_FORMAT,
        model, requestDigest: digest, responseDigest: createHash('sha256').update(body).digest('hex'), body,
      });
      const decoded = await decodePresentationResponse(body, model, settings.CUSTOM_LLM_API_FORMAT, adapter);
      return { selection: decoded.selection, usage: { ledgerId: gateway.ledgerId, batchId: gateway.batch.id, tokens: decoded.tokens,
        responseDigest: createHash('sha256').update(body).digest('hex') } };
    },
  };
}
