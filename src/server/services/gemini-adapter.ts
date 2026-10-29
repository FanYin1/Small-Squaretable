import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../core/errors';
import type { ChatCompletionRequest, ChatCompletionResponse } from '../../types/llm';

const tokenCount = z.number().int().nonnegative();
const resultSchema = z.object({
  responseId: z.string().optional(),
  error: z.unknown().optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z.array(z.object({
    index: z.number().int().nonnegative().optional(),
    content: z.object({ parts: z.array(z.object({
      text: z.string().optional(), thought: z.boolean().optional(),
    })).optional() }).optional(),
    finishReason: z.string().optional(),
  })).optional(),
  usageMetadata: z.object({
    promptTokenCount: tokenCount.optional(), candidatesTokenCount: tokenCount.optional(),
    thoughtsTokenCount: tokenCount.optional(), totalTokenCount: tokenCount.optional(),
    cachedContentTokenCount: tokenCount.optional(),
  }).optional(),
});

function readResult(value: unknown) {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success || parsed.data.error || parsed.data.promptFeedback?.blockReason) {
    throw new AppError('Gemini response is invalid or blocked', 502, 'GEMINI_RESPONSE_INVALID');
  }
  return parsed.data;
}

function finishReason(reason?: string): 'stop' | 'length' | null {
  if (!reason) return null;
  if (reason === 'STOP') return 'stop';
  if (reason === 'MAX_TOKENS') return 'length';
  throw new AppError('Gemini generation did not complete normally', 502, 'GEMINI_GENERATION_BLOCKED');
}

function readUsage(result: z.infer<typeof resultSchema>) {
  const usage = result.usageMetadata;
  if (usage?.promptTokenCount === undefined || usage.totalTokenCount === undefined) return undefined;
  return {
    prompt_tokens: usage.promptTokenCount,
    completion_tokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    total_tokens: usage.totalTokenCount,
    ...(usage.cachedContentTokenCount === undefined ? {} : {
      prompt_tokens_details: { cached_tokens: usage.cachedContentTokenCount },
    }),
  };
}

export function buildGeminiRequest(baseUrl: string, apiKey: string, request: ChatCompletionRequest, stream = false) {
  if ((request.n ?? 1) !== 1 || request.messages.some(message => message.role === 'function')) {
    throw new AppError('Gemini adapter supports one text candidate without function messages', 400, 'GEMINI_REQUEST_UNSUPPORTED');
  }
  const base = baseUrl.replace(/\/+$/, '');
  const versionedBase = /\/v1(?:beta)?$/.test(base) ? base : `${base}/v1beta`;
  const system = request.messages.filter(message => message.role === 'system');
  const contents = request.messages.filter(message => message.role !== 'system').map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }],
  }));
  if (!contents.length) throw new AppError('Gemini requires conversation content', 400, 'GEMINI_REQUEST_EMPTY');
  return {
    url: `${versionedBase}/models/${encodeURIComponent(request.model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`,
    init: {
      method: 'POST', redirect: 'error' as const,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents,
        ...(system.length ? { systemInstruction: { parts: system.map(message => ({ text: message.content })) } } : {}),
        generationConfig: {
          ...(request.response_format?.type === 'json_object' ? { responseMimeType: 'application/json' } : {}),
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
          ...(request.top_p === undefined ? {} : { topP: request.top_p }),
          ...(request.max_tokens === undefined ? {} : { maxOutputTokens: request.max_tokens }),
          ...(request.stop === undefined ? {} : { stopSequences: typeof request.stop === 'string' ? [request.stop] : request.stop }),
          ...(request.presence_penalty ? { presencePenalty: request.presence_penalty } : {}),
          ...(request.frequency_penalty ? { frequencyPenalty: request.frequency_penalty } : {}),
        },
      }),
    },
  };
}

export async function readGeminiCompletion(response: Response, model: string): Promise<ChatCompletionResponse> {
  if (!response.ok) throw new AppError(`Gemini API returned HTTP ${response.status}`, response.status, 'LLM_API_ERROR');
  const result = readResult(await response.json().catch(() => null));
  const choices = (result.candidates ?? []).map((candidate, index) => ({
    index: candidate.index ?? index,
    message: { role: 'assistant' as const, content: (candidate.content?.parts ?? [])
      .filter(part => !part.thought).map(part => part.text ?? '').join('') },
    finish_reason: finishReason(candidate.finishReason),
  }));
  if (choices.length !== 1 || !choices[0].message.content.trim() || !choices[0].finish_reason) {
    throw new AppError('Gemini returned no completed text candidate', 502, 'GEMINI_RESPONSE_INVALID');
  }
  return { id: result.responseId ?? randomUUID(), object: 'chat.completion', created: Math.floor(Date.now() / 1000),
    model, choices, usage: readUsage(result) };
}

export function convertGeminiStream(response: Response, model: string): Response {
  if (!response.ok) throw new AppError(`Gemini API returned HTTP ${response.status}`, response.status, 'LLM_API_ERROR');
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new AppError('Gemini did not return an event stream', 502, 'GEMINI_STREAM_INVALID');
  }
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const identity = { id: randomUUID(), object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model };
  let buffer = '';
  let data: string[] = [];
  let finished = false;
  let hasText = false;
  let usage: ReturnType<typeof readUsage>;
  const emit = (controller: TransformStreamDefaultController<Uint8Array>, value: unknown) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
  };
  const consume = (controller: TransformStreamDefaultController<Uint8Array>) => {
    if (!data.length) return;
    let value: unknown;
    try { value = JSON.parse(data.join('\n')); } catch {
      throw new AppError('Gemini stream contains invalid JSON', 502, 'GEMINI_STREAM_INVALID');
    }
    data = [];
    const result = readResult(value);
    usage = readUsage(result) ?? usage;
    if ((result.candidates?.length ?? 0) > 1) throw new AppError('Unexpected Gemini candidates', 502, 'GEMINI_STREAM_INVALID');
    for (const candidate of result.candidates ?? []) {
      const content = (candidate.content?.parts ?? []).filter(part => !part.thought).map(part => part.text ?? '').join('');
      const reason = finishReason(candidate.finishReason);
      if (finished && (content || reason)) throw new AppError('Gemini stream continued after completion', 502, 'GEMINI_STREAM_INVALID');
      hasText ||= Boolean(content.trim());
      finished ||= Boolean(reason);
      emit(controller, { ...identity, choices: [{ index: 0, delta: { content }, finish_reason: reason }] });
    }
  };
  const drain = (controller: TransformStreamDefaultController<Uint8Array>) => {
    let boundary: number;
    while ((boundary = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, boundary).replace(/\r$/, '');
      buffer = buffer.slice(boundary + 1);
      if (!line) consume(controller);
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (buffer.length + data.reduce((total, line) => total + line.length, 0) > 1024 * 1024) {
      throw new AppError('Gemini stream event is too large', 502, 'GEMINI_STREAM_INVALID');
    }
  };
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      drain(controller);
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer.length) buffer += '\n';
      drain(controller);
      consume(controller);
      if (!finished || !hasText) throw new AppError('Gemini stream ended before completed text', 502, 'GEMINI_STREAM_INCOMPLETE');
      if (usage) emit(controller, { ...identity, choices: [], usage });
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    },
  }));
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}
