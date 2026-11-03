import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import StoryCorrections from './StoryCorrections.vue';
import { storyApi } from '@client/services/story.api';
import type { StoryEventView } from '../../../types/story-state';
import type { Message } from '@client/types';

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@client/services/story.api', () => ({ storyApi: {
  readings: vi.fn().mockResolvedValue([]), events: vi.fn(), previewBranch: vi.fn(),
} }));

const history = [
  { id: '1', role: 'assistant', content: '开场' },
  { id: '2', role: 'user', content: '查看' },
  { id: '3', role: 'assistant', content: '门边有人', extra: { stateStatus: 'confirmed' } },
  { id: '4', role: 'user', content: '问话' },
  { id: '5', role: 'assistant', content: '来客回答', extra: { stateStatus: 'confirmed' } },
  { id: '6', role: 'user', content: '继续' },
  { id: '7', role: 'assistant', content: '中断', extra: { stateStatus: 'interrupted' } },
] as Message[];
const events = [
  { id: 'event3', version: 3, messageId: 7, inputMessageId: 6, status: 'interrupted', excerpt: '中断' },
  { id: 'event2', version: 2, messageId: 5, inputMessageId: 4, status: 'confirmed', excerpt: '来客回答' },
  { id: 'event1', version: 1, messageId: 3, inputMessageId: 2, status: 'confirmed', excerpt: '门边有人' },
] as StoryEventView[];

function mountPanel() {
  return mount(StoryCorrections, { props: { chatId: 'chat', ownerId: 'owner', messages: history }, global: { stubs: {
    'el-dialog': { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>' },
    'el-form': { template: '<form><slot /></form>' }, 'el-form-item': { template: '<label><slot /></label>' },
    'el-radio-group': { template: '<div><slot /></div>' }, 'el-radio-button': { template: '<span><slot /></span>' },
    'el-select': { props: ['modelValue'], template: '<div :data-value="modelValue"><slot /></div>' },
    'el-option': true, 'el-input': true,
    'el-button': { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
  } } });
}

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); setActivePinia(createPinia());
  vi.mocked(storyApi.events).mockResolvedValue(events);
});

describe('per-reply independent branch entry', () => {
  it.each([[3, 1], [5, 2], [1, 0]])('selects reply %s at its verified boundary %s', async (messageId, version) => {
    const wrapper = mountPanel();
    await wrapper.vm.openBranch(messageId);
    await flushPromises();
    expect(wrapper.get('[aria-label="分叉位置"]').attributes('data-value')).toBe(String(version));
    expect(wrapper.get('[aria-label="分支用途"]').attributes('data-value')).toBe('choice');
    expect(wrapper.get('[aria-label="原文位置"]').attributes('data-value')).toBe(String(messageId));
    const preview = wrapper.findAll('button').find(button => button.text() === '预览影响')!;
    await preview.trigger('click'); await flushPromises();
    expect(storyApi.previewBranch).toHaveBeenCalledWith('chat', expect.objectContaining({ throughVersion: version, mode: 'choice' }));
    wrapper.unmount();
  });

  it('cannot reuse a previous boundary after an interrupted reply or failed event lookup', async () => {
    const wrapper = mountPanel();
    await wrapper.vm.openBranch(3);
    await wrapper.vm.openBranch(7); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('没有可验证');
    let preview = wrapper.findAll('button').find(button => button.text() === '预览影响')!;
    expect(preview.attributes()).toHaveProperty('disabled');
    vi.mocked(storyApi.events).mockRejectedValue(new Error('网络暂不可用'));
    await wrapper.vm.openBranch(5); await flushPromises();
    preview = wrapper.findAll('button').find(button => button.text() === '预览影响')!;
    expect(preview.attributes()).toHaveProperty('disabled');
    expect(storyApi.previewBranch).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('ignores an earlier lookup that finishes after another reply was selected', async () => {
    let finishFirst!: (value: StoryEventView[]) => void;
    vi.mocked(storyApi.events).mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
    const wrapper = mountPanel();
    const first = wrapper.vm.openBranch(3);
    await wrapper.vm.openBranch(5);
    finishFirst(events); await first; await flushPromises();
    expect(wrapper.get('[aria-label="分叉位置"]').attributes('data-value')).toBe('2');
    wrapper.unmount();
  });

  it('keeps an unacknowledged branch request recoverable when another reply is clicked', async () => {
    const pending = { requestId: 'old-request', throughVersion: 1, mode: 'choice', direction: '之前的方向', evidenceIds: [] };
    sessionStorage.setItem('story-correction:owner:chat', JSON.stringify({ pending, pendingDigest: 'digest', operation: 'branch', throughVersion: 1, selectedId: 3 }));
    const wrapper = mountPanel();
    await wrapper.vm.openBranch(5); await flushPromises();
    expect(wrapper.text()).toContain('查回创建结果');
    expect(wrapper.get('[aria-label="分叉位置"]').attributes('data-value')).toBe('1');
    expect(wrapper.get('[aria-label="原文位置"]').attributes('data-value')).toBe('3');
    wrapper.unmount();
  });
});
