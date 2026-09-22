/**
 * 发布表单与 NSFW
 *
 * 服务端现在在发布时直接拒绝 isNsfw=true（标了就永远不可见，PUBLIC_VISIBLE()
 * 无条件排除它）。表单里却还有一个 NSFW 开关，文案说「将被过滤显示」——
 * 作者按这个提示操作，得到的是一个 400。
 *
 * 所以表单要在提交前就拦住，并说明原因：开着开关不给发，而不是让作者撞到
 * 服务端错误再猜发生了什么。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import CharacterPublishForm from './CharacterPublishForm.vue';
import i18n from '../../i18n';

const { mockApi, messageWarning, messageError } = vi.hoisted(() => ({
  mockApi: { patch: vi.fn(), post: vi.fn() },
  messageWarning: vi.fn(),
  messageError: vi.fn(),
}));

vi.mock('@client/services/api', () => ({ api: mockApi }));

vi.mock('element-plus', () => ({
  ElMessage: {
    warning: messageWarning,
    error: messageError,
    success: vi.fn(),
  },
}));

vi.mock('@client/composables/useFeatureGate', () => ({
  useFeatureGate: () => ({
    hasFeature: () => true,
    getUpgradeMessage: () => 'upgrade',
  }),
}));

const elStubs = {
  'el-dialog': { template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue', 'title', 'width'] },
  'el-form': { template: '<form><slot /></form>', props: ['model', 'labelWidth'] },
  'el-form-item': { template: '<div class="form-item" :data-label="label"><slot /></div>', props: ['label'] },
  'el-input': { template: '<input />', props: ['modelValue', 'placeholder', 'type', 'rows'] },
  'el-select': { template: '<select><slot /></select>', props: ['modelValue', 'placeholder', 'multiple'] },
  'el-option': { template: '<option />', props: ['label', 'value'] },
  'el-switch': { template: '<input type="checkbox" class="switch" />', props: ['modelValue'] },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>', props: ['type', 'loading', 'disabled'] },
  'el-alert': { template: '<div class="el-alert" :data-title="title"><slot /></div>', props: ['title', 'type', 'closable', 'showIcon'] },
};

const character = {
  id: 'char-1',
  name: '测试角色',
  description: '描述',
  category: 'entertainment',
  tags: ['Fantasy'],
  isNsfw: false,
};

function mountForm(overrides: Record<string, unknown> = {}) {
  return mount(CharacterPublishForm, {
    props: { character: { ...character, ...overrides } as never, visible: true },
    global: { plugins: [i18n], stubs: elStubs },
  });
}

describe('CharacterPublishForm NSFW 边界', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.patch.mockResolvedValue({});
    mockApi.post.mockResolvedValue({});
  });

  it('NSFW 开着时不提交——服务端会拒，先在本地说清楚', async () => {
    const wrapper = mountForm({ isNsfw: true });

    await wrapper.vm.handlePublish();
    await flushPromises();

    expect(mockApi.post).not.toHaveBeenCalled();
    expect(messageWarning).toHaveBeenCalled();
  });

  // 连 PATCH 都不该发：否则表单失败了，角色的 category/tags 却已经被改了
  it('被拦住时连草稿字段都不写', async () => {
    const wrapper = mountForm({ isNsfw: true });

    await wrapper.vm.handlePublish();
    await flushPromises();

    expect(mockApi.patch).not.toHaveBeenCalled();
  });

  it('关掉 NSFW 后照常发布', async () => {
    const wrapper = mountForm({ isNsfw: false });

    await wrapper.vm.handlePublish();
    await flushPromises();

    expect(mockApi.post).toHaveBeenCalledWith('/characters/char-1/publish');
  });

  // 旧文案说「将被过滤显示」，照着做只会撞 400。断言渲染出的是新 key 的真实
  // 译文（而不是写死中文），这样漏翻译时渲染的会是 key 本身、测试同样会红
  it('提示文案说明 NSFW 内容不允许发布', () => {
    const wrapper = mountForm({ isNsfw: true });
    const text = wrapper.text();
    const blocked = i18n.global.t('characterPublish.nsfwBlocked') as string;

    expect(blocked).not.toBe('characterPublish.nsfwBlocked');
    expect(text).toContain(blocked);
    // 文案不能再暗示「发了只是被过滤」——发布是直接失败的
    expect(blocked).not.toMatch(/filtered|过滤/i);
  });

  it('服务端仍然拒绝时展示服务端的说明，而不是一句泛泛的失败', async () => {
    mockApi.post.mockRejectedValue({ message: 'NSFW characters cannot be published' });
    const wrapper = mountForm({ isNsfw: false });

    await wrapper.vm.handlePublish();
    await flushPromises();

    expect(messageError).toHaveBeenCalledWith(expect.stringContaining('NSFW'));
  });
});
