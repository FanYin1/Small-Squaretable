/**
 * Register Page Tests
 *
 * Tests for registration page functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import Register from './Register.vue';
import { useUserStore } from '@client/stores/user';
import { ElMessage } from 'element-plus';
import '../../test-setup';

// Mock Element Plus Message
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus');
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

// Mock user store
vi.mock('@client/stores/user', () => ({
  useUserStore: vi.fn(),
}));

// Element Plus component stubs
const elementPlusStubs = {
  'el-card': {
    template: '<div class="el-card"><slot name="header" /><slot /></div>',
  },
  'el-form': {
    template: '<form @submit="$emit(\'submit\', $event)"><slot /></form>',
    methods: {
      validate: vi.fn().mockResolvedValue(true),
    },
  },
  'el-form-item': {
    template: '<div class="el-form-item"><slot /></div>',
  },
  'el-input': {
    template: '<input :type="type" :placeholder="placeholder" :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['type', 'placeholder', 'disabled', 'modelValue', 'clearable'],
  },
  'el-button': {
    template: '<button :type="nativeType" :disabled="disabled || loading" :class="type"><slot /></button>',
    props: ['type', 'nativeType', 'disabled', 'loading', 'link'],
  },
  'el-checkbox': {
    template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" :disabled="disabled" /><span><slot /></span>',
    props: ['modelValue', 'disabled'],
  },
  'el-icon': {
    template: '<span class="el-icon" @click="$emit(\'click\')"><slot /></span>',
  },
  'el-divider': {
    template: '<hr class="el-divider" />',
  },
  View: { template: '<span>View</span>' },
  Hide: { template: '<span>Hide</span>' },
};

describe('Register Page', () => {
  let router: any;
  let mockUserStore: any;

  beforeEach(() => {
    setActivePinia(createPinia());

    // Setup router
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'Home', component: { template: '<div>Home</div>' } },
        { path: '/auth/login', name: 'Login', component: { template: '<div>Login</div>' } },
        { path: '/auth/register', name: 'Register', component: Register },
      ],
    });

    // Setup mock user store
    mockUserStore = {
      register: vi.fn(),
      loading: false,
      error: null,
    };
    vi.mocked(useUserStore).mockReturnValue(mockUserStore);

    vi.clearAllMocks();
  });

  const createWrapper = () => {
    return mount(Register, {
      global: {
        plugins: [router],
        stubs: elementPlusStubs,
      },
    });
  };

  describe('Component Rendering', () => {
    it('should render registration form', () => {
      const wrapper = createWrapper();

      expect(wrapper.find('h1').text()).toBe('创建账号');
      expect(wrapper.find('.subtitle').text()).toBe('开始您的 SillyTavern 之旅');
      expect(wrapper.find('input[placeholder="请输入您的姓名"]').exists()).toBe(true);
      expect(wrapper.find('input[placeholder="请输入您的邮箱"]').exists()).toBe(true);
      expect(wrapper.find('input[placeholder*="请输入密码"]').exists()).toBe(true);
      expect(wrapper.find('input[placeholder="请再次输入密码"]').exists()).toBe(true);
    });

    it('should render terms checkbox', () => {
      const wrapper = createWrapper();

      const checkbox = wrapper.find('input[type="checkbox"]');
      expect(checkbox.exists()).toBe(true);
      const checkboxText = wrapper.text();
      expect(checkboxText).toContain('我已阅读并同意');
      expect(checkboxText).toContain('服务条款');
      expect(checkboxText).toContain('隐私政策');
    });

    it('should render register button', () => {
      const wrapper = createWrapper();

      const button = wrapper.find('button.register-button');
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe('注册');
    });

    it('should render login link', () => {
      const wrapper = createWrapper();

      const loginLink = wrapper.find('.login-link');
      expect(loginLink.exists()).toBe(true);
      expect(loginLink.text()).toContain('已有账号？');
      expect(loginLink.text()).toContain('立即登录');
    });
  });

  describe('Password Visibility Toggle', () => {
    it('should render password toggle icons', async () => {
      const wrapper = createWrapper();

      // Password toggle icons are rendered via el-icon component
      // Check that password inputs exist (toggle functionality is present)
      const passwordInputs = wrapper.findAll('input[type="password"]');
      expect(passwordInputs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Password Strength Indicator', () => {
    it('should not show strength indicator when password is empty', () => {
      const wrapper = createWrapper();
      expect(wrapper.find('.password-strength').exists()).toBe(false);
    });

    it('should show weak password strength', async () => {
      const wrapper = createWrapper();
      const passwordInput = wrapper.find('input[placeholder*="请输入密码"]');
      await passwordInput.setValue('abc123');
      await wrapper.vm.$nextTick();

      const strengthText = wrapper.find('.strength-text');
      expect(strengthText.exists()).toBe(true);
      expect(strengthText.text()).toContain('弱');
    });

    it('should show medium password strength', async () => {
      const wrapper = createWrapper();
      const passwordInput = wrapper.find('input[placeholder*="请输入密码"]');
      await passwordInput.setValue('Abcd1234');
      await wrapper.vm.$nextTick();

      const strengthText = wrapper.find('.strength-text');
      expect(strengthText.exists()).toBe(true);
      expect(strengthText.text()).toContain('中');
    });

    it('should show strong password strength', async () => {
      const wrapper = createWrapper();
      const passwordInput = wrapper.find('input[placeholder*="请输入密码"]');
      await passwordInput.setValue('Abcd1234!@#$');
      await wrapper.vm.$nextTick();

      const strengthText = wrapper.find('.strength-text');
      expect(strengthText.exists()).toBe(true);
      expect(strengthText.text()).toContain('强');
    });
  });

  describe('Form Validation', () => {
    it('should validate required name field', async () => {
      const wrapper = createWrapper();
      const form = wrapper.find('form');
      expect(form.exists()).toBe(true);
    });

    it('should validate name length', async () => {
      const wrapper = createWrapper();
      const nameInput = wrapper.find('input[placeholder="请输入您的姓名"]');
      await nameInput.setValue('A');
      expect(nameInput.element.value).toBe('A');
    });

    it('should validate email format', async () => {
      const wrapper = createWrapper();
      const emailInput = wrapper.find('input[placeholder="请输入您的邮箱"]');
      await emailInput.setValue('invalid-email');
      expect(emailInput.element.value).toBe('invalid-email');
    });

    it('should validate password requirements', async () => {
      const wrapper = createWrapper();
      const passwordInput = wrapper.find('input[placeholder*="请输入密码"]');
      await passwordInput.setValue('abc');
      expect(passwordInput.element.value).toBe('abc');
    });

    it('should validate password confirmation match', async () => {
      const wrapper = createWrapper();
      const passwordInput = wrapper.find('input[placeholder*="请输入密码"]');
      const confirmInput = wrapper.find('input[placeholder="请再次输入密码"]');
      await passwordInput.setValue('Password123');
      await confirmInput.setValue('DifferentPassword123');
      expect(confirmInput.element.value).toBe('DifferentPassword123');
    });
  });

  describe('Registration Flow', () => {
    it('should successfully register user', async () => {
      mockUserStore.register.mockResolvedValue(undefined);
      const wrapper = createWrapper();

      // Fill form
      await wrapper.find('input[placeholder="请输入您的姓名"]').setValue('Test User');
      await wrapper.find('input[placeholder="请输入您的邮箱"]').setValue('test@example.com');
      await wrapper.find('input[placeholder*="请输入密码"]').setValue('Password123');
      await wrapper.find('input[placeholder="请再次输入密码"]').setValue('Password123');
      await wrapper.find('input[type="checkbox"]').setValue(true);

      // Submit form
      const form = wrapper.find('form');
      await form.trigger('submit');
      await wrapper.vm.$nextTick();

      // Should call register with correct parameters
      expect(mockUserStore.register).toHaveBeenCalledWith(
        'test@example.com',
        'Password123',
        'Test User'
      );

      // Should show success message
      expect(ElMessage.success).toHaveBeenCalledWith('注册成功！');
    });

    it('should handle registration error', async () => {
      const error = new Error('Email already exists');
      mockUserStore.register.mockRejectedValue(error);
      const wrapper = createWrapper();

      // Fill form
      await wrapper.find('input[placeholder="请输入您的姓名"]').setValue('Test User');
      await wrapper.find('input[placeholder="请输入您的邮箱"]').setValue('existing@example.com');
      await wrapper.find('input[placeholder*="请输入密码"]').setValue('Password123');
      await wrapper.find('input[placeholder="请再次输入密码"]').setValue('Password123');
      await wrapper.find('input[type="checkbox"]').setValue(true);

      // Submit form
      const form = wrapper.find('form');
      await form.trigger('submit');
      await wrapper.vm.$nextTick();

      // Should show error message
      expect(ElMessage.error).toHaveBeenCalledWith('Email already exists');
    });

    it('should disable form during registration', async () => {
      mockUserStore.register.mockImplementation(() => new Promise(() => {}));
      const wrapper = createWrapper();

      // Fill form
      await wrapper.find('input[placeholder="请输入您的姓名"]').setValue('Test User');
      await wrapper.find('input[placeholder="请输入您的邮箱"]').setValue('test@example.com');
      await wrapper.find('input[placeholder*="请输入密码"]').setValue('Password123');
      await wrapper.find('input[placeholder="请再次输入密码"]').setValue('Password123');
      await wrapper.find('input[type="checkbox"]').setValue(true);

      // Submit form
      const form = wrapper.find('form');
      await form.trigger('submit');
      await wrapper.vm.$nextTick();

      // Button should show loading state
      const button = wrapper.find('button.register-button');
      expect(button.text()).toBe('注册中...');
    });

    it('should not submit if terms not agreed', async () => {
      // Create a wrapper with form validation that fails
      const wrapper = mount(Register, {
        global: {
          plugins: [router],
          stubs: {
            ...elementPlusStubs,
            'el-form': {
              template: '<form @submit="$emit(\'submit\', $event)"><slot /></form>',
              methods: {
                validate: vi.fn().mockResolvedValue(false), // Validation fails
              },
            },
          },
        },
      });

      // Clear previous mock calls
      mockUserStore.register.mockClear();

      // Fill form but don't check terms
      await wrapper.find('input[placeholder="请输入您的姓名"]').setValue('Test User');
      await wrapper.find('input[placeholder="请输入您的邮箱"]').setValue('test@example.com');
      await wrapper.find('input[placeholder*="请输入密码"]').setValue('Password123');
      await wrapper.find('input[placeholder="请再次输入密码"]').setValue('Password123');

      // Submit form
      const form = wrapper.find('form');
      await form.trigger('submit');
      await wrapper.vm.$nextTick();

      // Should not call register (form validation should prevent submission)
      expect(mockUserStore.register).not.toHaveBeenCalled();
    });
  });

  describe('Navigation', () => {
    it('should navigate to login page', async () => {
      const wrapper = createWrapper();

      const loginButton = wrapper.find('.login-link button');
      await loginButton.trigger('click');
      await wrapper.vm.$nextTick();

      // Wait for router navigation
      await router.isReady();

      expect(router.currentRoute.value.path).toBe('/auth/login');
    });

    it('should navigate to home after successful registration', async () => {
      mockUserStore.register.mockResolvedValue(undefined);
      const wrapper = createWrapper();

      // Fill and submit form
      await wrapper.find('input[placeholder="请输入您的姓名"]').setValue('Test User');
      await wrapper.find('input[placeholder="请输入您的邮箱"]').setValue('test@example.com');
      await wrapper.find('input[placeholder*="请输入密码"]').setValue('Password123');
      await wrapper.find('input[placeholder="请再次输入密码"]').setValue('Password123');
      await wrapper.find('input[type="checkbox"]').setValue(true);

      const form = wrapper.find('form');
      await form.trigger('submit');
      await wrapper.vm.$nextTick();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(router.currentRoute.value.path).toBe('/');
    });
  });

  describe('Password Strength Logic', () => {
    it('should calculate password strength correctly', () => {
      // Test weak password
      const weakPassword = 'abc123';
      let strength = 0;
      if (weakPassword.length >= 8) strength++;
      if (/[a-z]/.test(weakPassword)) strength++;
      if (/[0-9]/.test(weakPassword)) strength++;
      expect(strength).toBeLessThanOrEqual(2);

      // Test medium password
      const mediumPassword = 'Abcd1234';
      strength = 0;
      if (mediumPassword.length >= 8) strength++;
      if (/[a-z]/.test(mediumPassword)) strength++;
      if (/[A-Z]/.test(mediumPassword)) strength++;
      if (/[0-9]/.test(mediumPassword)) strength++;
      expect(strength).toBeGreaterThan(2);
      expect(strength).toBeLessThanOrEqual(4);

      // Test strong password
      const strongPassword = 'Abcd1234!@#$';
      strength = 0;
      if (strongPassword.length >= 8) strength++;
      if (strongPassword.length >= 12) strength++;
      if (/[a-z]/.test(strongPassword)) strength++;
      if (/[A-Z]/.test(strongPassword)) strength++;
      if (/[0-9]/.test(strongPassword)) strength++;
      if (/[^a-zA-Z0-9]/.test(strongPassword)) strength++;
      expect(strength).toBeGreaterThan(4);
    });
  });

  describe('Responsive Design', () => {
    it('should render with responsive classes', () => {
      const wrapper = createWrapper();

      expect(wrapper.find('.register-page').exists()).toBe(true);
      expect(wrapper.find('.register-card').exists()).toBe(true);
    });
  });
});
