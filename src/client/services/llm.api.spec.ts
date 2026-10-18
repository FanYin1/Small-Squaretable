import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llmApi } from './llm.api';
import { ApiError } from './api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function stream() {
  return llmApi.streamChatCompletion(
    { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
    vi.fn(),
    vi.fn(),
    vi.fn()
  );
}

describe('llmApi.streamChatCompletion 非 2xx', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('402 + JSON 错误体：抛出带 status/code/details 的 ApiError', async () => {
    const details = { requiredTokens: 3000, availableTokens: 100, requiredPoints: 3, availablePoints: 0.1 };
    fetchMock.mockResolvedValue(
      jsonResponse(402, {
        success: false,
        error: { code: 'INSUFFICIENT_CREDITS', message: 'Insufficient credits', details },
      })
    );

    const error = await stream().catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(402);
    expect(error.code).toBe('INSUFFICIENT_CREDITS');
    expect(error.message).toBe('Insufficient credits');
    expect(error.details).toEqual(details);
  });

  it('非 JSON 错误体：退回通用错误', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));

    const error = await stream().catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error.message).toBe('LLM request failed: 502');
  });

  it('JSON 但没有 error.code：退回通用错误', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { success: false }));

    const error = await stream().catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error.message).toBe('LLM request failed: 500');
  });
});
