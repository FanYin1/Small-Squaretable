import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../core/errors';
import type { ChatCompletionRequest, ChatCompletionResponse } from '../../types/llm';

const usageSchema = z.object({
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  cache_read_input_tokens: z.number().int().nonnegative().optional(),
  cache_creation_input_tokens: z.number().int().nonnegative().optional(),
});
type Usage = z.infer<typeof usageSchema>;
function usage(value: Usage) {
  if (value.input_tokens === undefined || value.output_tokens === undefined) return undefined;
  const prompt = value.input_tokens + (value.cache_read_input_tokens ?? 0) + (value.cache_creation_input_tokens ?? 0);
  return { prompt_tokens: prompt, completion_tokens: value.output_tokens, total_tokens: prompt + value.output_tokens,
    ...(value.cache_read_input_tokens === undefined ? {} : { prompt_tokens_details: { cached_tokens: value.cache_read_input_tokens } }),
    ...(value.cache_creation_input_tokens === undefined ? {} : { cache_creation_input_tokens: value.cache_creation_input_tokens }) };
}
function invalid(message: string): never { throw new AppError(message, 502, 'ANTHROPIC_RESPONSE_INVALID'); }
function finish(value: unknown): 'stop' | 'length' {
  if (value === 'end_turn' || value === 'stop_sequence') return 'stop';
  if (value === 'max_tokens') return 'length';
  return invalid('Anthropic did not complete a text turn');
}
export function buildAnthropicRequest(baseUrl: string, apiKey: string, request: ChatCompletionRequest, stream = false) {
  if ((request.n ?? 1) !== 1 || request.messages.some(message => message.role === 'function')) {
    throw new AppError('Anthropic supports one text candidate without function messages', 400, 'ANTHROPIC_REQUEST_UNSUPPORTED');
  }
  const base = baseUrl.replace(/\/+$/, '');
  const system = request.messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
  const messages = request.messages.filter(message => message.role !== 'system').map(({ role, content }) => ({ role, content }));
  if (!messages.length) throw new AppError('Conversation content is required', 400, 'ANTHROPIC_REQUEST_UNSUPPORTED');
  return { url: `${/\/v1$/.test(base) ? base : `${base}/v1`}/messages`, init: {
    method: 'POST', redirect: 'error' as const,
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: request.model, messages, stream, max_tokens: request.max_tokens ?? 2048,
      ...(system || request.response_format?.type === 'json_object' ? { system: [system,
        request.response_format?.type === 'json_object' ? 'Return only a valid JSON object.' : ''].filter(Boolean).join('\n\n') } : {}),
      ...(request.temperature === undefined ? {} : { temperature: Math.min(request.temperature, 1) }),
      // Messages API recommends selecting temperature or top_p, not both.
      ...(request.temperature !== undefined || request.top_p === undefined ? {} : { top_p: request.top_p }),
      ...(request.stop === undefined ? {} : { stop_sequences: typeof request.stop === 'string' ? [request.stop] : request.stop }),
    }),
  } };
}
async function assertResponse(response: Response) {
  if (!response.ok) throw new AppError(`Anthropic API returned HTTP ${response.status}`, response.status, 'LLM_API_ERROR');
}
export async function readAnthropicCompletion(response: Response, model: string): Promise<ChatCompletionResponse> {
  await assertResponse(response);
  const parsed = z.object({ id: z.string(), type: z.literal('message'),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
    stop_reason: z.string(), usage: usageSchema.optional() }).safeParse(await response.json().catch(() => null));
  if (!parsed.success) return invalid('Invalid Anthropic message');
  const result = parsed.data;
  const content = result.content.filter(block => block.type === 'text').map(block => block.text ?? '').join('');
  if (!content.trim()) return invalid('Anthropic returned no text');
  return { id: result.id, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finish(result.stop_reason) }],
    usage: result.usage && usage(result.usage) };
}

export function convertAnthropicStream(response: Response, model: string): Response {
  if (!response.ok) throw new AppError(`Anthropic API returned HTTP ${response.status}`, response.status, 'LLM_API_ERROR');
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) return invalid('Anthropic did not return SSE');
  const identity = { id: randomUUID(), object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model };
  const decoder = new TextDecoder(), encoder = new TextEncoder();
  let buffer = '', data: string[] = [], hasText = false, stopped = false, reason: 'stop' | 'length' | undefined;
  let counts: Usage = {};
  const textBlocks = new Set<number>();
  const emit = (controller: TransformStreamDefaultController<Uint8Array>, value: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
  const emitText = (controller: TransformStreamDefaultController<Uint8Array>, content: string) => {
    hasText ||= Boolean(content.trim());
    if (content) emit(controller, { ...identity, choices: [{ index: 0, delta: { content }, finish_reason: null }] });
  };
  const consume = (controller: TransformStreamDefaultController<Uint8Array>) => {
    if (!data.length) return;
    let event: any;
    try { event = JSON.parse(data.join('\n')); } catch { return invalid('Invalid Anthropic SSE JSON'); }
    data = [];
    if (!event || typeof event !== 'object') return invalid('Invalid Anthropic SSE event');
    if (event.type === 'ping') return;
    if (stopped) return invalid('Anthropic stream continued after completion');
    if (event.type === 'error') return invalid('Anthropic stream returned a provider error');
    if (event.type === 'message_start') {
      const parsed = usageSchema.safeParse(event.message?.usage);
      if (parsed.success) counts = { ...counts, ...parsed.data };
    } else if (event.type === 'content_block_start') {
      if (event.content_block?.type === 'text') {
        textBlocks.add(event.index);
        if (typeof event.content_block.text === 'string') emitText(controller, event.content_block.text);
      }
    } else if (event.type === 'content_block_delta') {
      if (event.delta?.type === 'text_delta' && textBlocks.has(event.index)) {
        if (typeof event.delta.text !== 'string' || reason) return invalid('Invalid Anthropic text delta');
        emitText(controller, event.delta.text);
      }
    } else if (event.type === 'message_delta') {
      reason = finish(event.delta?.stop_reason);
      const parsed = usageSchema.safeParse(event.usage);
      if (parsed.success) counts = { ...counts, ...parsed.data };
    } else if (event.type === 'message_stop') {
      if (!hasText || !reason) return invalid('Anthropic stream ended before completed text');
      stopped = true;
    }
  };
  const drain = (controller: TransformStreamDefaultController<Uint8Array>) => {
    let boundary: number;
    while ((boundary = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, boundary).replace(/\r$/, ''); buffer = buffer.slice(boundary + 1);
      if (!line) consume(controller); else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      if (data.reduce((n, line) => n + line.length, 0) > 1024 * 1024) return invalid('Anthropic event too large');
    }
    if (buffer.length > 1024 * 1024) return invalid('Anthropic event too large');
  };
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) { buffer += decoder.decode(chunk, { stream: true }); drain(controller); },
    flush(controller) {
      buffer += decoder.decode(); if (buffer) buffer += '\n'; drain(controller); consume(controller);
      if (!stopped) return invalid('Anthropic stream interrupted before message_stop');
      emit(controller, { ...identity, choices: [{ index: 0, delta: {}, finish_reason: reason }] });
      const normalized = usage(counts);
      if (normalized) emit(controller, { ...identity, choices: [], usage: normalized });
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));

    },
  }));
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}
