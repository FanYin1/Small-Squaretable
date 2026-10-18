import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAlert, mockPush } = vi.hoisted(() => ({
  mockAlert: vi.fn(),
  mockPush: vi.fn(),
}));

vi.mock('element-plus', () => ({ ElMessageBox: { alert: mockAlert } }));
vi.mock('@client/router', () => ({ default: { push: mockPush } }));

import { showInsufficientCreditsAlert, isInsufficientCredits } from './credit-alert';

describe('showInsufficientCreditsAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAlert.mockResolvedValue('confirm');
    mockPush.mockResolvedValue(undefined);
  });

  it('有 details 时显示所需与可用点数', async () => {
    await showInsufficientCreditsAlert({ requiredPoints: 12.5, availablePoints: 3 });

    expect(mockAlert).toHaveBeenCalledTimes(1);
    const [message, title, options] = mockAlert.mock.calls[0];
    expect(message).toContain('12.5');
    expect(message).toContain('3');
    expect(message).toContain('Ask an operator to top up');
    expect(title).toBe('Not enough points');
    expect(options).toMatchObject({ type: 'warning', confirmButtonText: 'View balance' });
  });

  it('没有 details 时只显示通用文案', async () => {
    await showInsufficientCreditsAlert();

    const [message] = mockAlert.mock.calls[0];
    expect(message).toBe('You are out of points. Ask an operator to top up before continuing.');
  });

  it('details 字段缺失或类型不对时退回通用文案', async () => {
    await showInsufficientCreditsAlert({ requiredPoints: '3', availablePoints: 1 });

    const [message] = mockAlert.mock.calls[0];
    expect(message).toBe('You are out of points. Ask an operator to top up before continuing.');
  });

  it('弹窗打开期间重复调用只弹一个，关闭后可以再弹', async () => {
    let close!: () => void;
    mockAlert.mockImplementationOnce(
      () => new Promise<string>((resolve) => { close = () => resolve('confirm'); })
    );

    const first = showInsufficientCreditsAlert();
    await showInsufficientCreditsAlert();
    await showInsufficientCreditsAlert();
    expect(mockAlert).toHaveBeenCalledTimes(1);

    close();
    await first;

    await showInsufficientCreditsAlert();
    expect(mockAlert).toHaveBeenCalledTimes(2);
  });

  it('点「查看余额」跳到订阅页（命名路由）', async () => {
    await showInsufficientCreditsAlert();

    expect(mockPush).toHaveBeenCalledWith({ name: 'Subscription' });
  });

  it('关闭弹窗不跳转，也不抛错', async () => {
    mockAlert.mockRejectedValueOnce('close');

    await expect(showInsufficientCreditsAlert()).resolves.toBeUndefined();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('isInsufficientCredits', () => {
  it('按 code 识别', () => {
    expect(isInsufficientCredits({ code: 'INSUFFICIENT_CREDITS' })).toBe(true);
    expect(isInsufficientCredits({ code: 'OTHER' })).toBe(false);
    expect(isInsufficientCredits(new Error('x'))).toBe(false);
    expect(isInsufficientCredits(null)).toBe(false);
  });
});
