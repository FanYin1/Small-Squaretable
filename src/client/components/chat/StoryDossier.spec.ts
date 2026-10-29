import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import StoryDossier from './StoryDossier.vue';
import type { StoryStateView, StoryEventView } from '../../../types/story-state';
import { storyApi } from '../../services/story.api';

vi.mock('../../services/story.api', () => ({ storyApi: { event: vi.fn(), events: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
const initial: StoryStateView = { protocol: 1, native: true, legacy: false, revision: 'fixture', version: 0, fields: [], actions: [], events: [], notes: [], map: null };
const open = (state = initial) => mount(StoryDossier, { props: { chatId: 'story', state, busy: false, error: '' }, global: { stubs: { StoryMemoryStatus: true } } });

describe('mechanism-specific dossier', () => {
  it('keeps the collapsed summary truthful while loading, generating and recovering from failure', async () => {
    const wrapper = open({ ...initial, version: 12, map: { location: 'harbor', nodes: [{ id: 'harbor', label: '雾港', links: [] }] } });
    expect(wrapper.get('.dossier-toggle-title').text()).toContain('雾港 · 第 12 轮');
    await wrapper.setProps({ busy: true });
    expect(wrapper.get('.dossier-toggle-title').text()).toContain('本轮待确认');
    expect(wrapper.get('.dossier-toggle-title').text()).not.toContain('第 12 轮');
    await wrapper.setProps({ busy: false, error: '离线' });
    expect(wrapper.get('.dossier-toggle-title').text()).toContain('读取失败');
    await wrapper.setProps({ error: '', loading: true });
    expect(wrapper.get('.dossier-toggle-title').text()).toContain('核对中');
    await wrapper.setProps({ loading: false, state: null });
    expect(wrapper.get('.dossier-toggle-title').text()).toContain('待读取');
    wrapper.unmount();
  });

  it('closes the mobile panel before reading original evidence without modifying state', async () => {
    const wrapper = mount(StoryDossier, {
      props: { chatId: 'story', state: { ...initial, version: 1, events: [{ id: 'visible', version: 1,
        status: 'confirmed', inputMessageId: 41, messageId: 42, outcome: null, createdAt: '', excerpt: '走进雾港', actionLabel: '观察' }] }, busy: false, error: '' },
      attachTo: document.body, global: { stubs: { StoryMemoryStatus: true } },
    });
    await wrapper.get('.dossier-toggle').trigger('click');
    expect(document.activeElement).toBe(wrapper.get('.dossier-close').element);
    await wrapper.findAll('nav button').find(button => button.text() === '历程')!.trigger('click');
    await wrapper.get('.story-history button').trigger('click');
    expect(wrapper.emitted('source')).toEqual([[42]]);
    expect(wrapper.get('.dossier-toggle').attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(wrapper.get('.dossier-toggle').element);
    expect(wrapper.props('state')?.version).toBe(1);
    wrapper.unmount();
  });

  it('shows only the frozen report supplied by this story and does not fabricate one for an old save', async () => {
    const wrapper = open({ ...initial, native: false, adaptationReport: { version: 1, entryRevision: 'a'.repeat(64),
      opening: { source: 'first_mes', index: 0 }, initial: 'unavailable', runtime: 'unsupported',
      findings: [{ code: 'dice-resolution', sourceDigests: ['d'.repeat(64)] }] } });
    expect(wrapper.get('[data-testid="saved-adaptation-report"]').text()).toContain('掷骰');
    expect(wrapper.get('[data-testid="saved-adaptation-report"]').text()).toContain('开局时的记录');
    await wrapper.setProps({ chatId: 'legacy', state: initial });
    expect(wrapper.find('[data-testid="saved-adaptation-report"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('keeps frozen opening funds separate from current state after later turns', () => {
    const wrapper = open({ ...initial, native: false, version: 10, openingRecord: {
      version: 1, status: 'initial-only', reason: 'recorded', adapter: 't1-yaml-money-v1',
      source: { opening: { source: 'alternate_greetings', index: 2 }, digest: 'a'.repeat(64) },
      fields: [{ id: 'opening-money', label: '金钱', value: 115784, path: ['核心角色', '主角', '金钱'] }],
    } });
    expect(wrapper.get('[data-testid="saved-opening-record"]').text()).toContain('不代表当前余额');
    expect(wrapper.get('[data-testid="saved-opening-record"]').text()).toContain('115784');
    expect(wrapper.get('[data-testid="saved-opening-record"]').text()).toContain('开场 3');
    expect(wrapper.text()).not.toContain('本卡没有定义数值规则');
    wrapper.unmount();
  });
  const event: StoryEventView = { id: 'source', version: 1, actionLabel: '买票', outcome: '已支付20枚', status: 'confirmed',
    inputMessageId: 4, messageId: 5, excerpt: '付款', createdAt: '2026-10-25T00:00:00Z' };
  const withSource = { ...initial, version: 105, fields: [{ id: 'coins', label: '钱款', value: 80, sourceEventId: 'source' }] };
  it('limits the current warning to the current round and keeps historical candidates without claiming execution', async () => {
    const proposal = { ...event, id: 'proposal', version: 2, status: 'proposed' as const, actionLabel: null, outcome: null };
    const wrapper = open({ ...initial, version: 2, events: [proposal] });
    expect(wrapper.get('.unsettled-events').text()).toContain('本轮有待核对的行动');
    await wrapper.get('.unsettled-events').trigger('click');
    expect(wrapper.get('[aria-label="游玩历程"]').text()).toContain('候选已保存，尚未执行');
    await wrapper.setProps({ state: { ...withSource, version: 3, events: [{ ...event, version: 3 }, proposal] } });
    await wrapper.findAll('nav button').find(button => button.text() === '概况')!.trigger('click');
    expect(wrapper.find('.unsettled-events').exists()).toBe(false);
    await wrapper.findAll('nav button').find(button => button.text() === '历程')!.trigger('click');
    const history = wrapper.get('[aria-label="游玩历程"]');
    expect(history.text()).toContain('当时保存的行动候选');
    expect(history.text()).not.toMatch(/尚未执行|待核对的行动|已执行/);
    expect(history.findAll('.story-history li')).toHaveLength(2);
    wrapper.unmount();
  });
  it('does not keep an old interrupted round as a current warning, or infer that an abandoned candidate ran', async () => {
    const interrupted = { ...event, status: 'interrupted' as const, version: 3 };
    const wrapper = open({ ...initial, version: 3, events: [interrupted] });
    expect(wrapper.get('.unsettled-events').text()).toContain('本轮已中断');
    await wrapper.setProps({ state: { ...initial, version: 4, events: [{ ...event, version: 4, outcome: '先询问价格' }, interrupted] } });
    expect(wrapper.find('.unsettled-events').exists()).toBe(false);
    await wrapper.findAll('nav button').find(button => button.text() === '历程')!.trigger('click');
    expect(wrapper.get('[aria-label="游玩历程"]').text()).toContain('已停止，状态未推进');
    await wrapper.setProps({ chatId: 'earlier-branch', state: { ...initial, version: 0 } });
    expect(wrapper.find('.unsettled-events').exists()).toBe(false);
    expect(wrapper.find('[aria-label="游玩历程"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('puts confirmed fields before collapsed historical records and compatibility material', async () => {
    const wrapper = open({ ...withSource, openingRecord: {
      version: 1, status: 'initial-only', reason: 'recorded', adapter: 't1-yaml-money-v1',
      source: { opening: { source: 'first_mes', index: 0 }, digest: 'a'.repeat(64) },
      fields: [{ id: 'opening-money', label: '金钱', value: 100, path: ['金钱'] }],
    } });
    const current = wrapper.get('[data-testid="current-story-state"]');
    const opening = wrapper.get<HTMLDetailsElement>('[data-testid="saved-opening-record"]');
    expect(current.text()).toContain('80');
    expect(current.text()).not.toContain('100');
    expect(current.element.compareDocumentPosition(opening.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(opening.element.open).toBe(false);
    opening.element.open = true;
    await wrapper.setProps({ chatId: 'other' });
    expect(wrapper.get<HTMLDetailsElement>('[data-testid="saved-opening-record"]').element.open).toBe(false);
    wrapper.unmount();
  });
  it('retains confirmed values while busy, refreshing and failed without asking to approve normal turns', async () => {
    const wrapper = open(withSource);
    for (const props of [{ busy: true }, { busy: false, loading: true }, { loading: false, error: 'offline' }]) {
      await wrapper.setProps(props);
      expect(wrapper.get('[data-testid="current-story-state"]').text()).toContain('80');
      expect(wrapper.get('[data-testid="state-freshness"]').text()).toContain('保留上次状态');
      expect(wrapper.findAll('button').some(button => /批准|确认本轮/.test(button.text()))).toBe(false);
    }
    await wrapper.get('[role="alert"] button').trigger('click');
    expect(wrapper.emitted('refresh')).toEqual([[]]);
    await wrapper.setProps({ state: { ...withSource, fields: [{ ...withSource.fields[0], value: 60 }] }, error: '' });
    expect(wrapper.get('[data-testid="current-story-state"]').text()).toContain('60');
    expect(wrapper.find('[data-testid="state-freshness"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('distinguishes unknown, false and zero, and does not invent a field category', () => {
    const wrapper = open({ ...initial, fields: [
      { id: 'zero', label: '作者自定义', value: 0, sourceEventId: null },
      { id: 'unknown', label: '未探明', value: null, sourceEventId: null },
      { id: 'false', label: '约定', value: false, sourceEventId: null },
    ] });
    const fields = wrapper.findAll('.current-facts dd');
    expect(fields[0].text()).toContain('0');
    expect(fields[1].text()).toContain('尚未确定');
    expect(fields[2].text()).toContain('未达成');
    expect(wrapper.text()).not.toContain('好感度');
    wrapper.unmount();
  });
  it('keeps attributed expressions separate from state and excludes pending or interrupted facts', async () => {
    const facts: NonNullable<StoryEventView['facts']> = [
      { kind: 'claim', speaker: 'player', content: '我说我有一百枚钱。' },
      { kind: 'observation', speaker: 'character', content: '窗外下起雨。' },
    ];
    const wrapper = open({ ...withSource, events: [
      { ...event, facts },
      { ...event, id: 'pending', status: 'proposed', facts: [{ kind: 'observation', speaker: 'character', content: '尚未买下船票' }] },
      { ...event, id: 'interrupted', status: 'interrupted', facts: [{ kind: 'observation', speaker: 'character', content: '中断的设想' }] },
    ] });
    const expressions = wrapper.get<HTMLDetailsElement>('[data-testid="story-narrative-facts"]');
    expect(expressions.element.open).toBe(false);
    expect(expressions.text()).toContain('主张 · 未证实 · 你的表达');
    expect(expressions.text()).not.toContain('尚未买下船票');
    expect(expressions.text()).not.toContain('中断的设想');
    expect(wrapper.get('[data-testid="current-story-state"]').text()).not.toContain('一百');
    await expressions.findAll('button')[0].trigger('click');
    await expressions.findAll('button')[1].trigger('click');
    expect(wrapper.emitted('source')).toEqual([[4], [5]]);
    await wrapper.findAll('nav button').find(button => button.text() === '历程')!.trigger('click');
    expect(wrapper.get('[aria-label="游玩历程"]').text()).toContain('当时保存的行动候选');
    wrapper.unmount();
  });
  it('does not redirect player expressions to an unrelated assistant source when the input is unavailable', () => {
    const wrapper = open({ ...initial, events: [{ ...event, inputMessageId: null, facts: [{ kind: 'claim', speaker: 'player', content: '未定位的原话' }] }] });
    expect(wrapper.get('[data-testid="story-narrative-facts"]').find('button').exists()).toBe(false);
    wrapper.unmount();
  });
  it('shows loading, unavailable, unsupported and undiscovered states without fabricated values', async () => {
    const wrapper = open();
    await wrapper.setProps({ state: null, loading: true });
    expect(wrapper.get('.state-loading').text()).toContain('正在读取');
    expect(wrapper.find('.story-facts').exists()).toBe(false);
    await wrapper.setProps({ loading: false, error: 'offline' });
    expect(wrapper.get('[data-testid="current-story-state"]').text()).toContain('暂时无法读取');
    await wrapper.setProps({ error: '', state: { ...initial, native: false } });
    expect(wrapper.get('[data-testid="current-story-state"]').text()).toContain('暂无可运行的数值规则');
    await wrapper.setProps({ state: initial });
    expect(wrapper.get('[data-testid="current-story-state"]').text()).toContain('未显示不代表数值为零');
    wrapper.unmount();
  });
  it('shows only a visible map location and resets the drawer and tab for another story', async () => {
    const wrapper = open({ ...initial, map: { location: 'hidden', nodes: [{ id: 'harbor', label: '雾港', links: [] }] } });
    expect(wrapper.find('.current-location').exists()).toBe(false);
    await wrapper.setProps({ state: { ...initial, map: { location: 'harbor', nodes: [{ id: 'harbor', label: '雾港', links: [] }] } } });
    await wrapper.get('.current-location button').trigger('click');
    expect(wrapper.get('[aria-label="已知地图"]').text()).toContain('雾港');
    await wrapper.get('.dossier-toggle').trigger('click');
    expect(wrapper.get('.dossier-toggle').attributes('aria-expanded')).toBe('true');
    await wrapper.get('.story-dossier').trigger('keydown', { key: 'Escape' });
    expect(wrapper.get('.dossier-toggle').attributes('aria-expanded')).toBe('false');
    await wrapper.get('.dossier-toggle').trigger('click');
    await wrapper.setProps({ chatId: 'next', state: initial });
    expect(wrapper.get('.dossier-toggle').attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('[aria-label="已知状态"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('retrieves an old source directly without traversing history pages', async () => {
    vi.mocked(storyApi.event).mockResolvedValue(event);
    const wrapper = open(withSource);
    await wrapper.find('.story-facts button').trigger('click');
    await flushPromises();
    expect(storyApi.event).toHaveBeenCalledWith('story', 'source');
    expect(storyApi.events).not.toHaveBeenCalled();
    expect(wrapper.find('[aria-label="所选状态依据"]').text()).toContain('已支付20枚');
    await wrapper.find('[aria-label="所选状态依据"] button').trigger('click');
    expect(wrapper.emitted('source')).toEqual([[5]]);
    wrapper.unmount();
  });
  it('shows a source failure and retries without changing state', async () => {
    vi.mocked(storyApi.event).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(event);
    const wrapper = open(withSource);
    await wrapper.find('.story-facts button').trigger('click'); await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toContain('原状态没有改变');
    await wrapper.find('[role="alert"] button').trigger('click'); await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="所选状态依据"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('discards a source response after changing stories', async () => {
    let resolve!: (value: StoryEventView) => void;
    vi.mocked(storyApi.event).mockReturnValue(new Promise(done => { resolve = done; }));
    const wrapper = open(withSource);
    await wrapper.find('.story-facts button').trigger('click');
    await wrapper.setProps({ chatId: 'other', state: initial });
    resolve(event); await flushPromises();
    expect(wrapper.find('[aria-label="所选状态依据"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('reports history errors in the history tab and resets pagination when the version advances', async () => {
    vi.mocked(storyApi.events).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([event]);
    const wrapper = open({ ...initial, version: 105, events: [{ ...event, id: 'recent', version: 105 }] });
    await wrapper.findAll('nav button').find(button => button.text() === '历程')!.trigger('click');
    await wrapper.findAll('button').find(button => button.text() === '更早的经历')!.trigger('click'); await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toContain('历程读取失败');
    await wrapper.find('[role="alert"] button').trigger('click'); await flushPromises();
    expect(wrapper.findAll('.story-history li')).toHaveLength(2);
    await wrapper.setProps({ state: { ...initial, version: 120, events: [{ ...event, id: 'latest', version: 120 }] } });
    expect(wrapper.findAll('.story-history li')).toHaveLength(1);
    expect(wrapper.findAll('button').some(button => button.text() === '更早的经历')).toBe(true);
    wrapper.unmount();
  });
  it('distinguishes refreshing and stale data from a successful read', async () => {
    const wrapper = open(withSource);
    await wrapper.setProps({ loading: true });
    expect(wrapper.find('header [role="status"]').text()).toBe('正在核对最新记录');
    await wrapper.setProps({ loading: false, error: 'offline' });
    expect(wrapper.find('header [role="status"]').text()).toContain('显示上次记录');
    wrapper.unmount();
  });
  it('does not advertise an empty map for social or ordinary narrative cards', () => {
    for (const native of [true, false]) {
      const wrapper = open({ ...initial, native });
      expect(wrapper.find('nav').text()).not.toContain('地图');
      expect(wrapper.find('.dossier-toggle').text()).not.toContain('地图');
      wrapper.unmount();
    }
  });
  it('shows known locations without travelling and leaves the map tab when support disappears', async () => {
    const wrapper = open({ ...initial, map: { location: 'harbor', nodes: [{ id: 'harbor', label: '雾港', links: [] }] } });
    await wrapper.findAll('nav button').find(button => button.text() === '地图')!.trigger('click');
    expect(wrapper.find('.story-map .here').text()).toContain('雾港');
    expect(wrapper.emitted('source')).toBeUndefined();
    await wrapper.setProps({ chatId: 'social', state: initial });
    expect(wrapper.find('[aria-label="已知地图"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="已知状态"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
