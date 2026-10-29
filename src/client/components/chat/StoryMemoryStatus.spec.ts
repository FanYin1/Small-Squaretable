import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import StoryMemoryStatus from './StoryMemoryStatus.vue';
import { storyApi } from '../../services/story.api';
import type { StoryMemoryView } from '../../../types/story-memory';

vi.mock('../../stores/user', () => ({ useUserStore: () => ({ user: { id: 'owner', tenantId: 'tenant' } }) }));
vi.mock('../../services/story.api', () => ({ storyApi: { memory: vi.fn() } }));
const saved: StoryMemoryView = { supported: true, batchSize: 5, counts: { pending: 0, running: 0, retry: 1, failed: 1, succeeded: 1 }, accumulating: [], nextBefore: null,
  jobs: [{ id: '00000000-0000-4000-8000-000000000001', characterName: '<script>name</script>', status: 'succeeded', recoveryPending: false, retainedMemories: 0,
    sourcesAvailable: true, sources: [{ version: 5, inputMessageId: 10, messageId: 11 }] }] };
beforeEach(() => vi.mocked(storyApi.memory).mockReset().mockResolvedValue(saved));
const open = async () => { const wrapper = mount(StoryMemoryStatus, { props: { chatId: 'story', busy: false, version: 5 } }); await flushPromises(); return wrapper; };
describe('player memory progress', () => {
  it('separates successful processing, retained memories and uncompleted work', async () => {
    const wrapper = await open();
    expect(wrapper.text()).toContain('当前保留 0 条辅助记忆'); expect(wrapper.text()).toContain('有整理未完成');
    expect(wrapper.text()).toContain('不代表每条经历都会被记住'); expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.findAll('button').some(button => /重新生成|重试整理/.test(button.text()))).toBe(false); wrapper.unmount();
  });
  it('emits the actual input and reply IDs for reading sources', async () => {
    const wrapper = await open();
    await wrapper.find('.memory-sources button').trigger('click');
    await wrapper.findAll('.memory-sources button')[1].trigger('click');
    expect(wrapper.emitted('source')).toEqual([[10], [11]]); wrapper.unmount();
  });
  it('shows a stale lease as waiting for recovery and withholds unavailable sources', async () => {
    vi.mocked(storyApi.memory).mockResolvedValue({ ...saved, jobs: [{ ...saved.jobs[0], status: 'running', recoveryPending: true, sourcesAvailable: false, sources: [] }] });
    const wrapper = await open(); expect(wrapper.text()).toContain('等待恢复整理');
    expect(wrapper.text()).toContain('暂不可核对'); expect(wrapper.find('.memory-jobs details').exists()).toBe(false); wrapper.unmount();
  });
  it('shows legacy coverage explicitly instead of reporting all memories processed', async () => {
    vi.mocked(storyApi.memory).mockResolvedValue({ ...saved, supported: false, jobs: [] });
    const wrapper = await open(); expect(wrapper.text()).toContain('旧存档尚未接入');
    expect(wrapper.find('.memory-counts').exists()).toBe(false); wrapper.unmount();
  });
  it('refreshes a read failure without triggering story generation', async () => {
    vi.mocked(storyApi.memory).mockRejectedValueOnce(new Error('offline'));
    const wrapper = await open(); expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    await wrapper.find('header button').trigger('click'); await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false); expect(storyApi.memory).toHaveBeenCalledTimes(2); wrapper.unmount();
  });
});
