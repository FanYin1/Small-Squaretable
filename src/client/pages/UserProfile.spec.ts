import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import UserProfile from './UserProfile.vue';

const mockGetFollowStatus = vi.fn();
const mockApiGet = vi.fn();
const mockFetchUserActivities = vi.fn();

vi.mock('@client/services/social.api', () => ({
  socialApi: {
    getFollowStatus: (...args: unknown[]) => mockGetFollowStatus(...args),
    getFollowers: vi.fn().mockResolvedValue([]),
    getFollowing: vi.fn().mockResolvedValue([]),
    getUserFavorites: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@client/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@client/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@client/components/layout/DashboardLayout.vue', () => ({
  default: {
    name: 'DashboardLayout',
    template: '<div class="mock-layout"><slot /><slot name="title" /></div>',
  },
}));

vi.mock('@client/components/social/FollowButton.vue', () => ({
  default: {
    name: 'FollowButton',
    template: '<button class="follow-btn">Follow</button>',
    props: ['userId'],
  },
}));

vi.mock('@client/components/social/ActivityItem.vue', () => ({
  default: {
    name: 'ActivityItem',
    template: '<div class="activity-item" />',
    props: ['activity'],
  },
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: { userId: 'test-user-id' },
  }),
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const enUS = {
  social: {
    userProfile: 'User Profile',
    followers: 'Followers',
    followings: 'Following',
    characters: 'Characters',
    favorites: 'Favorites',
    noCharacters: 'No characters',
    noFavorites: 'No favorites',
    noFavoritesOther: 'Private favorites',
    userNotFound: 'User not found',
    loadFailed: 'Failed to load',
    followersTab: 'Followers',
    followingTab: 'Following',
    activityTab: 'Activity',
    noActivity: 'No activity',
    noFollowers: 'No followers',
    noFollowing: 'No following',
  },
  userProfile: {
    title: 'User Profile',
    joinedAt: 'Joined {date}',
    editProfile: 'Edit Profile',
    notFound: 'User not found',
    noCharacters: 'No public characters yet',
  },
  market: {
    noDescription: 'No description',
    startChat: 'Start Chat',
  },
};

function createWrapper() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: { 'en-US': enUS },
  });

  return mount(UserProfile, {
    global: {
      plugins: [pinia, i18n],
      stubs: {
        ElAvatar: { template: '<span class="el-avatar"><slot /></span>', props: ['src', 'size'] },
        ElTabs: { template: '<div class="el-tabs"><slot /></div>', props: ['modelValue'], emits: ['update:modelValue', 'tab-change'] },
        ElTabPane: { template: '<div class="el-tab-pane" :data-name="name"><slot /></div>', props: ['label', 'name'] },
        ElButton: { template: '<button @click="$emit(\'click\')"><slot /></button>', props: ['type', 'size', 'icon'], emits: ['click'] },
        ElIcon: { template: '<i><slot /></i>' },
        ElTag: { template: '<span class="el-tag"><slot /></span>' },
        RouterLink: { template: '<a class="router-link"><slot /></a>', props: ['to'] },
        Star: { template: '<span />' },
        ChatDotRound: { template: '<span />' },
        Picture: { template: '<span />' },
        UserFilled: { template: '<span />' },
      },
    },
  });
}

describe('UserProfile Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders profile with displayName and bio', async () => {
    mockGetFollowStatus.mockResolvedValue({
      isFollowing: false,
      followerCount: 10,
      followingCount: 5,
    });
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/profile')) {
        return Promise.resolve({
          id: 'test-user-id',
          displayName: 'Test User',
          avatarUrl: null,
          bio: 'Hello, I am a test user!',
          createdAt: '2026-01-15T00:00:00Z',
        });
      }
      if (url.includes('/marketplace')) {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve([]);
    });

    const wrapper = createWrapper();
    await flushPromises();

    expect(wrapper.find('.profile-name').text()).toBe('Test User');
    expect(wrapper.find('.profile-bio').exists()).toBe(true);
    expect(wrapper.find('.profile-bio').text()).toBe('Hello, I am a test user!');
    expect(wrapper.find('.stat-count').text()).toContain('10');
  });

  it('shows character list when characters are loaded', async () => {
    mockGetFollowStatus.mockResolvedValue({
      isFollowing: false,
      followerCount: 3,
      followingCount: 1,
    });
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/profile')) {
        return Promise.resolve({
          id: 'test-user-id',
          displayName: 'Creator',
          avatarUrl: null,
          bio: null,
          createdAt: '2026-01-01T00:00:00Z',
        });
      }
      if (url.includes('/marketplace')) {
        return Promise.resolve([
          {
            id: 'char-1',
            name: 'Test Character',
            description: 'A cool character',
            avatar: null,
            isPublic: true,
            createdAt: '2026-01-01T00:00:00Z',
          },
          {
            id: 'char-2',
            name: 'Another Character',
            description: 'Another one',
            avatar: null,
            isPublic: true,
            createdAt: '2026-01-02T00:00:00Z',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const wrapper = createWrapper();
    await flushPromises();

    expect(wrapper.find('.profile-name').text()).toBe('Creator');
    const cards = wrapper.findAll('.character-mini-card');
    expect(cards).toHaveLength(2);
    expect(wrapper.find('.character-name').text()).toBe('Test Character');
  });
});
