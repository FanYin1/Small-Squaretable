import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';
import DashboardLayout from './DashboardLayout.vue';
import i18n from '../../i18n';

let user: { isAuthenticated: boolean };
vi.mock('@client/stores/user', () => ({ useUserStore: () => user }));

describe('story dashboard authentication boundary', () => {
  beforeEach(() => { user = reactive({ isAuthenticated: false }); });
  function render() {
    return mount(DashboardLayout, { global: { plugins: [i18n], stubs: {
      LeftSidebar: true, BottomTabBar: true, UserMenu: true, DeviceIndicator: true,
      ConnectionIndicator: true, NotificationBell: true,
      RouterLink: { template: '<a><slot /></a>' },
      'el-icon': { template: '<span><slot /></span>' },
    } } });
  }
  it('does not mount private notifications or device controls for anonymous discovery', () => {
    const wrapper = render();
    expect(wrapper.find('notification-bell-stub').exists()).toBe(false);
    expect(wrapper.find('device-indicator-stub').exists()).toBe(false);
    expect(wrapper.find('.guest-login').exists()).toBe(true);
    wrapper.unmount();
  });
  it('retains private controls after login and removes them after logout', async () => {
    user.isAuthenticated = true;
    const wrapper = render();
    expect(wrapper.find('notification-bell-stub').exists()).toBe(true);
    user.isAuthenticated = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('notification-bell-stub').exists()).toBe(false);
    expect(wrapper.find('.guest-login').exists()).toBe(true);
    wrapper.unmount();
  });
});
