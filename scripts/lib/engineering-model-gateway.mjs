import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { BudgetError, requestDigest } from './engineering-model-budget.mjs';

const integer = value => Number.isSafeInteger(value) && value >= 0;
const onlyKeys = (object, keys) => object && typeof object === 'object' && !Array.isArray(object)
  && Object.keys(object).every(key => keys.includes(key));
const textParts = parts => Array.isArray(parts) && parts.length > 0 && parts.every(part => onlyKeys(part, ['text']) && typeof part.text === 'string');
const deny = code => { throw new BudgetError(code); };

function validateRequest(path, payload, settings, maxOutputTokens) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) deny('BUDGET_REQUEST_INVALID');
  const models = settings.models;
  if (settings.format === 'gemini') {
    const routes = models.flatMap(model => ['generateContent', 'streamGenerateContent'].map(method => ({
      route: `/v1beta/models/${encodeURIComponent(model)}:${method}${method === 'streamGenerateContent' ? '?alt=sse' : ''}`, model, method,
    })));
    const route = routes.find(candidate => candidate.route === path);
    if (!route || !onlyKeys(payload, ['contents', 'systemInstruction', 'generationConfig'])
      || !Array.isArray(payload.contents) || !payload.contents.length
      || !payload.contents.every(content => onlyKeys(content, ['role', 'parts']) && ['user', 'model'].includes(content.role) && textParts(content.parts))
      || payload.systemInstruction && (!onlyKeys(payload.systemInstruction, ['parts']) || !textParts(payload.systemInstruction.parts))) deny('BUDGET_REQUEST_UNSUPPORTED');
    const config = payload.generationConfig;
    if (!onlyKeys(config, ['maxOutputTokens', 'temperature', 'topP', 'stopSequences', 'presencePenalty', 'frequencyPenalty', 'responseMimeType'])
      || !integer(config.maxOutputTokens) || config.maxOutputTokens < 1 || config.maxOutputTokens > maxOutputTokens) deny('BUDGET_OUTPUT_LIMIT_REQUIRED');
    return { suffix: `/models/${encodeURIComponent(route.model)}:${route.method}${route.method === 'streamGenerateContent' ? '?alt=sse' : ''}`,
      stream: route.method === 'streamGenerateContent', output: config.maxOutputTokens };
  }
  if (path === '/v1/embeddings') {
    if (!onlyKeys(payload, ['model', 'input', 'encoding_format', 'dimensions']) || !settings.embeddingModels?.includes(payload.model)
      || !(typeof payload.input === 'string' || Array.isArray(payload.input) && payload.input.length > 0 && payload.input.every(value => typeof value === 'string'))
      || payload.encoding_format && payload.encoding_format !== 'float'
      || payload.dimensions !== undefined && (!integer(payload.dimensions) || !payload.dimensions)) deny('BUDGET_REQUEST_UNSUPPORTED');
    return { suffix: '/embeddings', stream: false, output: 0 };
  }
  if (path !== '/v1/chat/completions' || !models.includes(payload.model)
    || !onlyKeys(payload, ['model', 'messages', 'max_tokens', 'max_completion_tokens', 'stream', 'stream_options', 'temperature', 'top_p', 'stop', 'presence_penalty', 'frequency_penalty', 'response_format', 'n'])
    || payload.n !== undefined && payload.n !== 1 || payload.stream !== undefined && typeof payload.stream !== 'boolean'
    || !Array.isArray(payload.messages) || !payload.messages.length
    || !payload.messages.every(message => onlyKeys(message, ['role', 'content', 'name']) && ['system', 'user', 'assistant'].includes(message.role)
      && typeof message.content === 'string' && (message.name === undefined || typeof message.name === 'string'))
    || payload.max_tokens !== undefined && payload.max_completion_tokens !== undefined) deny('BUDGET_REQUEST_UNSUPPORTED');
  const output = payload.max_tokens ?? payload.max_completion_tokens;
  if (!integer(output) || output < 1 || output > maxOutputTokens) deny('BUDGET_OUTPUT_LIMIT_REQUIRED');
  if (payload.stream) payload.stream_options = { include_usage: true };
  return { suffix: '/chat/completions', stream: Boolean(payload.stream), output };
}

