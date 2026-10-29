import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingService } from './embedding.service';

afterEach(() => vi.unstubAllGlobals());
const vector = Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0);

describe('durable job embedding', () => {
  it('recovers after an unavailable service without a process restart', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ embeddings: [vector] }) });
    vi.stubGlobal('fetch', fetcher);
    const service = new EmbeddingService();
    const signal = new AbortController().signal;
    await expect(service.embedBatchStrict(['约定'], signal)).rejects.toThrow('offline');
    await expect(service.embedBatchStrict(['约定'], signal)).resolves.toEqual([vector]);
    expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining('/embed/batch'), expect.objectContaining({ signal }));
  });
  it.each([[new Array(384).fill(0)], [[1]], [[...vector.slice(1), NaN]], [], null])('rejects invalid vectors %#', async embeddings => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ embeddings }) }));
    await expect(new EmbeddingService().embedBatchStrict(['约定'], new AbortController().signal)).rejects.toThrow();
  });
  it('rejects HTTP failures and skips empty requests', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetcher);
    const service = new EmbeddingService();
    await expect(service.embedBatchStrict([], new AbortController().signal)).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(service.embedBatchStrict(['约定'], new AbortController().signal)).rejects.toThrow('UNAVAILABLE');
  });
});
