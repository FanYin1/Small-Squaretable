/**
 * Login Page 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import Login from './Login.vue';
import { useUserStore } from '@client/stores/user';
import '../../test-setup';

// Mock vue-router
const mockPush = vi.fn();
const mockRoute = {
  query: {},
};

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useRoute: () => mockRoute,
}));

// Mock useToast composable
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

vi.mock('@client/composables/useToast', () => ({
  useToast: () => mockToast,
}));

describe('Login Page', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockRoute.query = {};
  });

  it('should render login form', () => {
    const wrapper = mount(Login, {
      global: {
        stubs: {
          'el-card': { template: '<div><slot name="header" /><slot /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { template: '<div><slot /></div>' },
          'el-input': { template: '<input />' },
          'el-button': { template: '<button><slot /></button>' },
          'el-checkbox': { template: '<input type="checkbox" />' },
          'el-link': { template: '<a><slot /></a>' },
          'el-divider': { template: '<hr />' },
          'el-icon': { template: '<i><slot /></i>' },
        },
      },
    });

    expect(wrapper.find('.title').text()).toBe('登录');
    expect(wrapper.find('.subtitle').text()).toBe('欢迎回到 Small Squaretable');
  });

  it('should validate email format', async () => {
    const wrapper = mount(Login, {
      global: {
        stubs: {
          'el-card': { template: '<div><slot name="header" /><slot /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { template: '<div><slot /></div>' },
          'el-input': { template: '<input />' },
          'el-button': { template: '<button><slot /></button>' },
          'el-checkbox': { template: '<input type="checkbox" />' },
          'el-link': { template: '<a><slot /></a>' },
          'el-divider': { template: '<hr />' },
          'el-icon': { template: '<i><slot /></i>' },
        },
      },
    });

    const vm = wrapper.vm as any;

    // Test email validation rules
    expect(vm.rules.email).toBeDefined();
    expect(vm.rules.email[0].required).toBe(true);
    expect(vm.rules.email[1].type).toBe('email');
  });

  it('should validate password requirement', async () => {
    const wrapper = mount(Login, {
      global: {
        stubs: {
          'el-card': { template: '<div><slot name="header" /><slot /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { template: '<div><slot /></div>' },
          'el-input': { template: '<input />' },
          'el-button': { template: '<button><slot /></button>' },
          'el-checkbox': { template: '<input type="checkbox" />' },
          'el-link': { template: '<a><slot /></a>' },
          'el-divider': { template: '<hr />' },
          'el-icon': { template: '<i><slot /></i>' },
        },
      },
    });

    const vm = wrapper.vm as any;

    // Test password validation rules
    expect(vm.rules.password).toBeDefined();
    expect(vm.rules.password[0].required).toBe(true);
    expect(vm.rules.password[1].min).toBe(6);
  });

  it('should toggle password visibility', async () => {
    const wrapper = mount(Login, {
      global: {
        stubs: {
          'el-card': { template: '<div><slot name="header" /><slot /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { template: '<div><slot /></div>' },
          'el-input': { template: '<input />' },
          'el-button': { template: '<button><slot /></button>' },
          'el-checkbox': { template: '<input type="checkbox" />' },
          'el-link': { template: '<a><slot /></a>' },
          'el-divider': { template: '<hr />' },
          'el-icon': { template: '<i><slot /></i>' },
        },
      },
    });

    const vm = wrapper.vm as any;

    expect(vm.showPassword).toBe(false);

    // Toggle password visibility
    vm.showPassword = true;
    await wrapper.vm.$nextTick();
    expect(vm.showPassword).toBe(true);
  });

  it('should handle successful login', async () => {
    const wrapper = mount(Login, {
      global: {
        stubs: {
          'el-card': { template: '<div><slot name="header" /><slot /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { template: '<div><slot /></div>' },
          'el-input': { template: '<input />' },
          'el-button': { template: '<button><slot /></button>' },
          'el-checkbox': { template: '<input type="checkbox" />' },
          'el-link': { template: '<a><slot /></a>' },
          'el-divider': { template: '<hr />' },
          'el-icon': { template: '<i><slot /></i>' },
        },
      },
    });

    const userStore = useUserStore();
    vi.spyOn(userStore, 'login').mockResolvedValue();

    const vm = wrapper.vm as any;
    vm.loginForm.email = 'test@example.com';
    vm.loginForm.password = 'password123';

    // Mock form validation
    const mockFormRef = {
      validate: vi.fn((callback) => callback(true)),
    };
    vm.loginFormRef = mockFormRef;

    await vm.handleLogin(mockFormRef);

    expect(userStore.login).toHaveBeenCalledWith('test@example.com', 'password123');
    expect(mockToast.success).toHaveBeenCalledWith('登录成功');
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('should redirect to original page after login', async () => {
    mockRoute.query = { redirect: '/chat' };

    const wrapper = mount(Login, {
      global: {
        stubs: {
          'el-card': { template: '<div><slot name="header" /><slot /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { template: '<div><slot /></div>' },
          'el-input': { template: '<input />' },
          'el-button': { template: '<button><slot /></button>' },
          'el-checkbox': { template: '<input type="checkbox" />' },
          'el-link': { template: '<a><slot /></a>' },
          'el-divider': { template: '<hr />' },
          'el-icon': { template: '<i><slot /></i>' },
        },
      },
    });

    const userStore = useUserStore();
    vi.spyOn(userStore, 'login').mockResolvedValue();

    const vm = wrapper.vm as any;
    vm.loginForm.email = 'test@example.com';
    vm.loginForm.password = 'password123';

    const mockFormRef = {
      validate: vi.fn((callback) => callback(true)),
    };
    vm.loginFormRef = mockFormRef;

    await vm.handleLogin(mockFormRef);

    expect(mockPush).toHaveBeenCalledWith('/chat');
  });

  it('should handle login error', async () => {
    const wrapper = mount(Login, {
      global: {
        stubs: {
          'el-card': { template: '<div><slot name="header" /><slot /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { template: '<div><slot /></div>' },
          'el-input': { template: '<input />' },
          'el-button': { template: '<button><slot /></button>' },
          'el-checkbox': { template: '<input type="checkbox" />' },
          'el-link': { template: '<a><slot /></a>' },
          'el-divider': { template: '<hr />' },
          'el-icon': { template: '<i><slot /></i>' },
        },
      },
    });

    const userStore = useUserStore();
    userStore.error = 'Invalid credentials';
    vi.spyOn(userStore, 'login').mockRejectedValue(new Error('Invalid credentials'));

    const vm = wrapper.vm as any;
    vm.loginForm.email = 'test@example.com';
    vm.loginForm.password = 'wrongpassword';

    const mockFormRef = {
      validate: vi.fn((callback) => callback(true)),
    };
    vm.loginFormRef = mockFormRef;

    await vm.handleLogin(mockFormRef);

    expect(mockToast.error).toHaveBeenCalledWith('登录失败', { message: 'Invalid credentials' });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should show loading state during login', async () => {
    const wrapper = mount(Login, {
      global: {
        stubs: {
          'el-card': { template: '<div><slot name="header" /><slot /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { template: '<div><slot /></div>' },
          'el-input': { template: '<input />' },
          'el-button': { template: '<button><slot /></button>' },
          'el-checkbox': { template: '<input type="checkbox" />' },
          'el-link': { template: '<a><slot /></a>' },
          'el-divider': { template: '<hr />' },
          'el-icon': { template: '<i><slot /></i>' },
        },
      },
    });

    const userStore = useUserStore();
    let resolveLogin: () => void;
    const loginPromise = new Promise<void>((resolve) => {
      resolveLogin = resolve;
    });
    vi.spyOn(userStore, 'login').mockReturnValue(loginPromise);

    const vm = wrapper.vm as any;
    vm.loginForm.email = 'test@example.com';
    vm.loginForm.password = 'password123';

    const mockFormRef = {
      validate: vi.fn((callback) => callback(true)),
    };
    vm.loginFormRef = mockFormRef;

    const loginCall = vm.handleLogin(mockFormRef);
    await wrapper.vm.$nextTick();

    expect(vm.loading).toBe(true);

    resolveLogin!();
    await loginCall;

    expect(vm.loading).toBe(false);
  });

  it('should navigate to register page', async () => {
    const wrapper = mount(Login, {
      global: {
        stubs: {
          'el-card': { template: '<div><slot name="header" /><slot /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { template: '<div><slot /></div>' },
          'el-input': { template: '<input />' },
          'el-button': { template: '<button><slot /></button>' },
          'el-checkbox': { template: '<input type="checkbox" />' },
          'el-link': { template: '<a><slot /></a>' },
          'el-divider': { template: '<hr />' },
          'el-icon': { template: '<i><slot /></i>' },
        },
      },
    });

    const vm = wrapper.vm as any;
    vm.goToRegister();

    expect(mockPush).toHaveBeenCalledWith({ name: 'Register' });
  });

  it('should show info message for forgot password', async () => {
    const wrapper = mount(Login, {
      global: {
        stubs: {
          'el-card': { template: '<div><slot name="header" /><slot /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { template: '<div><slot /></div>' },
          'el-input': { template: '<input />' },
          'el-button': { template: '<button><slot /></button>' },
          'el-checkbox': { template: '<input type="checkbox" />' },
          'el-link': { template: '<a><slot /></a>' },
          'el-divider': { template: '<hr />' },
          'el-icon': { template: '<i><slot /></i>' },
        },
      },
    });

    const vm = wrapper.vm as any;
    vm.handleForgotPassword();

    expect(mockToast.info).toHaveBeenCalledWith('忘记密码功能即将推出');
  });

  it('should not submit form if validation fails', async () => {
    const wrapper = mount(Login, {
      global: {
        stubs: {
          'el-card': { template: '<div><slot name="header" /><slot /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { template: '<div><slot /></div>' },
          'el-input': { template: '<input />' },
          'el-button': { template: '<button><slot /></button>' },
          'el-checkbox': { template: '<input type="checkbox" />' },
          'el-link': { template: '<a><slot /></a>' },
          'el-divider': { template: '<hr />' },
          'el-icon': { template: '<i><slot /></i>' },
        },
      },
    });

    const userStore = useUserStore();
    vi.spyOn(userStore, 'login');

    const vm = wrapper.vm as any;

    // Mock form validation failure
    const mockFormRef = {
      validate: vi.fn((callback) => callback(false)),
    };
    vm.loginFormRef = mockFormRef;

    await vm.handleLogin(mockFormRef);

    expect(userStore.login).not.toHaveBeenCalled();
  });

  it('should handle undefined form ref gracefully', async () => {
    const wrapper = mount(Login, {
      global: {
        stubs: {
          'el-card': { template: '<div><slot name="header" /><slot /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { template: '<div><slot /></div>' },
          'el-input': { template: '<input />' },
          'el-button': { template: '<button><slot /></button>' },
          'el-checkbox': { template: '<input type="checkbox" />' },
          'el-link': { template: '<a><slot /></a>' },
          'el-divider': { template: '<hr />' },
          'el-icon': { template: '<i><slot /></i>' },
        },
      },
    });

    const userStore = useUserStore();
    vi.spyOn(userStore, 'login');

    const vm = wrapper.vm as any;
    await vm.handleLogin(undefined);

    expect(userStore.login).not.toHaveBeenCalled();
  });
});
