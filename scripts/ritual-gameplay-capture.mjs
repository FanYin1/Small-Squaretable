import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { writePrivateJson } from './story-deletion-journal.mjs';

const database = new URL(process.env.DATABASE_URL);
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.pathname, '/squaretable_beta_test');
assert.ok(process.env.STORY_RITUAL_GAMEPLAY_CHECK === '1' || process.env.STORY_FIRST_TASK_GAMEPLAY_CHECK === '1' || process.env.STORY_OPENING_MODE_GAMEPLAY_CHECK === '1');
const directory = resolve(process.env.RITUAL_GAMEPLAY_CAPTURE_DIRECTORY);
const info = await lstat(directory);
assert.ok(info.isDirectory() && !info.isSymbolicLink() && (info.mode & 0o077) === 0);
const upstream = new URL(process.env.CUSTOM_LLM_BASE_URL);
assert.equal(upstream.hostname, '127.0.0.1');
assert.equal(upstream.protocol, 'http:');
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const response = await originalFetch(input, options);
  if (url.origin !== upstream.origin || options?.method !== 'POST' || !response.ok || !response.body) return response;
  const chunks = [];
  let size = 0;
  const capture = new TransformStream({
    transform(chunk, controller) {
      size += chunk.length;
      assert.ok(size <= 8_388_608, 'Gameplay capture exceeded response limit');
      chunks.push(Buffer.from(chunk));
      controller.enqueue(chunk);
    },
    async flush() {
      await writePrivateJson(join(directory, `${randomUUID()}.json`), {
        format: process.env.CUSTOM_LLM_API_FORMAT || 'openai',
        request: JSON.parse(options.body), response: Buffer.concat(chunks).toString('utf8'),
      });
    },
  });
  return new Response(response.body.pipeThrough(capture), { status: response.status, headers: response.headers });
};
