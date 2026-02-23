import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import Profile from './Profile.vue';
import { useUserStore } from '@client/stores/user';

const mockUpdateProfile = vi.fn();

vi.mock('@client/services/user.api', () => ({
  userApi: {
    updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
  },
}));

vi.mock('@client/services', () => ({
  authApi: {
    getMe: vi.fn().mockResolvedValue({ user: {} }),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    mfaChallenge: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
  csrfTokenManager: { clearToken: vi.fn() },
}));

vi.mock('@client/components/layout/DashboardLayout.vue', () => ({
  default: {
    name: 'DashboardLayout',
    template: '<div class="mock-layout"><slot /><slot name="title" /></div>',
  },
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {} }),
  useRouter: () => ({ push: vi.fn() }),
}));

const enUS = {
  profile: {
    title: 'Edit Profile',
    displayName: 'Display Name',
    bio: 'Bio',
    bioPlaceholder: 'Tell others about yourself...',
    avatar: 'Avatar',
    uploadAvatar: 'Upload Avatar',
    updateSuccess: 'Profile updated',
    viewPublicProfile: 'View Public Profile',
    invalidImageType: 'Invalid image type',
    avatarTooLarge: 'Image must be under 5MB',
  },
  common: {
    save: 'Save',
    retry: 'Please try again later',
  },
};

const testUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  avatar: 'https://example.com/avatar.png',
  bio: 'Hello world',
  tenantId: 'tenant-1',
  createdAt: '2026-01-01T00:00:00Z',
};

function createWrapper() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: { 'en-US': enUS },
  });

  // Pre-populate user store
  const userStore = useUserStore();
  userStore.user = { ...testUser };

  return mount(Profile, {
    global: {
      plugins: [pinia, i18n],
      stubs: {
        ElForm: { template: '<form class="el-form"><slot /></form>', props: ['labelPosition'] },
        ElFormItem: { template: '<div class="el-form-item"><label>{{ label }}</label><slot /></div>', props: ['label'] },
        ElInput: {
          template: '<input class="el-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
          props: ['modelValue', 'type', 'rows', 'maxlength', 'showWordLimit', 'placeholder'],
          emits: ['update:modelValue'],
        },
        ElButton: {
          template: '<button class="el-button" :class="{ \'is-loading\': loading }" @click="$emit(\'click\')"><slot /></button>',
          props: ['type', 'loading'],
          emits: ['click'],
        },
        ElMessage: { template: '<span />' },
        RouterLink: { template: '<a class="router-link"><slot /></a>', props: ['to'] },
      },
    },
  });
}

describe('Profile Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateProfile.mockResolvedValue({});
  });

  it('renders form with user data pre-filled', async () => {
    const wrapper = createWrapper();
    await flushPromises();

    // Check that the avatar image is rendered with the user's avatar
    const img = wrapper.find('.avatar-image');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/avatar.png');

    // Check the title slot renders
    expect(wrapper.text()).toContain('Edit Profile');
  });

  it('calls updateProfile API on save', async () => {
    const wrapper = createWrapper();
    await flushPromises();

    // Find the save button (the primary one)
    const buttons = wrapper.findAll('.el-button');
    const saveButton = buttons.find(b => b.text().includes('Save'));
    expect(saveButton).toBeDefined();

    await saveButton!.trigger('click');
    await flushPromises();

    expect(mockUpdateProfile).toHaveBeenCalledWith({
      displayName: 'Test User',
      bio: 'Hello world',
      avatarUrl: 'https://example.com/avatar.png',
    });
  });
});
