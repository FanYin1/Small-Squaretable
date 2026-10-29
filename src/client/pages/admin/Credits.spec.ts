/**
 * Admin Credits Page Tests (P3-1)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import Credits from './Credits.vue';
import i18n from '../../i18n';
import { ApiError } from '@client/services/api';

i18n.global.locale.value = 'zh-CN';

const { mockLookup, mockTopUp, mockReverse, mockEntries, mockConfirm, mockToast } = vi.hoisted(() => ({
  mockLookup: vi.fn(),
  mockTopUp: vi.fn(),
  mockReverse: vi.fn(),
  mockEntries: vi.fn(),
  mockConfirm: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@client/services/admin.api', () => ({
  adminApi: {
    lookupCreditAccount: mockLookup,
    topUpCredits: mockTopUp,
    reverseCreditEntry: mockReverse,
    getCreditEntries: mockEntries,
  },
}));

vi.mock('@client/composables', () => ({ useToast: () => mockToast }));

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('element-plus');
  return { ...actual, ElMessageBox: { confirm: mockConfirm } };
});

const elStubs = {
  'el-button': { template: '<button><slot /></button>', props: ['icon', 'type', 'size', 'loading', 'disabled'] },
  'el-table': { template: '<table class="el-table"><slot /></table>', props: ['data', 'stripe'] },
  'el-table-column': { template: '<col />', props: ['prop', 'label', 'width', 'minWidth', 'fixed'] },
  'el-pagination': { template: '<div class="el-pagination" />', props: ['currentPage', 'pageSize', 'total', 'layout'] },
  'el-empty': { template: '<div class="el-empty">{{ description }}</div>', props: ['description'] },
  'el-input-number': { template: '<input class="num" />', props: ['modelValue', 'min', 'max', 'precision', 'step', 'controls'] },
  'el-input': { template: '<input />', props: ['modelValue', 'placeholder', 'maxlength'] },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>', props: ['label'] },
  'el-tag': { template: '<span class="el-tag"><slot /></span>', props: ['type', 'size'] },
};

const USER_ID = '3f2b8a52-6f0e-4a55-9a7c-0d6a1f0c9e11';
const summary = {
  tokensPerPoint: 10000,
  balanceTokens: 62000,
  heldTokens: 0,
  availableTokens: 62000,
  balancePoints: 6.2,
  availablePoints: 6.2,
};
const lookupResult = { user: { id: USER_ID, email: 'u@example.com', tenantId: 'tenant-1' }, summary };
const emptyPage = {
  items: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
};

function mountPage() {
  return mount(Credits, {
    global: { plugins: [i18n], stubs: elStubs, directives: { loading: () => {} } },
  });
}

async function mountWithAccount() {
  mockLookup.mockResolvedValue(lookupResult);
  const wrapper = mountPage();
  await flushPromises();
  const vm = wrapper.vm as any;
  vm.lookupQuery = 'u@example.com';
  await vm.handleLookup();
  await flushPromises();
  return { wrapper, vm };
}

describe('Admin Credits Page', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockEntries.mockResolvedValue(emptyPage);
    mockConfirm.mockResolvedValue('confirm');
    mockTopUp.mockResolvedValue({ entry: { id: 'e1', tenantId: 'tenant-1' }, summary, replayed: false });
    mockReverse.mockResolvedValue({ entry: { id: 'e2', tenantId: 'tenant-1' }, summary, replayed: false });
  });

  it('进入页面拉第一页运营流水，没有数据时显示空状态', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(mockEntries).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(wrapper.find('.el-empty').exists()).toBe(true);
    expect(wrapper.text()).toContain('点数充值');
  });

  it('按邮箱查询，展示余额', async () => {
    const { wrapper } = await mountWithAccount();

    expect(mockLookup).toHaveBeenCalledWith({ email: 'u@example.com' });
    expect(wrapper.text()).toContain('u@example.com');
    expect(wrapper.text()).toContain('6.2');
  });

  it('输入 uuid 时按用户 ID 查询', async () => {
    mockLookup.mockResolvedValue(lookupResult);
    const wrapper = mountPage();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.lookupQuery = `  ${USER_ID} `;
    await vm.handleLookup();

    expect(mockLookup).toHaveBeenCalledWith({ userId: USER_ID });
  });

  it('查询失败 → 报错并清掉上一个账号', async () => {
    const { vm } = await mountWithAccount();
    mockLookup.mockRejectedValue(new Error('404'));

    await vm.handleLookup();

    expect(mockToast.error).toHaveBeenCalled();
    expect(vm.account).toBeNull();
  });

  it('没有账号或金额非法时不能充值', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.topUp.points = 10;
    expect(vm.canTopUp).toBe(false);
    await vm.handleTopUp();
    expect(mockTopUp).not.toHaveBeenCalled();

    vm.account = lookupResult;
    for (const bad of [null, 0, -1, 100001]) {
      vm.topUp.points = bad;
      expect(vm.canTopUp).toBe(false);
    }
    vm.topUp.points = 0.5;
    expect(vm.canTopUp).toBe(true);
  });

  it('充值：确认后带幂等键提交，成功后换新键、清表单、刷新流水', async () => {
    const { vm } = await mountWithAccount();
    const firstKey = vm.topUp.key;
    vm.topUp.points = 10;
    vm.topUp.note = '  线下转账 ';

    await vm.handleTopUp();
    await flushPromises();

    expect(mockConfirm).toHaveBeenCalled();
    expect(mockTopUp).toHaveBeenCalledWith({
      userId: USER_ID,
      points: 10,
      idempotencyKey: firstKey,
      note: '线下转账',
    });
    expect(firstKey.length).toBeGreaterThanOrEqual(8);
    expect(vm.topUp.key).not.toBe(firstKey);
    expect(vm.topUp.points).toBeNull();
    expect(vm.topUp.note).toBe('');
    expect(mockEntries).toHaveBeenCalledTimes(2);
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('充值：取消确认则不提交', async () => {
    const { vm } = await mountWithAccount();
    vm.topUp.points = 10;
    mockConfirm.mockRejectedValueOnce('cancel');

    await vm.handleTopUp();

    expect(mockTopUp).not.toHaveBeenCalled();
  });

  it('充值失败后重试复用同一个幂等键（避免重复入账）', async () => {
    const { vm } = await mountWithAccount();
    vm.topUp.points = 10;
    mockTopUp.mockRejectedValueOnce(new Error('network'));

    await vm.handleTopUp();
    await flushPromises();
    const keyAfterFailure = vm.topUp.key;
    await vm.handleTopUp();
    await flushPromises();

    expect(mockTopUp).toHaveBeenCalledTimes(2);
    expect(mockTopUp.mock.calls[0][0].idempotencyKey).toBe(keyAfterFailure);
    expect(mockTopUp.mock.calls[1][0].idempotencyKey).toBe(keyAfterFailure);
    expect(vm.topUp.points).toBeNull();
  });

  it('重放（已入账过）给出专门提示', async () => {
    const { vm } = await mountWithAccount();
    vm.topUp.points = 10;
    mockTopUp.mockResolvedValue({ entry: { id: 'e1', tenantId: 'tenant-1' }, summary, replayed: true });

    await vm.handleTopUp();
    await flushPromises();

    expect(mockToast.success).toHaveBeenCalledWith('这笔充值已入账过，未重复充值');
  });

  it('冲正：确认后调用接口并刷新；已被用掉时按错误码提示', async () => {
    const { vm } = await mountWithAccount();
    const row = { id: 'e1', amount: 100000, tenantEmail: 'u@example.com' };

    await vm.handleReverse(row);
    await flushPromises();
    expect(mockReverse).toHaveBeenCalledWith('e1', {});
    expect(mockToast.success).toHaveBeenCalledWith('已冲正');

    mockReverse.mockRejectedValueOnce(new ApiError(409, 'CREDITS_ALREADY_SPENT', 'spent'));
    await vm.handleReverse(row);
    await flushPromises();
    expect(mockToast.error).toHaveBeenCalledWith('这笔点数已被用掉一部分，无法冲正');
  });

  it('冲正：取消确认则不调用接口', async () => {
    const { vm } = await mountWithAccount();
    mockConfirm.mockRejectedValueOnce('cancel');

    await vm.handleReverse({ id: 'e1', amount: 100000, tenantEmail: 'u@example.com' });

    expect(mockReverse).not.toHaveBeenCalled();
  });

  it('未知错误码回退到通用提示', async () => {
    const { vm } = await mountWithAccount();
    vm.topUp.points = 1;
    mockTopUp.mockRejectedValueOnce(new ApiError(500, 'WHATEVER', 'x'));

    await vm.handleTopUp();
    await flushPromises();

    expect(mockToast.error).toHaveBeenCalledWith('充值失败，请重试');
  });
});
