import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StoryAdapterPanel from './StoryAdapterPanel.vue';

const api = vi.hoisted(() => ({ getAdaptations: vi.fn(), prepareAdaptation: vi.fn(), cancelAdaptation: vi.fn() }));
vi.mock('../../services/character.api', () => ({ characterApi: api }));
const pending = { id: 'job', status: 'queued', stage: 'collect', current: true, sourceRevision: 'a'.repeat(64), attempt: 0, createdAt: '2026-10-27', result: null };
const ready = { ...pending, status: 'ready', stage: 'complete', result: { conclusion: 'supported', reason: 'compiled', fieldCount: 2, actionCount: 2, sourceCount: 1 } };

describe('source-bound adapter progress and recovery', () => {
  beforeEach(() => { vi.useFakeTimers(); Object.values(api).forEach(mock => mock.mockReset()); });
  afterEach(() => { vi.useRealTimers(); });
  it('does not advertise an obsolete supported receipt as usable for new stories', async () => {
    api.getAdaptations.mockResolvedValue([{ ...ready, current: false }]);
    const wrapper = mount(StoryAdapterPanel, { props: { characterId: 'card' } });
    await flushPromises();
    expect(wrapper.text()).toContain('规则检查要求已更新');
    expect(wrapper.text()).toContain('已有故事保留冻结规则');
    expect(wrapper.text()).not.toContain('2 项状态');
    expect(wrapper.text()).not.toContain('新故事可持续记录');
    wrapper.unmount();
  });
  it('explains gated sources without suggesting removing original restrictions', async () => {
    api.getAdaptations.mockResolvedValue([{ ...ready, result: { ...ready.result, conclusion: 'review', reason: 'conditional-source' } }]);
    const wrapper = mount(StoryAdapterPanel, { props: { characterId: 'card' } });
    await flushPromises();
    expect(wrapper.text()).toContain('不要仅为通过检查删除原有条件');
    expect(wrapper.text()).not.toContain('2 项状态');
    wrapper.unmount();
  });
  it('polls an active job, refreshes compatibility on completion and stops polling', async () => {
    api.getAdaptations.mockResolvedValueOnce([pending]).mockResolvedValueOnce([ready]);
    const wrapper = mount(StoryAdapterPanel, { props: { characterId: 'card' } });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(2000); await flushPromises();
    expect(wrapper.emitted('changed')).toHaveLength(1);
    expect(wrapper.text()).toContain('2 项状态');
    await vi.advanceTimersByTimeAsync(6000);
    expect(api.getAdaptations).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
  it('ignores a former card response and its completion notification', async () => {
    let finish!: (value: unknown) => void;
    api.getAdaptations.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce([]);
    const wrapper = mount(StoryAdapterPanel, { props: { characterId: 'old' } });
    await wrapper.setProps({ characterId: 'new' }); await flushPromises();
    finish([ready]); await flushPromises();
    expect(wrapper.text()).not.toContain('2 项状态');
    expect(wrapper.emitted('changed')).toBeUndefined();
    wrapper.unmount();
  });
  it('does not let a late poll resurrect a successfully cancelled job', async () => {
    let finish!: (value: unknown) => void;
    api.getAdaptations.mockResolvedValueOnce([pending]).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce([{ ...pending, status: 'cancelled' }]);
    api.cancelAdaptation.mockResolvedValue({});
    const wrapper = mount(StoryAdapterPanel, { props: { characterId: 'card' } });
    await flushPromises(); await vi.advanceTimersByTimeAsync(2000);
    await wrapper.get('button').trigger('click'); await flushPromises();
    finish([pending]); await flushPromises();
    expect(wrapper.text()).toContain('已取消');
    expect(wrapper.text()).not.toContain('取消检查');
    wrapper.unmount();
  });
  it('reuses the request receipt after a lost submit response and offers read retry', async () => {
    api.getAdaptations.mockResolvedValue([]);
    api.prepareAdaptation.mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce({});
    const wrapper = mount(StoryAdapterPanel, { props: { characterId: 'card' } });
    await flushPromises();
    await wrapper.get('button').trigger('click'); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('重新读取');
    await wrapper.findAll('button').find(button => button.text() === '检查这张卡')!.trigger('click'); await flushPromises();
    expect(api.prepareAdaptation.mock.calls[0][1]).toBe(api.prepareAdaptation.mock.calls[1][1]);
    wrapper.unmount();
  });
  it('shows bounded lexical clues and source locations without claiming playable mechanics', async () => {
    api.getAdaptations.mockResolvedValue([{ ...ready, result: { ...ready.result, conclusion: 'unsupported', reason: 'no-declaration',
      inspection: { version: 1, sourceRevision: ready.sourceRevision, coverage: 'complete', sourceCount: 2, characterCount: 100,
        groups: [{ kind: 'periodic', occurrences: 3, examples: [{ source: { kind: 'book', bookId: 'book-test', entryIndex: 2 },
          digest: 'f'.repeat(64), start: 4, end: 6, line: 2 }] }] } } }]);
    const wrapper = mount(StoryAdapterPanel, { props: { characterId: 'card' } });
    await flushPromises();
    const region = wrapper.get('[aria-label="规则线索与依赖核对"]');
    expect(region.element.tagName).toBe('DETAILS');
    expect(region.attributes('open')).toBeUndefined();
    expect(region.text()).toContain('文本线索不是已确认规则');
    expect(region.text()).toContain('周期与轮次线索');
    expect(region.text()).toContain('第 3 条');
    expect(region.text()).toContain('第 2 行');
    expect(region.text()).toContain('最多3份');
    expect(region.get('a').attributes('href')).toBe('/worldbooks/book-test');
    wrapper.unmount();
  });
  it.each(['stale', 'mismatch'])('hides %s diagnostics rather than presenting them as current', async kind => {
    api.getAdaptations.mockResolvedValue([{ ...ready, current: kind !== 'stale', result: { ...ready.result,
      inspection: { sourceRevision: kind === 'mismatch' ? 'b'.repeat(64) : ready.sourceRevision } } }]);
    const wrapper = mount(StoryAdapterPanel, { props: { characterId: 'card' } });
    await flushPromises();
    expect(wrapper.find('[aria-label="规则线索与依赖核对"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('hides previous clues when a refresh cannot confirm the current sources', async () => {
    api.getAdaptations.mockResolvedValueOnce([{ ...ready, result: { ...ready.result,
      inspection: { sourceRevision: ready.sourceRevision, coverage: 'complete', sourceCount: 0, characterCount: 0, groups: [] } } }])
      .mockRejectedValueOnce(new Error('offline'));
    api.prepareAdaptation.mockResolvedValue({});
    const wrapper = mount(StoryAdapterPanel, { props: { characterId: 'card' } });
    await flushPromises();
    expect(wrapper.find('[aria-label="规则线索与依赖核对"]').exists()).toBe(true);
    await wrapper.findAll('button').find(button => button.text() === '重新检查')!.trigger('click'); await flushPromises();
    expect(wrapper.find('[aria-label="规则线索与依赖核对"]').exists()).toBe(false);
    expect(wrapper.get('[role="alert"]').text()).toContain('暂时无法确认');
    wrapper.unmount();
  });
});