function usageFrom(payload, format) {
  const usage = format === 'gemini' ? payload?.usageMetadata : payload?.usage;
  const total = format === 'gemini' ? usage?.totalTokenCount : usage?.total_tokens;
  const prompt = format === 'gemini' ? usage?.promptTokenCount : usage?.prompt_tokens;
  const completion = format === 'gemini' ? (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0) : (usage?.completion_tokens ?? 0);
  if (!integer(total) || !integer(prompt) || !integer(completion) || !Number.isSafeInteger(prompt + completion) || total < prompt + completion) deny('BUDGET_USAGE_RECEIPT_INVALID');
  return total;
}

function responseUsage(body, stream, format) {
  if (!stream) return usageFrom(JSON.parse(body), format);
  let receipt;
  let finished = false;
  let done = false;
  for (const event of body.split(/\r?\n\r?\n/)) {
    const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) continue;
    if (done) deny('BUDGET_STREAM_TERMINAL_INVALID');
    if (data === '[DONE]') { done = true; continue; }
    const payload = JSON.parse(data);
    if (payload.error) deny('BUDGET_STREAM_PROVIDER_ERROR');
    const usage = format === 'gemini' ? payload.usageMetadata : payload.usage;
    if (usage) {
      const next = usageFrom(payload, format);
      if (receipt !== undefined && next < receipt) deny('BUDGET_USAGE_RECEIPT_INVALID');
      receipt = next;
    }
    if (format === 'gemini' ? payload.candidates?.some(candidate => typeof candidate.finishReason === 'string')
      : payload.choices?.some(choice => typeof choice.finish_reason === 'string')) finished = true;
  }
  if (receipt === undefined || !finished || format === 'openai' && !done) deny('BUDGET_STREAM_RECEIPT_MISSING');
  return receipt;
}

