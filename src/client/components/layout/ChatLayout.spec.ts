import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import ChatLayout from './ChatLayout.vue';
import i18n from '../../i18n';

const STORAGE_KEY = 'chat-sidebar-collapsed';

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

function mountLayout() {
  return mount(ChatLayout, {
    // 需要挂到 document 上，焦点相关断言才有意义
    attachTo: document.body,
    slots: { default: '<div class="slot-content">content</div>' },
    global: {
      plugins: [i18n],
      stubs: {
        ChatSidebar: { name: 'ChatSidebar', template:'<div class="chat-sidebar-stub"><button class="sidebar-btn">x</button></div>' },
        BottomTabBar: true,
        'el-icon': { template: '<span><slot /></span>' },
      },
    },
  });
}

describe('ChatLayout mobile drawer', () => {
  let wrapper: VueWrapper | undefined;
  const t = (key: string) => i18n.global.t(key) as string;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    setViewportWidth(390);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    setViewportWidth(1024);
  });

  it('exposes an accessible hamburger toggle that controls the sidebar', () => {
    wrapper = mountLayout();
    const toggle = wrapper.find('.mobile-hamburger');

    expect(toggle.element.tagName).toBe('BUTTON');
    expect(toggle.attributes('aria-label')).toBe(t('chat.sidebar.openDrawer'));
    expect(toggle.attributes('aria-label')).not.toBe('chat.sidebar.openDrawer');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(toggle.attributes('aria-controls')).toBe('chat-sidebar-drawer');
    expect(wrapper.find('#chat-sidebar-drawer').exists()).toBe(true);
  });

  it('keeps the closed drawer out of the tab order and accessibility tree', () => {
    wrapper = mountLayout();
    const drawer = wrapper.find('#chat-sidebar-drawer');

    expect(drawer.classes()).toContain('mobile-closed');
    expect(drawer.attributes('inert')).toBeDefined();
    expect(wrapper.find('.sidebar-backdrop').exists()).toBe(false);
  });

  it('opens as a modal dialog drawer and moves focus into it', async () => {
    wrapper = mountLayout();
    await wrapper.find('.mobile-hamburger').trigger('click');
    await nextTick();
    await nextTick();

    const drawer = wrapper.find('#chat-sidebar-drawer');
    expect(drawer.classes()).toContain('mobile-open');
    expect(drawer.attributes('inert')).toBeUndefined();
    expect(drawer.attributes('role')).toBe('dialog');
    expect(drawer.attributes('aria-modal')).toBe('true');
    expect(drawer.attributes('aria-label')).toBe(t('chat.sidebar.drawerLabel'));
    expect(wrapper.find('.mobile-hamburger').attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('.sidebar-backdrop').exists()).toBe(true);
    expect(document.activeElement).toBe(drawer.element);
  });

  it('closes on Escape and returns focus to the toggle', async () => {
    wrapper = mountLayout();
    await wrapper.find('.mobile-hamburger').trigger('click');
    await nextTick();
    await nextTick();

    await wrapper.find('.chat-layout').trigger('keydown', { key: 'Escape' });
    await nextTick();
    await nextTick();

    expect(wrapper.find('#chat-sidebar-drawer').classes()).toContain('mobile-closed');
    expect(wrapper.find('#chat-sidebar-drawer').attributes('inert')).toBeDefined();
    expect(wrapper.find('.mobile-hamburger').attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(wrapper.find('.mobile-hamburger').element);
  });

  it('closes when the backdrop is clicked', async () => {
    wrapper = mountLayout();
    await wrapper.find('.mobile-hamburger').trigger('click');
    await nextTick();

    await wrapper.find('.sidebar-backdrop').trigger('click');
    await nextTick();

    expect(wrapper.find('#chat-sidebar-drawer').classes()).toContain('mobile-closed');
  });

  it('closes after a chat is selected from the drawer', async () => {
    wrapper = mountLayout();
    await wrapper.find('.mobile-hamburger').trigger('click');
    await nextTick();

    wrapper.findComponent({ name: 'ChatSidebar' }).vm.$emit('select-chat', 'chat-2');
    await nextTick();

    expect(wrapper.emitted('select-chat')?.[0]).toEqual(['chat-2']);
    expect(wrapper.find('#chat-sidebar-drawer').classes()).toContain('mobile-closed');
  });

  it('does not react to Escape while the drawer is closed', async () => {
    wrapper = mountLayout();
    await wrapper.find('.chat-layout').trigger('keydown', { key: 'Escape' });
    await nextTick();

    expect(wrapper.find('#chat-sidebar-drawer').classes()).toContain('mobile-closed');
    expect(wrapper.find('.mobile-hamburger').attributes('aria-expanded')).toBe('false');
  });
});

describe('ChatLayout desktop', () => {
  let wrapper: VueWrapper | undefined;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    setViewportWidth(1280);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    setViewportWidth(1024);
  });

  it('renders the sidebar inline without drawer semantics or backdrop', () => {
    wrapper = mountLayout();
    const drawer = wrapper.find('#chat-sidebar-drawer');

    expect(drawer.classes()).not.toContain('mobile-open');
    expect(drawer.classes()).not.toContain('mobile-closed');
    expect(drawer.attributes('inert')).toBeUndefined();
    expect(drawer.attributes('role')).toBeUndefined();
    expect(wrapper.find('.sidebar-backdrop').exists()).toBe(false);
  });

  it('makes a collapsed desktop sidebar inert and offers an accessible restore button', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    wrapper = mountLayout();

    expect(wrapper.find('#chat-sidebar-drawer').attributes('inert')).toBeDefined();
    const restore = wrapper.find('.sidebar-restore-btn');
    expect(restore.exists()).toBe(true);
    expect(restore.attributes('aria-label')).toBe(i18n.global.t('chat.sidebar.expand'));
  });
});
