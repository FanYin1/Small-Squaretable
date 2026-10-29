import assert from 'node:assert/strict';

export function controlledMemoryResponse(input, init) {
  const request = JSON.parse(init.body);
  const text = request.contents.at(-1).parts.map(part => part.text ?? '').join('');
  const streaming = String(input).includes(':streamGenerateContent');
  let content;
  if (streaming) {
    content = '小禾看向书页。“我听着，你可以继续说。”';
  } else {
    const start = text.lastIndexOf('\n[');
    assert.ok(start >= 0, 'Controlled extraction requires serialized source pairs');
    const sources = JSON.parse(text.slice(start + 1));
    content = JSON.stringify({ version: 1,
      facts: [{ type: 'event', content: sources[0].input, sourceMessageIds: [sources[0].inputMessageId] }],
      summary: { content: sources.map(source => source.input).join('\n'),
        sourceMessageIds: sources.map(source => source.inputMessageId) } });
  }
  const body = { candidates: [{ index: 0, content: { role: 'model', parts: [{ text: content }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 100, totalTokenCount: 200 } };
  return new Response(streaming ? `data: ${JSON.stringify(body)}\n\n` : JSON.stringify(body), {
    headers: { 'Content-Type': streaming ? 'text/event-stream' : 'application/json' },
  });
}