export async function createEngineeringGateway({ budget, batchId, settings, token, timeoutMs = 60_000, maxInputBytes = 65_536,
  maxOutputTokens = 4096, maxResponseBytes = 8_388_608 }) {
  const current = await budget.read();
  if (current.summary.halted || current.summary.pending) deny('BUDGET_RECONCILIATION_REQUIRED');
  const batch = current.ledger.batches.find(candidate => candidate.id === batchId);
  if (!batch || batch.closed) deny('BUDGET_BATCH_CLOSED');
  if (!['openai', 'gemini'].includes(settings.format) || !Array.isArray(settings.models) || !settings.models.length
    || settings.models.some(model => typeof model !== 'string' || !model.length) || typeof token !== 'string' || token.length < 24
    || typeof settings.apiKey !== 'string' || !settings.apiKey.length) deny('BUDGET_GATEWAY_CONFIG_INVALID');
  const base = new URL(settings.baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) deny('BUDGET_UPSTREAM_URL_INVALID');
  const version = settings.format === 'gemini' ? '/v1beta' : '/v1';
  let upstream = base.href.replace(/\/+$/, '');
  if (settings.format === 'gemini') upstream = upstream.replace(/\/v1(?:beta)?$/, '') + version;
  else if (!upstream.endsWith(version)) upstream += version;
  let active = false;
  const controllers = new Set();
  let stopping = false;
  const tasks = new Set();
  const respond = (response, status, code) => {
    if (response.destroyed) return;
    if (response.headersSent) { response.destroy(); return; }
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ error: { code } }));
  };
  const handle = async (request, response) => {
    let reservation;
    let claimed = false;
    let requestBytes = 0;
    let outputTokens;
    try {
      const nativeGemini = settings.format === 'gemini' && request.headers.authorization === undefined;
      const credential = nativeGemini ? request.headers['x-goog-api-key'] : request.headers.authorization;
      const supplied = Buffer.from(typeof credential === 'string' ? credential : '');
      const expected = Buffer.from(nativeGemini ? token : `Bearer ${token}`);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { respond(response, 401, 'BUDGET_GATEWAY_UNAUTHORIZED'); return; }
      if (request.method === 'GET' && request.url === '/__engineering/budget') {
        const state = await budget.read();
        const currentBatch = state.ledger.batches.find(candidate => candidate.id === batchId);
        const requests = state.ledger.requests.filter(candidate => candidate.batchId === batchId);
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ protocol: 1, persistentRequestIds: true, ledgerId: state.ledger.id, summary: state.summary,
          batch: { ...currentBatch, requests: requests.length, occupied: requests.reduce((total, candidate) => total + (candidate.actual ?? candidate.reservation), 0) } }));
        return;
      }
      if (stopping || active) { respond(response, 429, 'BUDGET_GATEWAY_BUSY'); return; }
      if (request.method !== 'POST' || !request.headers['content-type']?.startsWith('application/json')) { respond(response, 400, 'BUDGET_REQUEST_UNSUPPORTED'); return; }
      active = true; claimed = true;
      const chunks = [];
      for await (const chunk of request) {
        requestBytes += chunk.length;
        if (requestBytes > maxInputBytes) deny('BUDGET_INPUT_LIMIT');
        chunks.push(chunk);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const route = validateRequest(request.url, payload, settings, maxOutputTokens);
      outputTokens = route.output;
      const body = JSON.stringify(payload);
      const requestId = request.headers['x-engineering-request-id'];
      if (requestId !== undefined && (typeof requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId))) deny('BUDGET_REQUEST_ID_INVALID');
      const state = await budget.read();
      if (state.summary.pending || state.summary.halted) deny('BUDGET_RECONCILIATION_REQUIRED');
      reservation = await budget.reserve(batchId, Buffer.byteLength(body) + route.output + 1024, requestDigest(body), requestId);
      if (stopping) deny('BUDGET_GATEWAY_STOPPED');
      const controller = new AbortController(); controllers.add(controller);
      try {
        const result = await fetch(`${upstream}${route.suffix}`, { method: 'POST', redirect: 'error',
          headers: { 'content-type': 'application/json', ...(settings.format === 'gemini' ? { 'x-goog-api-key': settings.apiKey } : { authorization: `Bearer ${settings.apiKey}` }) },
          body, signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), controller.signal]) });
        if (!result.ok || !result.body) {
          await result.body?.cancel();
          deny('BUDGET_UPSTREAM_RESPONSE_FAILED');
        }
        const content = [];
        let received = 0;
        if (route.stream) response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
        for await (const chunk of result.body) {
          received += chunk.length;
          if (received > maxResponseBytes) { controller.abort(); deny('BUDGET_RESPONSE_LIMIT'); }
          content.push(Buffer.from(chunk));
          if (route.stream && !response.destroyed) response.write(chunk);
        }
        const raw = Buffer.concat(content).toString('utf8');
        const actual = responseUsage(raw, route.stream, settings.format);
        const summary = await budget.settle(reservation.id, actual, `sha256:${requestDigest(raw)}`);
        if (summary.halted) deny('BUDGET_USAGE_EXCEEDS_RESERVATION');
        if (!response.destroyed) {
          if (!route.stream) response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          response.end(route.stream ? undefined : raw);
        }
      } finally { controllers.delete(controller); }
    } catch (error) {
      if (reservation) {
        try { await budget.unknown(reservation.id, stopping ? 'shutdown' : error instanceof BudgetError ? 'response' : 'transport'); }
        catch { stopping = true; }
      }
      const code = error instanceof BudgetError ? error.code : 'BUDGET_GATEWAY_REQUEST_FAILED';
      if (process.env.ENGINEERING_MODEL_GATEWAY_DIAGNOSTICS === '1') {
        console.warn(JSON.stringify({ event: 'engineering-gateway-request-rejected', method: request.method,
          path: request.url, code, requestBytes, outputTokens: outputTokens ?? null, reservationCreated: Boolean(reservation) }));
      }
      respond(response, reservation ? 502 : 400, code);
    } finally { if (claimed) active = false; }
  };
  const server = createServer((request, response) => {
    const task = handle(request, response); tasks.add(task);
    void task.finally(() => tasks.delete(task));
  });
  server.requestTimeout = timeoutMs;
  server.headersTimeout = Math.min(timeoutMs, 10_000);
  return { server, async stop() {
    stopping = true;
    for (const controller of controllers) controller.abort();
    server.closeIdleConnections();
    const closed = new Promise(resolve => server.close(resolve));
    server.closeAllConnections();
    await Promise.allSettled([...tasks]);
    await closed;
  } };
}
