import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportApi } from './report.api';
import { api } from './api';

vi.mock('./api', () => ({
  api: {
    post: vi.fn(),
  },
}));

describe('reportApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.post).mockResolvedValue({ id: 'report-1' });
  });

  it('posts to the reports endpoint', async () => {
    await reportApi.submitReport({
      targetType: 'character',
      targetId: '11111111-1111-4111-8111-111111111111',
      category: 'pornography',
      reason: '角色描述含色情内容',
    });

    expect(api.post).toHaveBeenCalledWith('/reports', {
      targetType: 'character',
      targetId: '11111111-1111-4111-8111-111111111111',
      category: 'pornography',
      reason: '角色描述含色情内容',
    });
  });

  // category 是服务端必填字段，漏传会拿到 400；
  // 这里断言它原样进入请求体，而不是被客户端悄悄补默认值
  it('forwards the category verbatim', async () => {
    await reportApi.submitReport({
      targetType: 'comment',
      targetId: '22222222-2222-4222-8222-222222222222',
      category: 'harassment',
      reason: '人身攻击',
    });

    const body = vi.mocked(api.post).mock.calls[0][1] as Record<string, unknown>;
    expect(body.category).toBe('harassment');
  });

  it('returns the created report', async () => {
    const result = await reportApi.submitReport({
      targetType: 'user',
      targetId: '33333333-3333-4333-8333-333333333333',
      category: 'other',
      reason: '刷屏',
    });

    expect(result).toEqual({ id: 'report-1' });
  });
});
