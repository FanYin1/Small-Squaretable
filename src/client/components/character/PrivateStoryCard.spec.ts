import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import PrivateStoryCard from './PrivateStoryCard.vue';
import i18n from '../../i18n';
import type { Character } from '../../types';

describe('Private story entry', () => {
  let wrapper: VueWrapper;
  afterEach(() => { wrapper?.unmount(); });
  const character: Character = {
    id: 'private-card', name: 'Evening train', description: 'A station waiting for your arrival.',
    isPublic: false, createdAt: '2026-10-27', avatar: '/cover.png',
    cardData: { first_mes: 'The conductor waves.' }, tags: ['Mystery'],
  };
  function render(canPublish = true) {
    wrapper = mount(PrivateStoryCard, { props: { character, canPublish }, global: { plugins: [i18n, ElementPlus] } });
  }
  it('separates viewing, entering, and editing without automatically starting or publishing', async () => {
    render();
    expect(wrapper.emitted()).toEqual({});
    await wrapper.get('.private-story-preview').trigger('click');
    expect(wrapper.emitted('view')).toHaveLength(1);
    expect(wrapper.emitted('enter')).toBeUndefined();
    await wrapper.get('.private-story-enter').trigger('click');
    await wrapper.get('.private-story-edit').trigger('click');
    expect(wrapper.emitted('enter')).toHaveLength(1);
    expect(wrapper.emitted('edit')).toHaveLength(1);
    expect(wrapper.emitted('manage')).toBeUndefined();
    expect(wrapper.find('.story-favorite').exists()).toBe(false);
    expect(wrapper.find('.stats-grid').exists()).toBe(false);
  });
  it('offers a preview rather than submission when publication permission is absent', async () => {
    render(false);
    await wrapper.get('.private-story-more').trigger('click');
    await flushPromises();
    const menu = document.body.querySelector('.private-story-menu')!;
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    const publish = items.find(item => item.textContent?.trim() === i18n.global.t('privateLibrary.publishPreview'))!;
    expect(publish.getAttribute('aria-disabled')).not.toBe('true');
    (publish as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('manage')).toEqual([['publish']]);
    const duplicate = items.find(item => item.textContent?.trim() === i18n.global.t('myCharacters.duplicate'))!;
    (duplicate as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('manage')).toEqual([['publish'], ['duplicate']]);
    expect(wrapper.emitted('enter')).toBeUndefined();
  });
  it('falls back from broken covers and removes control blocks from the introduction', async () => {
    render();
    await wrapper.setProps({ character: { ...character, description: '', cardData: {
      first_mes: '<VariableInsert>{"secret":42}</VariableInsert><content>A quiet train.</content>',
    } } });
    await wrapper.get('img').trigger('error');
    expect(wrapper.get('.cover-initial').text()).toBe('E');
    expect(wrapper.text()).not.toContain('"secret":42');
    expect(wrapper.get('.private-story-summary').text()).toContain('A quiet train.');
  });
});
