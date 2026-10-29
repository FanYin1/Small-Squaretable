import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ChatWindow from './ChatWindow.vue';
import type { Chat } from '@client/types';
import i18n from '../../i18n';
import { useChatStore } from '@client/stores/chat';
import { nextTick } from 'vue';
import ScrollToBottom from './ScrollToBottom.vue';
import MessageInput from './MessageInput.vue';
import MarkdownRenderer from './MarkdownRenderer.vue';
import { useUserStore } from '@client/stores/user';
import { userPersonaApi, type UserPersona } from '@client/services/user-persona.api';
import { useCharacterIntelligenceStore } from '@client/stores/characterIntelligence';
import { storyApi } from '@client/services/story.api';
import type { StoryStateView } from '../../../types/story-state';

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

  afterEach(() => vi.restoreAllMocks());

  function mountOpening(personaId?: string, userId = 'user', tenantId = 'tenant') {
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
        MessageInput: true, MarkdownRenderer: true, MessageBubble: true, StoryDossier: true, StoryMemoryStatus: true, IntelligenceDebugPanel: true,
        'el-button': { template: '<button><slot /></button>' },
        'el-dropdown': { template: '<div class="test-dropdown"><slot /><slot name="dropdown" /></div>' },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { props: ['command'], template: '<div :data-command="command"><slot /></div>' },
      } },
    });
    return { wrapper, store };
  }

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

  it('offers explicit generic opening suggestions without inventing rule actions', async () => {
    mockChat.contentSnapshotVersion = 1;
    const stateView: StoryStateView = { protocol: 1, legacy: false, native: false, version: 0, revision: null,
      fields: [], actions: [], map: null, events: [], notes: [] };
    const state = vi.spyOn(storyApi, 'state').mockResolvedValue(stateView);
    const { wrapper, store } = mountOpening();
    await flushPromises();
    expect(wrapper.get('.opening-suggestions').text()).toContain('不是原卡规则选项');
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
        extra: { storyRecommendations: [
          { label: '查看变化', input: '我查看刚才的变化' },
          { label: '询问原因', input: '我询问变化发生的原因' },
          { label: '观察周围', input: '我继续观察周围' },
        ] } },
    ];
    state.mockRejectedValue(new Error('state unavailable'));
    store.billingRevision++;
    await flushPromises();
    expect(wrapper.get('.turn-recommendations').text()).toContain('查看变化');
    wrapper.unmount();
  });

  it('keeps story management and deletion available in the header without opening reading settings', () => {
    const { wrapper } = mountOpening();

    expect(wrapper.find('.reading-settings').attributes('open')).toBeUndefined();
    expect(wrapper.find('.chat-header [data-command="delete"]').text()).toContain(i18n.global.t('chat.deleteTitle'));

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
    const send = vi.spyOn(store, 'sendMessage').mockResolvedValue(undefined);
    await wrapper.get('.turn-recommendations button').trigger('click');
    await flushPromises();
    expect(send.mock.calls.at(-1)?.[0]).toBe('我仔细检查这道刮痕');
    expect(send.mock.calls.at(-1)?.[5]).toBeUndefined();
    store.messages = [
      ...store.messages,
      { id: 'u2', chatId: mockChat.id, role: 'user', content: '我检查刮痕', createdAt: '' },
      { id: 'a2', chatId: mockChat.id, role: 'assistant', content: '灰尘下露出刻痕。', createdAt: '',
        extra: { storyRecommendations: [
          { label: '辨认刻痕', input: '我试着辨认刻痕' },
          { label: '寻找工具', input: '我看看附近有没有合适的工具' },
          { label: '暂缓判断', input: '我先记下刻痕的位置' },
        ] } },
    ];
    await flushPromises();
    expect(wrapper.get('.turn-recommendations').text()).toContain('辨认刻痕');
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
    expect(wrapper.findComponent({ name: 'StoryMemoryStatus' }).exists()).toBe(true);
    await wrapper.setProps({ currentChat: { ...mockChat, id: 'legacy-story', contentSnapshotVersion: undefined } });
    await flushPromises();
    expect(memories).toHaveBeenCalledExactlyOnceWith('char-1', 'legacy-story');
    expect(emotion).toHaveBeenCalledExactlyOnceWith('char-1', 'legacy-story');
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
    expect(wrapper.get('.greeting-container [role="alert"]').text()).toContain('identity could not be loaded');
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
    expect(wrapper.get('.reading-settings-body').text()).toContain('This story keeps the identity you started with');
    expect(wrapper.get('.reading-settings-body').text()).toContain('This story keeps the worldbooks bound at its start');
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
