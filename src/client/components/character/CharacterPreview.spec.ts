import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CharacterPreview from './CharacterPreview.vue';
import StoryCard from '../market/StoryCard.vue';
import MarkdownRenderer from '../chat/MarkdownRenderer.vue';
import i18n from '../../i18n';

describe('reader-facing author preview', () => {
  it('reuses production renderers without publishing private instructions or enabling mutations', () => {
    const wrapper = mount(CharacterPreview, {
      props: { name: 'Mara', description: 'A quiet harbor.', avatarUrl: '', personality: 'PRIVATE_INSTRUCTIONS', firstMessage: '{{char}} opens the door.', tags: ['mystery'], category: 'game' },
      global: { plugins: [i18n] },
    });
    expect(wrapper.getComponent(StoryCard).props('preview')).toBe(true);
    expect(wrapper.getComponent(MarkdownRenderer).props('content')).toBe('Mara opens the door.');
    expect(wrapper.text()).not.toContain('PRIVATE_INSTRUCTIONS');
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.find('.story-favorite').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps an empty draft readable without an external placeholder image', () => {
    const wrapper = mount(CharacterPreview, {
      props: { name: '', description: '', avatarUrl: '', personality: '', firstMessage: '', tags: [], category: '' },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.getComponent(StoryCard).props('character').name).toBe(i18n.global.t('storyShell.untitled'));
    expect(wrapper.findComponent(MarkdownRenderer).exists()).toBe(false);
    wrapper.unmount();
  });
});
