/**
 * 后台内容审核页
 *
 * 除了举报队列（被动，只装被投诉过的内容），这里还要有主动的待审队列：
 * 作者发布后角色是 pending，公开发现入口只认 approved，审核员看不到
 * 就等于这批内容永久隐形。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ContentModeration from './ContentModeration.vue';
import i18n from '../../i18n';

const queuePage = {
  items: [
    {
      id: 'char-1',
      name: '待审角色甲',
      creatorId: 'user-1',
      moderationStatus: 'pending',
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    },
  ],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
};

// vi.mock 的工厂会被提升到文件顶部，普通 const 在那时还没初始化
const { mockApi, confirmMock } = vi.hoisted(() => ({
  mockApi: {
    getReports: vi.fn(),
    resolveReport: vi.fn(),
    getModerationQueue: vi.fn(),
    approveCharacter: vi.fn(),
    rejectCharacter: vi.fn(),
  },
  confirmMock: vi.fn(),
}));

vi.mock('@client/services/admin.api', () => ({ adminApi: mockApi }));

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: (...args: unknown[]) => confirmMock(...args) },
}));

const elStubs = {
  'el-radio-group': { template: '<div><slot /></div>', props: ['modelValue', 'size'] },
  'el-radio-button': { template: '<button><slot /></button>', props: ['value'] },
  'el-button': {
    template: '<button :data-type="type" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'text', 'icon'],
  },
  'el-tabs': { template: '<div><slot /></div>', props: ['modelValue'] },
  'el-tab-pane': {
    template: '<section :data-pane="name"><slot /></section>',
    props: ['name', 'label'],
  },
  'el-table': {
    template: '<table :data-rows="data.length"><slot /></table>',
    props: ['data', 'stripe', 'rowKey'],
  },
  'el-table-column': { template: '<col :data-prop="prop" />', props: ['prop', 'label', 'width', 'minWidth', 'fixed', 'type'] },
  'el-tag': { template: '<span class="el-tag"><slot /></span>', props: ['type', 'size'] },
  'el-pagination': { template: '<div class="el-pagination" />', props: ['currentPage', 'pageSize', 'total', 'layout'] },
  'el-empty': { template: '<div class="el-empty" :data-desc="description" />', props: ['description'] },
  'el-dialog': { template: '<div class="el-dialog" v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue', 'title', 'width'] },
  'el-select': { template: '<select :data-value="modelValue"><slot /></select>', props: ['modelValue', 'placeholder', 'clearable'] },
  'el-option': { template: '<option :value="value">{{ label }}</option>', props: ['value', 'label'] },
  'el-input': { template: '<textarea :data-value="modelValue" />', props: ['modelValue', 'type', 'rows', 'placeholder', 'maxlength'] },
};

function mountPage() {
  return mount(ContentModeration, {
    global: { plugins: [i18n], stubs: elStubs },
  });
}

describe('ContentModeration 待审队列', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockApi.getReports.mockResolvedValue({ reports: [], total: 0, page: 1, limit: 20 });
    mockApi.getModerationQueue.mockResolvedValue(queuePage);
    mockApi.approveCharacter.mockResolvedValue(undefined);
    mockApi.rejectCharacter.mockResolvedValue(undefined);
    confirmMock.mockResolvedValue('confirm');
  });

  it('打开页面就拉待审队列——审核员不该先点一下才知道有活', async () => {
    mountPage();
    await flushPromises();

    expect(mockApi.getModerationQueue).toHaveBeenCalledWith({
      status: 'pending',
      page: 1,
      limit: 20,
    });
  });

  // el-table 的 stub 不渲染数据行（真实组件靠作用域插槽），所以断言喂给它的
  // 数据和列绑定：有一行、且角色名这一列确实绑在 name 上
  it('待审内容进到表格里，并且展示角色名', async () => {
    const wrapper = mountPage();
    await flushPromises();

    const pane = wrapper.find('[data-pane="queue"]');
    expect(pane.exists()).toBe(true);
    expect(pane.find('table').attributes('data-rows')).toBe('1');
    const props = pane.findAll('col').map((c) => c.attributes('data-prop'));
    expect(props).toContain('name');
    expect(props).toContain('creatorId');
  });

  it('队列为空时给出明确的空态，而不是一张空表', async () => {
    mockApi.getModerationQueue.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
    });
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('.el-empty').exists()).toBe(true);
  });

  it('通过角色后重新拉队列——审完的条目要从待办里消失', async () => {
    const wrapper = mountPage();
    await flushPromises();
    mockApi.getModerationQueue.mockClear();

    await wrapper.vm.handleApprove(queuePage.items[0]);
    await flushPromises();

    expect(mockApi.approveCharacter).toHaveBeenCalledWith('char-1');
    expect(mockApi.getModerationQueue).toHaveBeenCalled();
  });

  it('取消确认框就不通过——误点不该直接上线内容', async () => {
    const wrapper = mountPage();
    await flushPromises();
    confirmMock.mockRejectedValue(new Error('cancel'));

    await wrapper.vm.handleApprove(queuePage.items[0]);
    await flushPromises();

    expect(mockApi.approveCharacter).not.toHaveBeenCalled();
  });

  it('驳回带上分类和理由——作者要能看到为什么', async () => {
    const wrapper = mountPage();
    await flushPromises();

    wrapper.vm.openReject(queuePage.items[0]);
    wrapper.vm.rejectForm.category = 'pornography';
    wrapper.vm.rejectForm.reason = '含明确性描写';
    await wrapper.vm.submitReject();
    await flushPromises();

    expect(mockApi.rejectCharacter).toHaveBeenCalledWith('char-1', {
      category: 'pornography',
      reason: '含明确性描写',
    });
  });

  it('没填理由不提交驳回——作者收到一个空理由等于没有解释', async () => {
    const wrapper = mountPage();
    await flushPromises();

    wrapper.vm.openReject(queuePage.items[0]);
    wrapper.vm.rejectForm.reason = '   ';
    await wrapper.vm.submitReject();
    await flushPromises();

    expect(mockApi.rejectCharacter).not.toHaveBeenCalled();
  });

  it('接口失败时不谎报成功', async () => {
    const { ElMessage } = await import('element-plus');
    mockApi.approveCharacter.mockRejectedValue(new Error('boom'));
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.vm.handleApprove(queuePage.items[0]);
    await flushPromises();

    expect(ElMessage.success).not.toHaveBeenCalled();
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it('举报队列仍然工作——新增队列不能挤掉原有功能', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(mockApi.getReports).toHaveBeenCalled();
    expect(wrapper.find('[data-pane="reports"]').exists()).toBe(true);
  });
});
