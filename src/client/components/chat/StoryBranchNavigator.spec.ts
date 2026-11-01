import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import StoryBranchNavigator from './StoryBranchNavigator.vue';
import StoryBranchFamily from './StoryBranchFamily.vue';

describe('StoryBranchNavigator overlay', () => {
  afterEach(() => { document.body.innerHTML = ''; document.body.style.overflow = ''; vi.restoreAllMocks(); });
  async function mountNavigator() {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/chat/:chatId', name: 'ChatSession', component: { template: '<div />' } }] });
    await router.push('/chat/story');
    const wrapper = mount(StoryBranchNavigator, { attachTo: document.body, props: { chatId: 'story', ownerId: 'reader' }, global: { plugins: [router], stubs: { StoryBranchFamily: true } } });
    return { wrapper, router };
  }
  it('never pins a second sidebar, even with a saved legacy expansion preference', async () => {
    localStorage.setItem('squaretable:story-branch-navigation:expanded', 'true');
    const { wrapper } = await mountNavigator();
    expect(wrapper.find('.story-branch-navigation').exists()).toBe(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('切换只恢复存档');
    const close = document.querySelector('.workspace-drawer-heading button') as HTMLButtonElement;
    close.click();
    await flushPromises();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    wrapper.unmount();
    localStorage.removeItem('squaretable:story-branch-navigation:expanded');
  });
  it('selects a saved branch and closes without generating a reply', async () => {
    const { wrapper, router } = await mountNavigator();
    await wrapper.get('button').trigger('click');
    wrapper.getComponent(StoryBranchFamily).vm.$emit('select', 'other');
    await flushPromises();
    expect(router.currentRoute.value.params.chatId).toBe('other');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    wrapper.unmount();
  });
});
