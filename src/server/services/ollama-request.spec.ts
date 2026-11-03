import { expect, it } from 'vitest';
import { buildOllamaRequest, convertOllamaStream } from './ollama-request';

it('preserves explicit JSON and sampling settings, and rejects unsupported multiple candidates', () => {
  const request = { model: 'alias', messages: [], n: 1, stream: false, temperature: 0.2,
    top_p: 0.8, presence_penalty: 0.1, frequency_penalty: 0.3, response_format: { type: 'json_object' as const } };
  const limits = { id: 'alias', provider: 'ollama', contextWindow: 64000, maxOutputTokens: 10000, defaultTemperature: 0.7 };
  expect(buildOllamaRequest('http://localhost:11434/v1', request, limits, false).body).toMatchObject({
    format: 'json', options: { num_ctx: 64000, num_predict: 10000, temperature: 0.2, top_p: 0.8,
      presence_penalty: 0.1, frequency_penalty: 0.3 },
  });
  expect(() => buildOllamaRequest('http://localhost:11434/v1', { ...request, n: 2 }, limits, true))
    .toThrow('one completion');
});

it('normalizes fragmented native output and usage for HTTP and WebSocket consumers', async () => {
  const encoder = new TextEncoder();
  const source = new ReadableStream<Uint8Array>({ start(controller) {
    for (const text of ['{"message":{"content":"你好"},"done":false}\n{"do',
      'ne":true,"done_reason":"length","prompt_eval_count":20,"eval_count":10}']) controller.enqueue(encoder.encode(text));
    controller.close();
  } });
  const result = await convertOllamaStream(new Response(source), 'public-alias').text();
  expect(result).toContain('"delta":{"content":"你好"}');
  expect(result).toContain('"finish_reason":"length"');
  expect(result).toContain('"total_tokens":30');
  expect(result).toContain('"model":"public-alias"');
  expect(result).toContain('data: [DONE]');
});
it('does not invent a successful finish when an upstream stream closes early', async () => {
  const result = await convertOllamaStream(new Response('{"response":"partial","done":false}\n'), 'alias').text();
  expect(result).toContain('partial');
  expect(result).not.toContain('[DONE]');
  expect(result).toContain('"finish_reason":null');
});
it.each(['not-json', '{"error":"private diagnostic"}', '{"message":{"content":5}}'])('rejects invalid frames without quoting private upstream content', async frame => {
  await expect(convertOllamaStream(new Response(frame), 'alias').text()).rejects.toMatchObject({
    code: 'OLLAMA_STREAM_INVALID', message: 'Ollama returned an invalid stream',
  });
});
it('rejects text after a terminal frame', async () => {
  const source = '{"done":true}\n{"response":"late","done":false}\n';
  await expect(convertOllamaStream(new Response(source), 'alias').text()).rejects.toMatchObject({ code: 'OLLAMA_STREAM_INVALID' });
});
