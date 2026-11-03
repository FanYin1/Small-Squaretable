import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ChatWindow from './ChatWindow.vue';
import type { Chat } from '@client/types';
import i18n from '../../i18n';
import { useChatStore } from '@client/stores/chat';
import { nextTick } from 'vue';
import { ledgerFixture } from '../../utils/fixtures/story-ledger';
import StoryDossier from './StoryDossier.vue';
import ScrollToBottom from './ScrollToBottom.vue';
import MessageInput from './MessageInput.vue';
import MarkdownRenderer from './MarkdownRenderer.vue';
import { useUserStore } from '@client/stores/user';
import { userPersonaApi, type UserPersona } from '@client/services/user-persona.api';
import { useCharacterIntelligenceStore } from '@client/stores/characterIntelligence';
import { storyApi } from '@client/services/story.api';
import type { StoryStateView } from '../../../types/story-state';
import { chatApi, llmApi } from '@client/services';

const streamHandlers = vi.hoisted(() => new Map<string, (data?: unknown) => void>());
vi.mock('@client/services/websocket', () => ({
  WebSocketClient: class {
    on(event: string, handler: (data?: unknown) => void) { streamHandlers.set(event, handler); }
    connect() {}
    disconnect() {}
    joinChat() {}
    leaveChat() {}
    sendMessage() {}
  },
}));

vi.mock('@client/services/user-persona.api', () => ({ userPersonaApi: { getById: vi.fn() } }));

