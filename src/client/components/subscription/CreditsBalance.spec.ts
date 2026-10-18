/**
 * CreditsBalance Tests (P3-1)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import CreditsBalance from './CreditsBalance.vue';
import i18n from '../../i18n';

const { mockBalance, mockLedger } = vi.hoisted(() => ({
  mockBalance: vi.fn(),
  mockLedger: vi.fn(),
}));

vi.mock('@client/services/credits.api', () => ({
  creditsApi: { getBalance: mockBalance, getLedger: mockLedger },
}));

const balance = {
  billingMode: 'credits',
  tokensPerPoint: 10000,
  balanceTokens: 62000,
  heldTokens: 0,
  availableTokens: 62000,
  balancePoints: 6.2,
  availablePoints: 6.2,
};

const ledger = {
  items: [
    { id: 'l1', kind: 'charge', tokens: -6200, points: -0.62, chatId: 'c1', messageId: 1, createdAt: '2026-10-18T00:00:00.000Z' },
    { id: 'l2', kind: 'topup', tokens: 100000, points: 10, chatId: null, messageId: null, createdAt: '2026-10-17T00:00:00.000Z' },
  ],
  pagination: { page: 1, limit: 10, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
};

function mountComponent() {
  return mount(CreditsBalance, { global: { plugins: [i18n] } });
}

describe('CreditsBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.global.locale.value = 'zh-CN';
    mockBalance.mockResolvedValue(balance);
    mockLedger.mockResolvedValue(ledger);
  });

  it('点数模式：展示可用点数、最近流水（带符号）', async () => {
    const wrapper = mountComponent();
    await flushPromises();

    expect(mockLedger).toHaveBeenCalledWith({ page: 1, limit: 10 });
    expect(wrapper.get('[data-testid="available-points"]').text()).toBe('6.2');
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('-0.62');
    expect(rows[1].text()).toContain('+10');
    expect(rows[1].text()).toContain('充值');
  });

  it('展示规则文案（中文）：不过期 / 不退还 / 运营冲正', async () => {
    const wrapper = mountComponent();
    await flushPromises();

    const text = wrapper.get('[data-testid="credits-rules"]').text();
    expect(text).toContain('点数不会过期');
    expect(text).toContain('已充值的点数不支持退款');
    expect(text).toContain('运营人员冲正');
  });

  it('展示规则文案（英文）', async () => {
    i18n.global.locale.value = 'en-US';
    const wrapper = mountComponent();
    await flushPromises();

    const text = wrapper.get('[data-testid="credits-rules"]').text();
    expect(text).toContain('Points do not expire.');
    expect(text).toContain('non-refundable');
    expect(text).toContain('operator can reverse');
  });

  it('有冻结点数时才显示冻结行', async () => {
    mockBalance.mockResolvedValue({ ...balance, heldTokens: 5000, availableTokens: 57000, availablePoints: 5.7 });
    const wrapper = mountComponent();
    await flushPromises();

    expect(wrapper.get('[data-testid="held-points"]').text()).toBe('0.5');
  });

  it('订阅模式：整块不渲染，也不请求流水', async () => {
    mockBalance.mockResolvedValue({ ...balance, billingMode: 'subscription' });
    const wrapper = mountComponent();
    await flushPromises();

    expect(wrapper.find('.credits-balance').exists()).toBe(false);
    expect(mockLedger).not.toHaveBeenCalled();
  });

  it('没有流水时显示空状态', async () => {
    mockLedger.mockResolvedValue({ ...ledger, items: [] });
    const wrapper = mountComponent();
    await flushPromises();

    expect(wrapper.find('table').exists()).toBe(false);
    expect(wrapper.text()).toContain('暂无记录');
  });

  it('加载失败显示错误提示', async () => {
    mockBalance.mockRejectedValue(new Error('boom'));
    const wrapper = mountComponent();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('加载点数余额失败');
  });
});
