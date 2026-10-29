import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { ElMessageBox, ElMessage } from 'element-plus';
import { useChatStore } from '@client/stores/chat';
import { chatApi } from '@client/services/chat.api';
import { createMemoryHistory, createRouter } from 'vue-router';
import StorySaveCard from './StorySaveCard.vue';
import i18n from '../../i18n';
import type { Chat } from '../../types';

vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: vi.fn() }, ElMessage: { success: vi.fn(), error: vi.fn() },
}));

describe('StorySaveCard', () => {
  let wrapper: VueWrapper;
  afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); vi.resetAllMocks(); });

  async function render(overrides: Partial<Chat> = {}) {
    setActivePinia(createPinia());
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/chat', name: 'Chat', component: { template: '<div />' } },
      { path: '/chat/:chatId', name: 'ChatSession', component: { template: '<div />' } },
    ] });
    await router.push('/chat');
    wrapper = mount(StorySaveCard, { props: { story: {
      id: 'save-one', title: 'A different life', characterId: 'same-card', characterName: 'Mara', createdAt: '', ...overrides,
    } }, global: { plugins: [router, i18n] } });
    useChatStore().chats = [wrapper.props('story'), { ...wrapper.props('story'), id: 'save-other' }];
    return router;
  }

  it('confirms the named save, prevents duplicate requests, and removes only that save without navigation', async () => {
    const router = await render();
    let confirm!: (value: 'confirm') => void;
    vi.mocked(ElMessageBox.confirm).mockImplementation(() => new Promise(resolve => { confirm = resolve; }));
    const remove = vi.spyOn(chatApi, 'deleteChat').mockResolvedValue(undefined);
    await wrapper.get('.library-delete').trigger('click');
    expect(ElMessageBox.confirm).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('A different life'), expect.any(Object));
    expect(wrapper.get('.library-delete').attributes('disabled')).toBeDefined();
    await wrapper.get('.library-delete').trigger('click');
    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    confirm('confirm');
    await flushPromises();
    expect(remove).toHaveBeenCalledExactlyOnceWith('save-one');
    expect(useChatStore().chats.map(story => story.id)).toEqual(['save-other']);
    expect(router.currentRoute.value.path).toBe('/chat');
  });

  it.each(['cancel', 'close'])('keeps the story when the dialog is dismissed: %s', async reason => {
    await render();
    vi.mocked(ElMessageBox.confirm).mockRejectedValue(reason);
    const remove = vi.spyOn(chatApi, 'deleteChat');
    await wrapper.get('.library-delete').trigger('click');
    await flushPromises();
    expect(remove).not.toHaveBeenCalled();
    expect(useChatStore().chats).toHaveLength(2);
    expect(ElMessage.error).not.toHaveBeenCalled();
    expect(wrapper.get('.library-delete').attributes('disabled')).toBeUndefined();
  });

  it('keeps the list readable on deletion failure and allows retry', async () => {
    await render();
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm');
    const remove = vi.spyOn(chatApi, 'deleteChat').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    await wrapper.get('.library-delete').trigger('click');
    await flushPromises();
    expect(useChatStore().chats).toHaveLength(2);
    expect(useChatStore().error).toBeNull();
    expect(useChatStore().loading).toBe(false);
    expect(ElMessage.error).toHaveBeenCalled();
    await wrapper.get('.library-delete').trigger('click');
    await flushPromises();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(useChatStore().chats.map(story => story.id)).toEqual(['save-other']);
  });

  it('separates resuming a specific save from starting the same card again', async () => {
    await render();
    expect(wrapper.get('.library-resume').attributes('href')).toBe('/chat/save-one');
    expect(wrapper.get('.library-meta a').attributes('href')).toBe('/chat?characterId=same-card&storyEntry=quick');
    await wrapper.setProps({ story: { ...wrapper.props('story'), id: 'save-two' } });
    expect(wrapper.get('.library-resume').attributes('href')).toBe('/chat/save-two');
  });

  it('renders stored text safely without inventing a summary or date', async () => {
    await render({ title: '<img src=x onerror=alert(1)>', lastMessageAt: 'invalid' });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.get('h2').text()).toContain('<img');
    expect(wrapper.find('time').exists()).toBe(false);
    expect(wrapper.get('.library-excerpt').text()).toContain('No story summary yet');
  });

  it('falls back after a failed cover and hides new-run action without a card', async () => {
    await render({ characterAvatar: '/missing.png', characterId: '', lastMessage: 'A promise remains.' });
    await wrapper.get('img').trigger('error');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.get('.library-excerpt').text()).toBe('A promise remains.');
    expect(wrapper.find('.library-meta a').exists()).toBe(false);
  });
});