describe('ChatWindow', () => {
  let mockChat: Chat;

  beforeEach(() => {
    vi.resetAllMocks();
    setActivePinia(createPinia());

    mockChat = {
      id: 'chat-1',
      title: 'Test Chat',
      characterId: 'char-1',
      characterName: 'Test Character',
      createdAt: new Date().toISOString(),
    };
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function mountOpening(personaId?: string, userId = 'user', tenantId = 'tenant', renderBody = false) {
    useUserStore().user = { id: userId, tenantId, email: '', name: 'Account', createdAt: '' };
    const store = useChatStore();
    store.currentChatId = mockChat.id;
    store.chatCharacters = [{
      id: 'char-1', name: 'Mara', description: '', createdAt: '',
      cardData: { first_mes: '{{char}} welcomes {{user}}.', alternate_greetings: ['{{USER}} meets {{CHAR}}.'] },
    }];
    const wrapper = mount(ChatWindow, {
      props: { currentChat: { ...mockChat, personaId } },
      global: { plugins: [i18n], stubs: {
        StoryWorkspaceDrawer: { props: ['open'], template: '<div v-if="open"><slot /></div>' },
        MessageInput: true, MarkdownRenderer: !renderBody, MessageBubble: renderBody
          ? { props: ['message', 'readingContent'], template: '<div class="test-message"><div class="markdown-content">{{ readingContent ?? message.content }}</div><slot name="after-content" /></div>' }
          : { template: '<div class="test-message"><slot name="after-content" /></div>' }, StoryDossier: true, StoryMemoryStatus: true, IntelligenceDebugPanel: true,
        'el-button': { template: '<button><slot /></button>' },
        'el-dropdown': { template: '<div class="test-dropdown"><slot /><slot name="dropdown" /></div>' },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { props: ['command'], template: '<div :data-command="command"><slot /></div>' },
      } },
    });
    return { wrapper, store };
  }

  it('folds only completed ledgers, opens the exact historical snapshot and leaves source messages untouched', async () => {
    mockChat.contentSnapshotVersion = 1;
    vi.spyOn(storyApi, 'state').mockResolvedValue({ protocol: 1, native: false, legacy: false, version: 2,
      revision: null, fields: [], actions: [], map: null, events: [], notes: [] });
    const { wrapper, store } = mountOpening(undefined, 'user', 'tenant', true);
    const first = '原有正文。\n' + ledgerFixture;
    const latest = ledgerFixture.replace('200文', '250文');
    store.messages = [
      { id: '10', chatId: mockChat.id, role: 'user', content: '看账簿', createdAt: '' },
      { id: '11', chatId: mockChat.id, role: 'assistant', content: first, createdAt: '', extra: { stateStatus: 'confirmed', storyVersion: 1 } },
      { id: '12', chatId: mockChat.id, role: 'assistant', content: latest, createdAt: '', extra: { stateStatus: 'confirmed', storyVersion: 2 } },
      { id: '13', chatId: mockChat.id, role: 'assistant', content: ledgerFixture, createdAt: '', extra: { stateStatus: 'interrupted' } },
      { id: '14', chatId: mockChat.id, role: 'assistant', content: ledgerFixture, createdAt: '' },
    ];
    await flushPromises();
    expect(wrapper.findAll('.story-ledger-summary')).toHaveLength(2);
    expect(wrapper.get('[data-message-id="11"] .markdown-content').text()).toBe('原有正文。');
    expect(wrapper.get('[data-message-id="13"] .markdown-content').text()).toContain('config:');
    expect(wrapper.get('[data-message-id="14"] .markdown-content').text()).toContain('config:');
    await wrapper.get('[data-message-id="11"] .story-ledger-summary button').trigger('click');
    expect(wrapper.getComponent(StoryDossier).props('ledger')).toMatchObject({ messageId: '11', version: 1, opening: false });
    expect(wrapper.getComponent(StoryDossier).props('initialTab')).toBe('ledger');
    expect(store.messages[1].content).toBe(first);
    store.sending = true; await nextTick();
    expect(wrapper.getComponent(StoryDossier).props('ledger').ledger.summary).toContain('现金 200文');
    await wrapper.setProps({ currentChat: { ...mockChat, id: 'other' } });
    expect(wrapper.getComponent(StoryDossier).props('open')).toBe(false);
    wrapper.unmount();
  });

  async function mountStream() {
    mockChat.contentSnapshotVersion = 1;
    vi.spyOn(storyApi, 'state').mockResolvedValue({ protocol: 1, legacy: false, native: false, version: 0, revision: null,
      fields: [], actions: [], map: null, events: [], notes: [] });
    vi.spyOn(llmApi, 'getModels').mockResolvedValue([]);
    vi.spyOn(chatApi, 'getMessages').mockResolvedValue({ messages: [], hasMore: false });
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const mounted = mountOpening(undefined, 'user', 'tenant', true);
    const { wrapper, store } = mounted;
    store.chats = [mockChat];
    store.messages = [{ id: '1', chatId: mockChat.id, role: 'assistant', content: '已保存开场', createdAt: '' }];
    store.initWebSocket('token');
    store.wsConnected = true;
    await flushPromises();
    const send = async () => {
      wrapper.getComponent(MessageInput).vm.$emit('send', '私密用户输入');
      await flushPromises();
      return store.messages.at(-1)!.id;
    };
    const requestId = await send();
    const chunk = (text: string, request = requestId, chatId = mockChat.id) => {
      streamHandlers.get('assistantMessageChunk')!({ chatId, requestId: request, chunk: text, provisional: true });
    };
    const frame = async (at: number) => {
      now = at;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(at);
      await nextTick();
      await flushPromises();
    };
    const metrics = () => log.mock.calls.filter(call => call[1] === 'reply_performance').map(call => call[2] as Record<string, unknown>);
    return { ...mounted, requestId, chunk, frame, frames, metrics, send, setNow: (at: number) => { now = at; } };
  }

  it('renders the first provisional chunk, disables actions, then replaces it with the invalid final body', async () => {
    const { wrapper, store, requestId, chunk, frame } = await mountStream();
    chunk('未校验的正文');
    await nextTick();
    expect(wrapper.get('.streaming-status').text()).toBe('生成中 · 尚未确认');
    expect(wrapper.find('.streaming .story-branch-entry').exists()).toBe(false);
    expect(wrapper.find('.streaming .story-next-actions').exists()).toBe(false);
    expect(wrapper.findAll('.story-branch-entry').every(button => button.attributes('disabled') !== undefined)).toBe(true);
    expect(wrapper.findAll('.story-next-actions button').every(button => button.attributes('disabled') !== undefined)).toBe(true);
    await frame(120);
    expect(wrapper.get('.streaming .markdown-content').text()).toBe('未校验的正文');
    streamHandlers.get('assistantMessageChunk')!({ chatId: mockChat.id, requestId, chunk: '', provisional: true, phase: 'control' });
    await nextTick();
    expect(wrapper.get('.streaming-status').text()).toBe('正文已接收 · 正在整理本轮行动与推荐');
    expect(wrapper.find('.streaming .typing-cursor').exists()).toBe(false);
    expect(store.sending).toBe(true);
    streamHandlers.get('assistantMessageChunk')!({ chatId: mockChat.id, requestId, chunk: '', provisional: true, phase: 'validating' });
    await nextTick();
    expect(wrapper.get('.streaming-status').text()).toBe('回复已接收 · 正在校验并保存');
    streamHandlers.get('assistantMessageDone')!({ chatId: mockChat.id, requestId, messageId: '102',
      content: '校验未通过，本轮未推进。', storyIntentInvalid: true, stateStatus: 'invalid' });
    streamHandlers.get('generationFinished')!({ chatId: mockChat.id, requestId, status: 'completed' });
    await flushPromises();
    expect(wrapper.get('.streaming').isVisible()).toBe(false);
    await frame(140);
    expect(wrapper.find('.streaming-status').exists()).toBe(false);
    expect(wrapper.get('[data-message-id="102"] .markdown-content').text()).toBe('校验未通过，本轮未推进。');
    expect(wrapper.text()).not.toContain('未校验的正文');
    expect(store.messages.at(-1)?.extra?.storyIntentInvalid).toBe(true);
    expect(store.sending).toBe(false);
    wrapper.unmount();
  });

  it('logs a presentation approximation only after real Markdown DOM and a further frame, ignoring blank and stale chunks', async () => {
    const { wrapper, store, chunk, frame, metrics, setNow } = await mountStream();
    chunk(''); chunk(' \n'); chunk('别的请求', 'old'); chunk('别的故事', undefined, 'other-story');
    await nextTick();
    expect(metrics()).toEqual([]);
    setNow(150);
    chunk('第一个**正文**片段');
    await nextTick();
    expect(metrics()).toEqual([expect.objectContaining({ phase: 'first_body_chunk', sendToFirstBodyChunkMs: 50 })]);
    expect(wrapper.get('.streaming .markdown-content').text()).toBe('');
    await frame(160);
    expect(wrapper.get('.streaming .markdown-content').text()).toBe('第一个正文片段');
    expect(metrics()).toHaveLength(1);
    await frame(180);
    expect(metrics()[1]).toEqual({ phase: 'presentation_approx', attempt: store.replyTiming!.attempt, selection: 0,
      atMs: 180, sendToFirstBodyChunkMs: 50, firstBodyChunkToPresentationApproxMs: 30, sendToPresentationApproxMs: 80 });
    await frame(200);
    expect(metrics()).toHaveLength(2);
    expect(JSON.stringify(metrics())).not.toMatch(/正文|私密|chat-1|temp-/);
    wrapper.unmount();
  });

  it('measures saved DOM when chunk, authoritative done and finish arrive in the same tick', async () => {
    const { wrapper, requestId, chunk, frame, metrics } = await mountStream();
    chunk('临时正文');
    streamHandlers.get('assistantMessageDone')!({ chatId: mockChat.id, requestId, messageId: '102', content: '权威正文' });
    streamHandlers.get('generationFinished')!({ chatId: mockChat.id, requestId, status: 'completed' });
    await nextTick();
    await frame(130);
    await frame(150);
    expect(wrapper.get('[data-message-id="102"] .markdown-content').text()).toBe('权威正文');
    expect(metrics().map(metric => metric.phase)).toEqual(['first_body_chunk', 'presentation_approx']);
    wrapper.unmount();
  });

  it('waits for text DOM when an initial nonblank chunk renders no visible body', async () => {
    const { wrapper, chunk, frame, metrics } = await mountStream();
    chunk('<!-- pending -->');
    await nextTick();
    await frame(120);
    await frame(140);
    expect(wrapper.get('.streaming .markdown-content').text()).toBe('');
    expect(metrics()).toHaveLength(1);
    chunk('实际正文');
    await nextTick();
    await frame(160);
    await frame(180);
    await frame(200);
    expect(wrapper.get('.streaming .markdown-content').text()).toBe('实际正文');
    expect(metrics().map(metric => metric.phase)).toEqual(['first_body_chunk', 'presentation_approx']);
    wrapper.unmount();
  });

  it.each(['failure', 'disconnect', 'switch', 'retry', 'unmount', 'hidden'])('ignores stale presentation callbacks after %s', async mode => {
    const { wrapper, store, requestId, chunk, frame, frames, metrics } = await mountStream();
    chunk('首段正文');
    await nextTick();
    await frame(120);
    const staleCallbacks = [...frames.values()];
    expect(staleCallbacks.length).toBeGreaterThan(0);
    if (mode === 'failure' || mode === 'retry') {
      streamHandlers.get('generationFinished')!({ chatId: mockChat.id, requestId, status: 'failed', retryable: mode === 'retry' });
      if (mode === 'retry') {
        await store.retryLastGeneration();
        chunk('重试正文');
      }
    } else if (mode === 'disconnect') streamHandlers.get('disconnected')!();
    else if (mode === 'switch') {
      await store.setCurrentChat(null);
      store.currentChatId = mockChat.id;
    } else if (mode === 'unmount') wrapper.unmount();
    else vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await nextTick();
    // Invoke callbacks even if the browser cancellation already removed them.
    for (const callback of staleCallbacks) callback(150);
    await flushPromises();
    expect(metrics().filter(metric => metric.phase === 'presentation_approx')).toEqual([]);
    if (mode !== 'unmount') wrapper.unmount();
  });

  it('previews the chosen identity literally and saves the selected raw opening for server expansion', async () => {
    vi.mocked(userPersonaApi.getById).mockResolvedValue({ name: '$& {{char}}' } as UserPersona);
    const { wrapper, store } = mountOpening('persona');
    await flushPromises();
    expect(wrapper.getComponent(MarkdownRenderer).props('content')).toBe('Mara welcomes $& {{char}}.');
    await wrapper.get('.greeting-swipe .swipe-btn:last-child').trigger('click');
    expect(wrapper.getComponent(MarkdownRenderer).props('content')).toBe('$& {{char}} meets Mara.');
    const persist = vi.spyOn(store, 'addGreetingMessage').mockResolvedValue(undefined);
    const send = vi.spyOn(store, 'sendMessage').mockResolvedValue(undefined);
    wrapper.getComponent(MessageInput).vm.$emit('send', 'I enter');
    await flushPromises();
    expect(persist).toHaveBeenCalledWith('chat-1', '{{USER}} meets {{CHAR}}.');
    expect(send).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('shows a short invitation and compact buttons without an extra heading', async () => {
    mockChat.contentSnapshotVersion = 1;
    const stateView: StoryStateView = { protocol: 1, legacy: false, native: false, version: 0, revision: null,
      fields: [], actions: [], map: null, events: [], notes: [] };
    const state = vi.spyOn(storyApi, 'state').mockResolvedValue(stateView);
    const { wrapper, store } = mountOpening();
    await flushPromises();
    expect(wrapper.find('.story-action-heading').exists()).toBe(false);
    expect(wrapper.get('.opening-suggestions .story-recommendations-lead').text()).toContain('也可以直接输入自己的想法');
    expect(wrapper.get('.greeting-container .message-content .story-next-actions').exists()).toBe(true);
    expect(wrapper.findAll('.opening-suggestions button')).toHaveLength(3);
    const persist = vi.spyOn(store, 'addGreetingMessage').mockResolvedValue(undefined);
    const send = vi.spyOn(store, 'sendMessage').mockResolvedValue(undefined);
    await wrapper.get('.opening-suggestions button').trigger('click');
    await flushPromises();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toContain('观察当前');
    expect(send.mock.calls[0][5]).toBeUndefined();
    stateView.actions = [{ id: 'authored', label: '原卡行动', intent: 'observe', version: 0 }];
    store.billingRevision++;
    await flushPromises();
    expect(wrapper.find('.opening-suggestions').exists()).toBe(true);
    expect(wrapper.get('.story-actions').text()).toContain('原卡行动');
    store.messages = [
      { id: 'u3', chatId: mockChat.id, role: 'user', content: '继续', createdAt: '' },
      { id: 'a3', chatId: mockChat.id, role: 'assistant', content: '发生了新变化。', createdAt: '',
        extra: { storyRecommendationsLead: '新变化值得留意，也可以选择自己的行动。', storyRecommendations: [
          { label: '查看变化', input: '我查看刚才的变化' },
          { label: '询问原因', input: '我询问变化发生的原因' },
          { label: '观察周围', input: '我继续观察周围' },
        ] } },
    ];
    state.mockRejectedValue(new Error('state unavailable'));
    store.billingRevision++;
    await flushPromises();
    expect(wrapper.get('[data-message-id="a3"] .turn-recommendations').text()).toContain('查看变化');
    expect(wrapper.get('[data-message-id="a3"] .story-recommendations-lead').text()).toBe('新变化值得留意，也可以选择自己的行动。');
    expect(wrapper.findAll('.story-next-actions')).toHaveLength(1);
    wrapper.unmount();
  });

  it('keeps story management and deletion available in the header without opening reading settings', () => {
    const { wrapper } = mountOpening();

    expect(wrapper.get('.reading-settings-trigger').attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.chat-header [data-command="delete"]').text()).toContain(i18n.global.t('chat.deleteTitle'));

    wrapper.unmount();
  });

  it('saves the selected opening before opening its branch without requesting a model reply', async () => {
    mockChat.contentSnapshotVersion = 1;
    vi.spyOn(storyApi, 'readings').mockResolvedValue([]);
    vi.spyOn(storyApi, 'events').mockResolvedValue([]);
    const { wrapper, store } = mountOpening();
    const send = vi.spyOn(store, 'sendMessage').mockResolvedValue(undefined);
    const persist = vi.spyOn(store, 'addGreetingMessage').mockImplementation(async () => {
      store.messages.push({ id: '1', chatId: mockChat.id, role: 'assistant', content: '已保存开局', createdAt: '' });
    });
    await flushPromises();
    await wrapper.get('[aria-label="从当前开局建立分支剧情"]').trigger('click');
    await flushPromises();
    expect(persist).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    expect(storyApi.events).toHaveBeenCalledWith(mockChat.id, undefined);
    expect(JSON.parse(sessionStorage.getItem(`story-correction:user:${mockChat.id}`)!)).toMatchObject({ selectedId: 1, operation: 'branch', throughVersion: 0 });
    wrapper.unmount();
  });

  it('puts a compact branch entry below every assistant reply and removes routine action review', async () => {
    mockChat.contentSnapshotVersion = 1;
    vi.spyOn(storyApi, 'state').mockRejectedValue(new Error('unavailable'));
    vi.spyOn(storyApi, 'events').mockResolvedValue([]);
    const { wrapper, store } = mountOpening();
    store.messages = [
      { id: '1', chatId: mockChat.id, role: 'assistant', content: '开场', createdAt: '' },
      { id: '2', chatId: mockChat.id, role: 'user', content: '探索', createdAt: '' },
      { id: '3', chatId: mockChat.id, role: 'assistant', content: '门边有人', createdAt: '', extra: { stateStatus: 'confirmed' } },
      { id: '4', chatId: mockChat.id, role: 'assistant', content: '旧提案', createdAt: '', extra: {
        stateStatus: 'proposed', storyIntent: { intent: { version: 1, disposition: 'proposal', steps: [], facts: [] }, input: '探索', expectedVersion: 1 },
      } },
    ];
    await flushPromises();
    expect(wrapper.findAll('.story-branch-entry')).toHaveLength(3);
    expect(wrapper.find('[data-message-id="2"] .story-branch-entry').exists()).toBe(false);
    expect(wrapper.find('story-intent-review').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('确认后，故事才会继续');
    expect(wrapper.get('[data-message-id="4"] .story-branch-entry').attributes()).toHaveProperty('disabled');
    await wrapper.get('[data-message-id="3"] .story-branch-entry').trigger('click');
    await flushPromises();
    expect(storyApi.events).toHaveBeenCalledWith(mockChat.id, undefined);
    expect(JSON.parse(sessionStorage.getItem(`story-correction:user:${mockChat.id}`)!)).toMatchObject({ selectedId: 3, operation: 'branch' });
    store.sending = true; await nextTick();
    expect(wrapper.findAll('.story-branch-entry').every(button => button.attributes('disabled') !== undefined)).toBe(true);
    wrapper.unmount();
  });

  it('keeps starter suggestions available when state reads fail or version is unchanged', async () => {
    mockChat.contentSnapshotVersion = 1;
    const state = vi.spyOn(storyApi, 'state').mockRejectedValue(new Error('unavailable'));
    const { wrapper, store } = mountOpening();
    await flushPromises();
    expect(wrapper.findAll('.opening-suggestions button')).toHaveLength(3);
    state.mockResolvedValue({ protocol: 1, legacy: false, native: false, version: 1, revision: null,
      fields: [], actions: [], map: null, events: [], notes: [] });
    store.billingRevision++;
    await flushPromises();
    expect(wrapper.findAll('.opening-suggestions button')).toHaveLength(3);
    wrapper.unmount();
  });

  it('keeps the last completed reply recommendations available after a failed next turn', async () => {
    mockChat.contentSnapshotVersion = 1;
    vi.spyOn(storyApi, 'state').mockRejectedValue(new Error('overview rate limited'));
    const { wrapper, store } = mountOpening();
    store.messages = [
      { id: 'a1', chatId: mockChat.id, role: 'assistant', content: '桌上留有一道新鲜刮痕。', createdAt: '',
        extra: { storyRecommendations: [
          { label: '查看刮痕', input: '我仔细检查这道刮痕' },
          { label: '询问来客', input: '我询问来客是否见过刮痕' },
          { label: '观察房间', input: '我先观察房间里的其他变化' },
        ] } },
      { id: 'u2', chatId: mockChat.id, role: 'user', content: '我检查刮痕', createdAt: '' },
    ];
    await flushPromises();
    expect(wrapper.get('.turn-recommendations').text()).toContain('查看刮痕');
    const recommendation = wrapper.get('.turn-recommendations button');
    expect((recommendation.element as HTMLButtonElement).disabled).toBe(false);
    const send = vi.spyOn(store, 'sendMessage').mockResolvedValue(undefined);
    await recommendation.trigger('click');
    await flushPromises();
    expect(send.mock.calls.at(-1)?.[0]).toBe('我仔细检查这道刮痕');
    wrapper.unmount();
  });

  it('shows the latest completed turn recommendations, replaces them on the next turn, and sends them as free input', async () => {
    mockChat.contentSnapshotVersion = 1;
    vi.spyOn(storyApi, 'state').mockResolvedValue({ protocol: 1, legacy: false, native: false, version: 1, revision: null,
      fields: [], actions: [], map: null, events: [], notes: [] });
    const { wrapper, store } = mountOpening();
    store.messages = [
      { id: 'u1', chatId: mockChat.id, role: 'user', content: '查看桌面', createdAt: '' },
      { id: 'a1', chatId: mockChat.id, role: 'assistant', content: '桌上留有一道新鮮刮痕。', createdAt: '',
        extra: { storyRecommendations: [
          { label: '查看刮痕', input: '我仔细检查这道刮痕' },
          { label: '询问来客', input: '我询问来客是否见过刮痕' },
          { label: '观察房间', input: '我先观察房间里的其他变化' },
        ] } },
    ];
    await flushPromises();
    expect(wrapper.get('.turn-recommendations').text()).toContain('查看刮痕');
    expect(wrapper.get('.story-recommendations-lead').text()).toContain('也可以直接输入自己的想法');
    const send = vi.spyOn(store, 'sendMessage').mockResolvedValue(undefined);
    await wrapper.get('.turn-recommendations button').trigger('click');
    await flushPromises();
    expect(send.mock.calls.at(-1)?.[0]).toBe('我仔细检查这道刮痕');
    expect(send.mock.calls.at(-1)?.[5]).toBeUndefined();
    store.messages = [
      ...store.messages,
      { id: 'u2', chatId: mockChat.id, role: 'user', content: '我检查刮痕', createdAt: '' },
      { id: 'a2', chatId: mockChat.id, role: 'assistant', content: '灰尘下露出刻痕。', createdAt: '',
        extra: { storyRecommendationsLead: '灰尘下的刻痕提供了新的观察方向。', storyRecommendations: [
          { label: '辨认刻痕', input: '我试着辨认刻痕' },
          { label: '寻找工具', input: '我看看附近有没有合适的工具' },
          { label: '暂缓判断', input: '我先记下刻痕的位置' },
        ] } },
    ];
    await flushPromises();
    expect(wrapper.get('.turn-recommendations').text()).toContain('辨认刻痕');
    expect(wrapper.get('.story-recommendations-lead').text()).toBe('灰尘下的刻痕提供了新的观察方向。');
    expect(wrapper.get('.turn-recommendations').text()).not.toContain('查看刮痕');
    wrapper.unmount();
  });

  it('keeps opening navigation at the beginning and never exposes preview control payloads', async () => {
    const { wrapper, store } = mountOpening();
    await flushPromises();
    store.chatCharacters[0].cardData!.alternate_greetings = ['<VariableInsert>{"secret":42}</VariableInsert><content>“你来了！”</content>'];
    const container = wrapper.get('.chat-messages').element as HTMLElement;
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 2800 });
    container.scrollTop = 1600;
    await nextTick();
    expect(wrapper.text()).not.toContain('"secret":42');
    expect(wrapper.text()).not.toContain('content“');
    expect(wrapper.text()).toContain('“你来了！”');
    await wrapper.get('.greeting-swipe .swipe-btn:last-child').trigger('click');
    await flushPromises();
    expect(container.scrollTop).toBe(0);
    const selected = wrapper.getComponent(MarkdownRenderer).props('content');
    await wrapper.setProps({ currentChat: { ...mockChat, title: 'Renamed story' } });
    await flushPromises();
    expect(wrapper.getComponent(MarkdownRenderer).props('content')).toBe(selected);
    wrapper.unmount();
  });

  it('uses story memory for versioned stories and preserves legacy memory loading for old chats', async () => {
    const intelligence = useCharacterIntelligenceStore();
    const memories = vi.spyOn(intelligence, 'fetchMemories').mockResolvedValue();
    const emotion = vi.spyOn(intelligence, 'fetchEmotion').mockResolvedValue();
    mockChat.contentSnapshotVersion = 1;
    const { wrapper } = mountOpening();
    await flushPromises();
    expect(memories).not.toHaveBeenCalled();
    expect(emotion).not.toHaveBeenCalled();
    expect(wrapper.find('.reading-emotion').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'MemoryPanel' }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'StoryMemoryStatus' }).exists()).toBe(false);
    (wrapper.vm as unknown as { openIntelligenceTab: (tab: string) => void }).openIntelligenceTab('memory');
    await flushPromises();
    expect(wrapper.findComponent({ name: 'StoryMemoryStatus' }).exists()).toBe(true);
    await wrapper.setProps({ currentChat: { ...mockChat, id: 'legacy-story', contentSnapshotVersion: undefined } });
    await flushPromises();
    expect(memories).toHaveBeenCalledExactlyOnceWith('char-1', 'legacy-story');
    expect(emotion).toHaveBeenCalledExactlyOnceWith('char-1', 'legacy-story');
    await wrapper.get('.reading-settings-trigger').trigger('click');
    expect(wrapper.find('.reading-emotion').exists()).toBe(true);
    wrapper.unmount();
  });

  it('mounts legacy debug only when requested and tears it down when switching to a versioned story', async () => {
    const { wrapper } = mountOpening();
    await flushPromises();
    const window = wrapper.vm as unknown as { openIntelligenceTab: (tab: string) => void; showIntelligenceDrawer: boolean; activeIntelligenceTab: string };
    window.openIntelligenceTab('memory');
    await flushPromises();
    expect(wrapper.findComponent({ name: 'IntelligenceDebugPanel' }).exists()).toBe(false);
    window.openIntelligenceTab('debug');
    await flushPromises();
    expect(wrapper.findComponent({ name: 'IntelligenceDebugPanel' }).exists()).toBe(true);
    await wrapper.setProps({ currentChat: { ...mockChat, id: 'versioned-story', contentSnapshotVersion: 1 } });
    await flushPromises();
    expect(window.showIntelligenceDrawer).toBe(false);
    window.openIntelligenceTab('debug');
    await flushPromises();
    expect(window.activeIntelligenceTab).toBe('memory');
    expect(wrapper.findComponent({ name: 'IntelligenceDebugPanel' }).exists()).toBe(false);
    wrapper.unmount();
  });

  it('returns oversized input to the editor without sending or replacing an existing draft', async () => {
    const { wrapper, store } = mountOpening();
    await flushPromises();
    const fill = vi.fn();
    const input = wrapper.getComponent(MessageInput);
    Object.assign(input.vm, { fillAction: fill });
    const send = vi.spyOn(store, 'sendMessage').mockResolvedValue();
    store.error = i18n.global.t('chat.contextBudgetInput');
    store.contextRecovery = { chatId: mockChat.id, requestId: 'failed', content: '取回的文字' };
    await nextTick();
    expect(wrapper.get('[role="alert"].generation-error').text()).toContain(i18n.global.t('chat.contextBudgetInput'));
    await wrapper.get('.context-recover-input').trigger('click');
    expect(fill).toHaveBeenCalledWith('取回的文字');
    expect(send).not.toHaveBeenCalled();
    expect(store.contextRecovery).toBeNull();
    wrapper.unmount();
  });

  it('does not show another story recovery action and disables recovery during generation', async () => {
    const { wrapper, store } = mountOpening();
    await flushPromises();
    store.error = i18n.global.t('chat.contextBudgetInput');
    store.contextRecovery = { chatId: 'other-story', requestId: 'failed', content: 'private text' };
    await nextTick();
    expect(wrapper.find('.context-recover-input').exists()).toBe(false);
    store.contextRecovery = { chatId: mockChat.id, requestId: 'failed', content: 'this story' };
    store.sending = true;
    await nextTick();
    expect(wrapper.get('.context-recover-input').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('blocks first send while identity is loading and offers retry on failure', async () => {
    vi.mocked(userPersonaApi.getById).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ name: 'Traveler' } as UserPersona);
    const { wrapper, store } = mountOpening('persona');
    const persist = vi.spyOn(store, 'addGreetingMessage').mockResolvedValue(undefined);
    const send = vi.spyOn(store, 'sendMessage').mockResolvedValue(undefined);
    expect(wrapper.get('.greeting-container [role="status"]').exists()).toBe(true);
    expect(wrapper.getComponent(MessageInput).props('disabled')).toBe(true);
    wrapper.getComponent(MessageInput).vm.$emit('send', 'Wait');
    await flushPromises();
    expect(wrapper.get('.greeting-container [role="alert"]').text()).toContain(i18n.global.t('personas.storyIdentityLoadFailed'));
    expect(wrapper.findComponent(MarkdownRenderer).exists()).toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    await wrapper.get('.greeting-container button').trigger('click');
    await flushPromises();
    expect(wrapper.getComponent(MarkdownRenderer).props('content')).toBe('Mara welcomes Traveler.');
    expect(wrapper.getComponent(MessageInput).props('disabled')).toBe(false);
    wrapper.unmount();
  });

  it('uses the saved identity for the opening and explains its fixed scope after persona deletion', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const tenantId = '22222222-2222-4222-8222-222222222222';
    const { wrapper } = mountOpening(undefined, userId, tenantId);
    useUserStore().user = { id: userId, tenantId, email: '', name: 'Changed account', createdAt: '' };
    await wrapper.setProps({ currentChat: {
      ...mockChat,
      personaId: undefined,
      worldbookSnapshotVersion: 1,
      identitySnapshot: {
        protocol: 1, userId, tenantId, source: 'persona',
        sourceId: '33333333-3333-4333-8333-333333333333', name: 'Traveler $&',
        description: 'A careful explorer.', revision: 'a'.repeat(64), capturedAt: '2026-10-23T00:00:00.000Z',
      },
    } });
    await flushPromises();
    expect(wrapper.get('.chat-subtitle').text()).toContain('Traveler $&');
    expect(wrapper.getComponent(MarkdownRenderer).props('content')).toBe('Mara welcomes Traveler $&.');
    await wrapper.get('.reading-settings-trigger').trigger('click');
    expect(wrapper.get('.reading-settings-body').text()).toContain(i18n.global.t('personas.storyIdentityFixed'));
    expect(wrapper.get('.reading-settings-body').text()).toContain(i18n.global.t('chat.savedWorldbooks'));
    expect(wrapper.getComponent(MessageInput).props('disabled')).toBe(false);
    expect(userPersonaApi.getById).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps existing story messages readable if identity lookup fails', async () => {
    vi.mocked(userPersonaApi.getById).mockRejectedValue(new Error('offline'));
    const { wrapper, store } = mountOpening('persona');
    store.messages = [{ id: '1', chatId: 'chat-1', role: 'assistant', content: 'Saved opening', createdAt: '' }];
    await flushPromises();
    expect(wrapper.find('.greeting-container').exists()).toBe(false);
    expect(wrapper.getComponent(MessageInput).props('disabled')).toBe(false);
    wrapper.unmount();
  });

  it('renders component', () => {
    const wrapper = mount(ChatWindow, {
      props: { currentChat: mockChat },
      global: {
        plugins: [i18n],
        stubs: {
          'el-avatar': true,
          'el-button': true,
          'el-empty': true,
          'el-skeleton': true,
          'MessageBubble': true,
          'MessageInput': true,
          'MarkdownRenderer': true,
        },
      },
    });

    expect(wrapper.find('.chat-window').exists()).toBe(true);
  });

  it('renders chat header with character info', () => {
    const wrapper = mount(ChatWindow, {
      props: { currentChat: mockChat },
      global: {
        plugins: [i18n],
        stubs: {
          'el-avatar': true,
          'el-button': true,
          'el-empty': true,
          'el-skeleton': true,
          'MessageBubble': true,
          'MessageInput': true,
          'MarkdownRenderer': true,
        },
      },
    });

    expect(wrapper.find('.chat-title').text()).toBe('Test Chat');
    expect(wrapper.find('.chat-subtitle').exists()).toBe(true);
  });

  it('has messages container', () => {
    const wrapper = mount(ChatWindow, {
      props: { currentChat: mockChat },
      global: {
        plugins: [i18n],
        stubs: {
          'el-avatar': true,
          'el-button': true,
          'el-empty': true,
          'el-skeleton': true,
          'MessageBubble': true,
          'MessageInput': true,
          'MarkdownRenderer': true,
        },
      },
    });

    expect(wrapper.find('.chat-messages').exists()).toBe(true);
  });

  it('has input container', () => {
    const wrapper = mount(ChatWindow, {
      props: { currentChat: mockChat },
      global: {
        plugins: [i18n],
        stubs: {
          'el-avatar': true,
          'el-button': true,
          'el-empty': true,
          'el-skeleton': true,
          'MessageBubble': true,
          'MessageInput': true,
          'MarkdownRenderer': true,
        },
      },
    });

    expect(wrapper.find('.chat-input-container').exists()).toBe(true);
  });

  it('keeps history in view during streaming and resumes following on request', async () => {
    const store = useChatStore();
    store.hasMoreMessages = false;
    store.messages = [{ id: '1', chatId: 'chat-1', role: 'user', content: 'Hello', createdAt: '2026-10-20' }];
    const wrapper = mount(ChatWindow, {
      props: { currentChat: mockChat },
      global: { plugins: [i18n], stubs: { MessageBubble: true, MessageInput: true, MarkdownRenderer: true } },
    });
    await nextTick();
    const container = wrapper.get('.chat-messages').element as HTMLElement;
    Object.defineProperties(container, {
      scrollHeight: { configurable: true, value: 2400 },
      clientHeight: { configurable: true, value: 600 },
    });
    container.scrollTop = 500;
    await wrapper.get('.chat-messages').trigger('scroll');
    store.isStreaming = true;
    store.streamingMessage = 'A new scene';
    await nextTick();
    await nextTick();
    expect(container.scrollTop).toBe(500);
    expect(wrapper.getComponent(ScrollToBottom).props('label')).toBe(i18n.global.t('chat.newContent'));
    store.messages.push({ id: '2', chatId: 'chat-1', role: 'assistant', content: 'A new scene', createdAt: '2026-10-20' });
    window.dispatchEvent(new Event('resize'));
    await nextTick();
    await nextTick();
    expect(container.scrollTop).toBe(500);
    container.scrollTo = vi.fn(({ top }: ScrollToOptions) => { container.scrollTop = top ?? 0; }) as typeof container.scrollTo;
    await wrapper.get('.scroll-to-bottom').trigger('click');
    await nextTick();
    expect(container.scrollTop).toBe(2400);
    expect(wrapper.find('.scroll-to-bottom').exists()).toBe(false);
    container.scrollTop = 1750;
    await wrapper.get('.chat-messages').trigger('scroll');
    store.streamingMessage += ' continues';
    await nextTick();
    await nextTick();
    expect(container.scrollTop).toBe(2400);
    wrapper.unmount();
  });
});
