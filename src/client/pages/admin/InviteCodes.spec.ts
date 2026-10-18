/**
 * InviteCodes Page Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import InviteCodes from './InviteCodes.vue';
import i18n from '../../i18n';

i18n.global.locale.value = 'zh-CN';

const { mockGet, mockGenerate, mockDisable, mockConfirm, mockToast } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockGenerate: vi.fn(),
  mockDisable: vi.fn(),
  mockConfirm: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@client/services/admin.api', () => ({
  adminApi: {
    getInviteCodes: mockGet,
    generateInviteCodes: mockGenerate,
    disableInviteCode: mockDisable,
  },
}));

vi.mock('@client/composables', () => ({ useToast: () => mockToast }));

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('element-plus');
  return { ...actual, ElMessageBox: { confirm: mockConfirm } };
});

const elStubs = {
  'el-button': { template: '<button><slot /></button>', props: ['icon', 'type', 'size', 'loading'] },
  'el-table': { template: '<table class="el-table"><slot /></table>', props: ['data', 'stripe'] },
  'el-table-column': { template: '<col />', props: ['prop', 'label', 'width', 'minWidth', 'fixed'] },
  'el-pagination': { template: '<div class="el-pagination" />', props: ['currentPage', 'pageSize', 'total', 'layout'] },
  'el-empty': { template: '<div class="el-empty">{{ description }}</div>', props: ['description'] },
  'el-input-number': { template: '<input class="num" />', props: ['modelValue', 'min', 'max'] },
  'el-input': { template: '<input />', props: ['modelValue', 'placeholder', 'maxlength'] },
  'el-date-picker': { template: '<input class="date" />', props: ['modelValue', 'type', 'placeholder'] },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>', props: ['label'] },
  'el-tag': { template: '<span class="el-tag"><slot /></span>', props: ['type', 'size'] },
};

const emptyPage = {
  items: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
};

function mountPage() {
  return mount(InviteCodes, {
    global: { plugins: [i18n], stubs: elStubs, directives: { loading: () => {} } },
  });
}

describe('InviteCodes Page', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockGet.mockResolvedValue(emptyPage);
    mockConfirm.mockResolvedValue('confirm');
  });

  it('进入页面就拉第一页列表，没有数据时显示空状态', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(mockGet).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(wrapper.find('.invite-codes').exists()).toBe(true);
    expect(wrapper.find('.el-empty').exists()).toBe(true);
    expect(wrapper.text()).toContain('邀请码管理');
  });

  it('生成：把数量 / 次数 / 过期时间 / 备注提交给接口，展示新码并刷新列表', async () => {
    mockGenerate.mockResolvedValue([
      { id: 'a', code: 'AAAA-2222-BBBB' },
      { id: 'b', code: 'CCCC-3333-DDDD' },
    ]);
    const wrapper = mountPage();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.form.count = 2;
    vm.form.maxUses = 5;
    vm.form.expiresAt = new Date('2030-01-01T00:00:00Z');
    vm.form.note = 'beta';
    await vm.handleGenerate();
    await flushPromises();

    expect(mockGenerate).toHaveBeenCalledWith({
      count: 2,
      maxUses: 5,
      expiresAt: '2030-01-01T00:00:00.000Z',
      note: 'beta',
    });
    expect(wrapper.text()).toContain('AAAA-2222-BBBB');
    expect(wrapper.text()).toContain('CCCC-3333-DDDD');
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('生成：没设过期时间就不传 expiresAt（永不过期）', async () => {
    mockGenerate.mockResolvedValue([]);
    const wrapper = mountPage();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.form.count = 1;
    vm.form.maxUses = 1;
    await vm.handleGenerate();

    const arg = mockGenerate.mock.calls[0][0];
    expect(arg).not.toHaveProperty('expiresAt');
    expect(arg).not.toHaveProperty('note');
  });

  it('生成失败 → 报错，不展示新码', async () => {
    mockGenerate.mockRejectedValue(new Error('boom'));
    const wrapper = mountPage();
    await flushPromises();
    const vm = wrapper.vm as any;

    await vm.handleGenerate();

    expect(mockToast.error).toHaveBeenCalled();
    expect(vm.generated).toEqual([]);
  });

  it('停用：确认后调用接口并刷新；取消则什么都不做', async () => {
    mockDisable.mockResolvedValue({});
    const wrapper = mountPage();
    await flushPromises();
    const vm = wrapper.vm as any;

    mockConfirm.mockRejectedValueOnce('cancel');
    await vm.handleDisable({ id: 'c1', code: 'AAAA' });
    expect(mockDisable).not.toHaveBeenCalled();

    await vm.handleDisable({ id: 'c1', code: 'AAAA' });
    await flushPromises();
    expect(mockDisable).toHaveBeenCalledWith('c1');
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ disabled: true, usedCount: 0, maxUses: 1, expiresAt: null }, 'disabled'],
    [{ disabled: false, usedCount: 1, maxUses: 1, expiresAt: null }, 'exhausted'],
    [{ disabled: false, usedCount: 0, maxUses: 1, expiresAt: '2000-01-01T00:00:00Z' }, 'expired'],
    [{ disabled: false, usedCount: 0, maxUses: 1, expiresAt: null }, 'active'],
  ])('状态判定 %j → %s', async (row, status) => {
    const wrapper = mountPage();
    await flushPromises();

    expect((wrapper.vm as any).statusOf(row)).toBe(status);
  });
});
