import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import StorySaveCard from './StorySaveCard.vue';
import i18n from '../../i18n';
import type { Chat } from '../../types';

describe('StorySaveCard', () => {
  let wrapper: VueWrapper;
  afterEach(() => wrapper?.unmount());

  async function render(overrides: Partial<Chat> = {}) {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/chat', name: 'Chat', component: { template: '<div />' } },
      { path: '/chat/:chatId', name: 'ChatSession', component: { template: '<div />' } },
    ] });
    await router.push('/chat');
    wrapper = mount(StorySaveCard, { props: { story: {
      id: 'save-one', title: 'A different life', characterId: 'same-card', characterName: 'Mara', createdAt: '', ...overrides,
    } }, global: { plugins: [router, i18n] } });
  }

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
