import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import FavoriteButton from './FavoriteButton.vue';
import i18n from '@client/i18n';

const actions = vi.hoisted(() => ({ getFavoriteStatus: vi.fn(), favorite: vi.fn(), unfavorite: vi.fn(), push: vi.fn(), error: vi.fn() }));
vi.mock('@client/services/social.api', () => ({ socialApi: actions }));
vi.mock('element-plus', () => ({ ElMessage: { error: actions.error } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: actions.push }), useRoute: () => ({ fullPath: '/market?q=lantern' }) }));
let user: { isAuthenticated: boolean; user: { id: string; tenantId: string } | null };
vi.mock('@client/stores/user', () => ({ useUserStore: () => user }));
let wrapper: VueWrapper;
function render() {
  wrapper = mount(FavoriteButton, {
    props: { characterId: 'char-1', characterName: 'Mara', showCount: false },
    global: { plugins: [i18n], stubs: { ElButton: { template: '<button><slot /></button>' } } },
  });
  return wrapper;
}
beforeEach(() => {
  vi.resetAllMocks();
  user = reactive({ isAuthenticated: true, user: { id: 'user-1', tenantId: 'tenant-1' } });
  actions.getFavoriteStatus.mockResolvedValue({ isFavorited: false, favoriteCount: 0 });
});
afterEach(() => { wrapper?.unmount(); });

describe('FavoriteButton', () => {
  it('blocks duplicate mutations and rolls back a failed favorite', async () => {
    let rejectFavorite!: (reason: Error) => void;
    actions.favorite.mockReturnValue(new Promise((_, reject) => { rejectFavorite = reject; }));
    render();
    await flushPromises();
    await wrapper.get('button').trigger('click');
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true');
    await wrapper.get('button').trigger('click');
    expect(actions.favorite).toHaveBeenCalledTimes(1);
    rejectFavorite(new Error('Offline'));
    await flushPromises();
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false');
    expect(actions.error).toHaveBeenCalledOnce();
  });

  it('retries failed status before permitting any mutation', async () => {
    actions.getFavoriteStatus.mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({ isFavorited: true, favoriteCount: 2 });
    render();
    await flushPromises();
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(actions.favorite).not.toHaveBeenCalled();
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(actions.unfavorite).toHaveBeenCalledWith('char-1');
  });

  it('ignores status and mutation results from a previous card or account', async () => {
    let resolveOld!: (value: unknown) => void;
    actions.getFavoriteStatus.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    render();
    await wrapper.setProps({ characterId: 'char-2' });
    await flushPromises();
    resolveOld({ isFavorited: true, favoriteCount: 100 });
    await flushPromises();
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false');
    let rejectOld!: (reason: Error) => void;
    actions.favorite.mockReturnValueOnce(new Promise((_, reject) => { rejectOld = reject; }));
    await wrapper.get('button').trigger('click');
    user.user = { id: 'user-2', tenantId: 'tenant-1' };
    await flushPromises();
    rejectOld(new Error('Previous account'));
    await flushPromises();
    expect(actions.error).not.toHaveBeenCalled();
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false');
  });

  it('sends guests to login with their current discovery URL', async () => {
    user.isAuthenticated = false;
    user.user = null;
    render();
    await wrapper.get('button').trigger('click');
    expect(actions.getFavoriteStatus).not.toHaveBeenCalled();
    expect(actions.favorite).not.toHaveBeenCalled();
    expect(actions.push).toHaveBeenCalledWith({ name: 'Login', query: { redirect: '/market?q=lantern' } });
  });
});
