import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StoryCompatibility from './StoryCompatibility.vue';
import StoryDiagnosticsView from './StoryDiagnosticsView.vue';
import { inspectStoryDiagnostics } from '../../../types/story-diagnostics';

const getCompatibility = vi.hoisted(() => vi.fn());
vi.mock('../../services/character.api', () => ({ characterApi: { getCompatibility } }));

describe('player compatibility presentation', () => {
  beforeEach(() => { getCompatibility.mockReset(); });
  it('does not promise rule actions for a reviewed automatic counter', async () => {
    getCompatibility.mockResolvedValueOnce({ ...inspectStoryDiagnostics({}, 'card', []), adaptation: {
      jobId: 'receipt', conclusion: 'supported', reason: 'reviewed-ritual', compiler: 'finite-rules-v1',
    } });
    const wrapper = mount(StoryCompatibility, { props: { characterId: 'card' } });
    await flushPromises();
    expect(wrapper.text()).toContain('本次没有新增规则行动或地图');
    expect(wrapper.text()).toContain('不是玩家属性');
    expect(wrapper.text()).not.toContain('推荐行动和自由输入');
    wrapper.unmount();
  });
  it('reports lookup failure honestly and offers a retry', async () => {
    getCompatibility.mockRejectedValueOnce(new Error('offline'));
    const wrapper = mount(StoryCompatibility, { props: { characterId: 'card' } });
    await flushPromises();
    expect(wrapper.text()).toContain('未判定依赖齐全');
    getCompatibility.mockResolvedValueOnce(inspectStoryDiagnostics({}, 'card', []));
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('当前绑定 0 份资料');
    expect(wrapper.text()).not.toContain('未判定依赖齐全');
  });
  it('ignores a stale response when the player switches cards', async () => {
    let finish!: (value: unknown) => void;
    getCompatibility.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const wrapper = mount(StoryCompatibility, { props: { characterId: 'old' } });
    getCompatibility.mockResolvedValueOnce(inspectStoryDiagnostics({}, 'new', []));
    await wrapper.setProps({ characterId: 'new' });
    await flushPromises();
    finish(inspectStoryDiagnostics({ extensions: { squaretable: { playerIdentity: { protocol: 1, fixedName: 'Old name' } } } }, 'old', []));
    await flushPromises();
    expect(wrapper.text()).not.toContain('Old name');
    expect(wrapper.text()).toContain('作者未提供可校验');
  });
  it('explains fixed identities and multi-character limitations without exposing source text', () => {
    const report = inspectStoryDiagnostics({ extensions: { squaretable: { playerIdentity: { protocol: 1, fixedName: '<b>Alex</b>' } } } }, 'card', [], true);
    const wrapper = mount(StoryDiagnosticsView, { props: { report, frozen: true } });
    expect(wrapper.text()).toContain('本次开局时');
    expect(wrapper.text()).toContain('请选择相同称呼的人设');
    expect(wrapper.text()).toContain('不代表人物知情隔离');
    expect(wrapper.find('b').exists()).toBe(false);
  });
});
