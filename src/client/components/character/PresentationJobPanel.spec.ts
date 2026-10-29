import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import PresentationJobPanel from './PresentationJobPanel.vue';

const mocks = vi.hoisted(() => ({ read: vi.fn(), cancel: vi.fn(), user: { user: { id: 'owner', tenantId: 'tenant' } } }));
vi.mock('../../services/character.api', () => ({ characterApi: { getPresentationJobs: mocks.read, cancelPresentationJob: mocks.cancel } }));
vi.mock('../../stores/user', () => ({ useUserStore: () => reactive(mocks.user) }));
const job = (status = 'queued') => ({ id: 'job', status, current: true, createdAt: '2026-10-27T00:00:00Z' });

describe('presentation queue status', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); mocks.read.mockResolvedValue([job()]); });
  afterEach(() => { vi.useRealTimers(); });

  it('describes waiting without claiming a call and polls for adoption without submitting a request', async () => {
    const wrapper = mount(PresentationJobPanel, { props: { characterId: 'card' } });
    await flushPromises();
    expect(wrapper.text()).toContain('排队不代表已经调用模型');
    mocks.read.mockResolvedValue([job('complete')]);
    await vi.advanceTimersByTimeAsync(5000); await flushPromises();
    expect(wrapper.emitted('adopted')).toHaveLength(1);
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('介绍摘录已保存');
    wrapper.unmount();
  });

  it('cancels once, ignores a stale read and does not promise free cancellation', async () => {
    const wrapper = mount(PresentationJobPanel, { props: { characterId: 'card' } });
    await flushPromises();
    let resolveRead!: (value: unknown) => void;
    mocks.read.mockImplementation(() => new Promise(resolve => { resolveRead = resolve; }));
    await vi.advanceTimersByTimeAsync(5000);
    mocks.cancel.mockResolvedValue(job('cancelled'));
    await wrapper.get('button').trigger('click'); await flushPromises();
    resolveRead([job('complete')]); await flushPromises();
    expect(wrapper.text()).toContain('不因此免计用量');
    expect(wrapper.emitted('adopted')).toBeUndefined();
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('keeps unknown distinct from failure and only offers a read retry', async () => {
    mocks.read.mockRejectedValueOnce(new Error('offline'));
    const wrapper = mount(PresentationJobPanel, { props: { characterId: 'card' } });
    await flushPromises();
    expect(wrapper.text()).toContain('未触发新的模型请求');
    mocks.read.mockResolvedValue([job('unknown')]);
    await wrapper.get('button').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('已停止自动重发');
    await vi.advanceTimersByTimeAsync(15000);
    expect(mocks.read).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('discards late results after switching cards and stops polling on unmount', async () => {
    let resolveRead!: (value: unknown) => void;
    mocks.read.mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve; }));
    const wrapper = mount(PresentationJobPanel, { props: { characterId: 'previous' } });
    mocks.read.mockResolvedValue([job('skipped')]);
    await wrapper.setProps({ characterId: 'next' }); await flushPromises();
    resolveRead([job('complete')]); await flushPromises();
    expect(wrapper.text()).toContain('不会补造故事介绍');
    expect(wrapper.emitted('adopted')).toBeUndefined();
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(15000);
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
});
