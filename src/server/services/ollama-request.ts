import type { ChatCompletionRequest, ModelMeta } from '../../types/llm';
import { AppError } from '../../core/errors';
import { randomUUID } from 'node:crypto';

/** Native Ollama explicitly receives the same capacity in streamed and ordinary calls. */
export function buildOllamaRequest(baseUrl: string, request: ChatCompletionRequest, limits: ModelMeta,
  stream: boolean, templatePrompt?: string) {
  if (request.n !== undefined && request.n !== 1) {
    throw new AppError('Ollama supports one completion per request', 400, 'NATIVE_REQUEST_UNSUPPORTED');
  }
  return {
    url: `${baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '')}/api/${templatePrompt === undefined ? 'chat' : 'generate'}`,
    body: {
      model: request.model,
      ...(templatePrompt === undefined ? { messages: request.messages } : { prompt: templatePrompt, raw: true }),
      stream,
      ...(request.response_format?.type === 'json_object' ? { format: 'json' } : {}),
      options: {
        num_ctx: limits.contextWindow, num_predict: limits.maxOutputTokens,
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        ...(request.top_p === undefined ? {} : { top_p: request.top_p }),
        ...(request.presence_penalty === undefined ? {} : { presence_penalty: request.presence_penalty }),
        ...(request.frequency_penalty === undefined ? {} : { frequency_penalty: request.frequency_penalty }),
        ...(request.stop === undefined ? {} : { stop: Array.isArray(request.stop) ? request.stop : [request.stop] }),
      },
    },
  };
}

/** HTTP and WebSocket consumers receive the same SSE format and usage fields. */
export function convertOllamaStream(response: Response, model: string): Response {
  if (!response.ok || !response.body) return response;
  const decoder = new TextDecoder(), encoder = new TextEncoder();
  const identity = { id: randomUUID(), object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model };
  let pending = '', finished = false;
  const invalid = () => new AppError('Ollama returned an invalid stream', 502, 'OLLAMA_STREAM_INVALID');
  const consume = (line: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    if (!line.trim()) return;
    if (line.length > 1024 * 1024) throw invalid();
    let value;
    try { value = JSON.parse(line); } catch { throw invalid(); }
    if (!value || typeof value !== 'object' || value.error || finished) throw invalid();
    const content = value.message?.content ?? value.response ?? '';
    if (typeof content !== 'string') throw invalid();
    const reason = value.done === true ? (value.done_reason ?? 'stop') : null;
    if (reason !== null && (typeof reason !== 'string' || !reason)) throw invalid();
    const input = value.prompt_eval_count, output = value.eval_count;
    const usage = Number.isSafeInteger(input) && input >= 0 && Number.isSafeInteger(output) && output >= 0
      ? { prompt_tokens: input, completion_tokens: output, total_tokens: input + output } : undefined;
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...identity,
      choices: [{ index: 0, delta: { content }, finish_reason: reason }], ...(usage ? { usage } : {}) })}\n\n`));
    if (reason) { finished = true; controller.enqueue(encoder.encode('data: [DONE]\n\n')); }
  };
  const drain = (controller: TransformStreamDefaultController<Uint8Array>) => {
    let index;
    while ((index = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, index); pending = pending.slice(index + 1);
      consume(line, controller);
    }
    if (pending.length > 1024 * 1024) throw invalid();
  };
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) { pending += decoder.decode(chunk, { stream: true }); drain(controller); },
    flush(controller) {
      pending += decoder.decode(); drain(controller);
      if (pending.trim()) consume(pending, controller);
      // Never invent a completion signal when the upstream closed prematurely.
    },
  }));
  return new Response(body, { status: response.status, headers: { 'content-type': 'text/event-stream' } });
}
