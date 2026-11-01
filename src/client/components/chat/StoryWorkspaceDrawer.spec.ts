import { afterEach, describe, expect, it } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import StoryWorkspaceDrawer from './StoryWorkspaceDrawer.vue';

describe('StoryWorkspaceDrawer modal boundary', () => {
  afterEach(() => { document.body.innerHTML = ''; document.body.style.overflow = ''; });
  it('blocks the reader, focuses close, and restores the previous focus and scrolling on dismissal', async () => {
    document.body.innerHTML = '<div id="app"><button id="trigger">Open</button></div>';
    const trigger = document.getElementById('trigger')!;
    trigger.focus();
    document.body.style.overflow = 'auto';
    const wrapper = mount(StoryWorkspaceDrawer, { props: { open: false, title: '分支存档' } });
    await wrapper.setProps({ open: true });
    await flushPromises();
    expect(document.getElementById('app')!.inert).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('返回故事');
    const close = document.querySelector('.workspace-drawer-heading button') as HTMLButtonElement;
    close.click();
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
    await wrapper.setProps({ open: false });
    await flushPromises();
    expect(document.getElementById('app')!.inert).toBe(false);
    expect(document.body.style.overflow).toBe('auto');
    expect(document.activeElement).toBe(trigger);
    wrapper.unmount();
  });
  it('handles Escape and backdrop; releases inert if unmounted while open', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const wrapper = mount(StoryWorkspaceDrawer, { props: { open: true, title: '阅读设置' } });
    document.querySelector('.story-workspace-layer')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    (document.querySelector('.story-workspace-backdrop') as HTMLButtonElement).click();
    expect(wrapper.emitted('update:open')).toEqual([[false], [false]]);
    wrapper.unmount();
    expect(document.getElementById('app')!.inert).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });
  it('returns to the stable header trigger when switching from a discarded settings menu', async () => {
    document.body.innerHTML = '<div id="app"><button id="settings">Settings</button></div><button id="temporary-menu">Memory</button>';
    const returnFocus = document.getElementById('settings')!;
    document.getElementById('temporary-menu')!.focus();
    const wrapper = mount(StoryWorkspaceDrawer, { props: { open: false, title: '记忆', returnFocus } });
    await wrapper.setProps({ open: true });
    document.getElementById('temporary-menu')!.remove();
    await wrapper.setProps({ open: false });
    await flushPromises();
    expect(document.activeElement).toBe(returnFocus);
    expect(document.getElementById('app')!.inert).toBe(false);
    wrapper.unmount();
  });
});
