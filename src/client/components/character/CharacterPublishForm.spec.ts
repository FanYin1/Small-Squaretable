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
import { collectPresentationSources, verifyPresentationSelection } from '../../../server/services/story-presentation-workflow';

const { mockApi, messageWarning, messageError, hasFeature } = vi.hoisted(() => ({
  mockApi: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
  messageWarning: vi.fn(),
  messageError: vi.fn(),
  hasFeature: vi.fn(() => true),
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
    hasFeature,
    getUpgradeMessage: () => 'upgrade',
  }),
}));

const elStubs = {
  'el-dialog': { template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue', 'title', 'width'] },
  'el-form': { name: 'PublishFormStub', template: '<form><slot /></form>', props: ['model', 'labelWidth', 'disabled'] },
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
    hasFeature.mockReturnValue(true);
    // 读不到平台开关 -> 按「不允许」处理（既有用例的前提）
    mockApi.get.mockRejectedValue(new Error('preferences unavailable'));
    mockApi.patch.mockResolvedValue({});
    mockApi.post.mockResolvedValue({});
  });

  it('allows local public-preview editing without publication entitlement and keeps writes gated', async () => {
    hasFeature.mockReturnValue(false);
    const wrapper = mountForm();
    await flushPromises();
    expect(wrapper.findComponent({ name: 'PublishFormStub' }).props('disabled')).toBe(false);
    expect(wrapper.get('[data-testid="publish-preview"]').text()).toContain('不会保存或发布');
    expect(wrapper.find('form').attributes('disabled')).toBeUndefined();
    await wrapper.vm.handlePublish();
    expect(mockApi.patch).not.toHaveBeenCalled();
    expect(mockApi.post).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('previews a sourced excerpt before explicitly saving it as the public introduction, without changing input props', async () => {
    const source = { id: '4c22c229-e092-4312-ae4f-61ca678c29b8', name: '测试角色', description: null,
      cardData: { first_mes: '你站在暮色中的港口，船长等待你的回应。' } };
    const candidates = collectPresentationSources(source);
    const draft = verifyPresentationSelection(source, candidates, { version: 1, candidateId: candidates.candidates[0].id });
    const presentation = { id: '09ae3db3-f8ab-4f8a-ac61-2f957aa514f5', draft };
    const wrapper = mountForm({ ...source, presentation });
    expect(wrapper.get('[data-testid="publish-preview"]').text()).toContain(draft.text);
    expect(wrapper.props('character').description).toBeNull();
    expect(mockApi.patch).not.toHaveBeenCalled();
    await wrapper.vm.handlePublish();
    expect(mockApi.patch).toHaveBeenCalledWith(`/characters/${source.id}`, expect.objectContaining({ description: draft.text }));
    wrapper.unmount();
  });

  it('preserves a user introduction and abandons a pending publish if the selected character changes', async () => {
    const wrapper = mountForm();
    expect(wrapper.get('[data-testid="publish-preview"]').text()).toContain(character.description);
    let finish!: (result: object) => void;
    mockApi.patch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = wrapper.vm.handlePublish();
    await wrapper.setProps({ character: { ...character, id: 'other', description: '另一张卡的介绍' } as never });
    finish({}); await pending;
    expect(mockApi.post).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="publish-preview"]').text()).toContain('另一张卡的介绍');
    expect(wrapper.emitted('success')).toBeUndefined();
    wrapper.unmount();
  });

  it('reports review submission rather than public visibility', async () => {
    const { ElMessage } = await import('element-plus');
    mockApi.post.mockResolvedValueOnce({ moderationStatus: 'pending' });
    const wrapper = mountForm();
    await wrapper.vm.handlePublish();
    expect(ElMessage.success).toHaveBeenCalledWith(i18n.global.t('characterPublish.submitted'));
    wrapper.unmount();
  });

  it('retains the saved boundary when publishing fails after PATCH', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('offline'));
    const wrapper = mountForm();
    await wrapper.vm.handlePublish();
    await flushPromises();
    expect(wrapper.emitted('success')).toBeUndefined();
    expect(wrapper.get('[data-testid="publish-state"]').text()).toBe(i18n.global.t('characterPublish.savedBeforePublish'));
    wrapper.unmount();
  });

  it('does not submit twice or close while a publish is pending', async () => {
    let finish!: (result: object) => void;
    mockApi.patch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const wrapper = mountForm();
    const pending = wrapper.vm.handlePublish();
    await wrapper.vm.handlePublish();
    wrapper.vm.handleClose();
    expect(wrapper.emitted('close')).toBeUndefined();
    finish({});
    await pending;
    expect(mockApi.patch).toHaveBeenCalledTimes(1);
    expect(mockApi.post).toHaveBeenCalledTimes(1);
    wrapper.unmount();
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

describe('CharacterPublishForm NSFW 平台开关（P2-6）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.patch.mockResolvedValue({});
    mockApi.post.mockResolvedValue({});
  });

  it('平台开启 NSFW：带 NSFW 标记的卡可以发布，标记照常提交', async () => {
    mockApi.get.mockResolvedValue({ nsfwEnabled: true, showNsfw: false, ageConfirmed: true });
    const wrapper = mountForm({ isNsfw: true });
    await flushPromises();

    await wrapper.vm.handlePublish();
    await flushPromises();

    expect(mockApi.patch).toHaveBeenCalledWith(
      '/characters/char-1',
      expect.objectContaining({ isNsfw: true }),
    );
    expect(mockApi.post).toHaveBeenCalledWith('/characters/char-1/publish');
    expect(messageWarning).not.toHaveBeenCalled();
  });

  it('平台开启 NSFW：提示文案换成「可以发布但只对打开偏好的用户展示」', async () => {
    mockApi.get.mockResolvedValue({ nsfwEnabled: true, showNsfw: false, ageConfirmed: true });
    const wrapper = mountForm({ isNsfw: true });
    await flushPromises();

    const allowed = i18n.global.t('characterPublish.nsfwAllowed') as string;
    expect(allowed).not.toBe('characterPublish.nsfwAllowed');
    expect(wrapper.text()).toContain(allowed);
  });

  it('平台关闭 NSFW：仍在本地拦住，不写任何字段', async () => {
    mockApi.get.mockResolvedValue({ nsfwEnabled: false, showNsfw: false, ageConfirmed: true });
    const wrapper = mountForm({ isNsfw: true });
    await flushPromises();

    await wrapper.vm.handlePublish();
    await flushPromises();

    expect(mockApi.patch).not.toHaveBeenCalled();
    expect(mockApi.post).not.toHaveBeenCalled();
    expect(messageWarning).toHaveBeenCalled();
  });
});
