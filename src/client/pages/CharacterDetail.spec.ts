import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import CharacterDetail from './CharacterDetail.vue';
import i18n from '../i18n';
import type { Character } from '../types';
import type { CreditBalance } from '../services/credits.api';
import { inspectStoryDiagnostics } from '../../types/story-diagnostics';

const actions = vi.hoisted(() => ({
  getCharacter: vi.fn(), getCompatibility: vi.fn(), getBalance: vi.fn(), getRatings: vi.fn(),
  getCollections: vi.fn(), getChat: vi.fn(), push: vi.fn(), back: vi.fn(),
}));
let route: { params: { id: string } };
let user: { isAuthenticated: boolean; user: { id: string; tenantId: string } | null };

vi.mock('@client/services/character.api', () => ({ characterApi: { getCharacter: actions.getCharacter, getCompatibility: actions.getCompatibility } }));
vi.mock('@client/services/chat.api', () => ({ chatApi: { getChat: actions.getChat } }));
vi.mock('@client/services/credits.api', () => ({ creditsApi: { getBalance: actions.getBalance } }));
vi.mock('@client/services/api', () => ({ api: { get: actions.getRatings } }));
vi.mock('@client/services/character-collection.api', () => ({
  characterCollectionApi: { getCollections: actions.getCollections, addCharacters: vi.fn() },
}));
vi.mock('@client/stores/user', () => ({ useUserStore: () => user }));
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => actions }));
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('element-plus');
  return { ...actual, ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } };
});

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Value>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

function story(id = 'story-1'): Character {
  return {
    id, name: id, description: 'A quiet evening by the sea', isPublic: true,
    createdAt: '2026-10-21T00:00:00Z', avatar: '/cover.png',
    cardData: { scenario: 'At the lighthouse', first_mes: '{{char}} greets {{user}}.', personality: 'Curious', creator: 'Author' },
  };
}

const credits: CreditBalance = {
  billingMode: 'credits', tokensPerPoint: 10000, balanceTokens: 50000,
  heldTokens: 10000, availableTokens: 40000, balancePoints: 5, availablePoints: 4,
};

describe('Story detail', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.removeItem('lastChatId');
    route = reactive({ params: { id: 'story-1' } });
    user = reactive({ isAuthenticated: false, user: null });
    actions.getCharacter.mockResolvedValue(story());
    actions.getCompatibility.mockResolvedValue(inspectStoryDiagnostics({}, 'story-1', []));
    actions.getBalance.mockResolvedValue(credits);
    actions.getRatings.mockResolvedValue({ overall: '4.5', count: 2 });
    actions.getCollections.mockResolvedValue([]);
    actions.push.mockResolvedValue(undefined);
  });

  afterEach(() => { wrapper?.unmount(); localStorage.removeItem('lastChatId'); });

  it.each([['story-1', true], ['another-story', false]])('continues only a verified matching story (%s)', async (characterId, matches) => {
    user.user = { id: 'reader', tenantId: 'tenant' };
    user.isAuthenticated = true;
    localStorage.setItem('lastChatId', 'saved-chat');
    actions.getChat.mockResolvedValue({ chat: { id: 'saved-chat', characterId } });
    render();
    await flushPromises();
    expect(wrapper.find('.continue-story-link').exists()).toBe(matches);
    expect(actions.push).not.toHaveBeenCalled();
  });

  function render() {
    wrapper = mount(CharacterDetail, {
      global: {
        plugins: [i18n], directives: { loading: () => {} },
        stubs: {
          ExplorationLayout: { template: '<main><slot name="title" /><slot name="actions" /><slot /></main>' },
          'el-button': { template: '<button><slot /></button>', props: ['icon', 'type', 'loading'] },
          'el-tag': { template: '<span><slot /></span>' },
          'el-icon': { template: '<i><slot /></i>' },
          'el-dropdown': true, 'el-dropdown-menu': true, 'el-dropdown-item': true,
          RatingComponent: true, FavoriteButton: true, CommentSection: true,
          ShareDialog: true, CharacterStats: true, ReportDialog: true,
        },
      },
    });
    return wrapper;
  }

  it('previews story data without starting a chat or requesting guest balance', async () => {
    render();
    expect(wrapper.find('[data-testid="enter-story"]').exists()).toBe(false);
    await flushPromises();
    expect(wrapper.get('h1').text()).toBe('story-1');
    expect(wrapper.get('[data-testid="story-scenario"]').text()).toContain('At the lighthouse');
    expect(wrapper.get('[data-testid="story-opening"]').text()).toContain(`story-1 greets ${i18n.global.t('chat.you')}.`);
    expect(actions.push).not.toHaveBeenCalled();
    expect(actions.getBalance).not.toHaveBeenCalled();
  });

  it('keeps private imports focused on play and hides control data in previews', async () => {
    const card = { ...story(), isPublic: false, creatorId: 'reader' };
    card.cardData!.first_mes = '<VariableInsert>{"secret":42}</VariableInsert><content>“欢迎！”</content>';
    actions.getCharacter.mockResolvedValue(card);
    user.user = { id: 'reader', tenantId: 'tenant' };
    user.isAuthenticated = true;
    render();
    await flushPromises();
    expect(wrapper.get('[data-testid="story-opening"]').text()).toContain('“欢迎！”');
    expect(wrapper.text()).not.toContain('"secret":42');
    expect(wrapper.text()).not.toContain('<content>');
    expect(wrapper.find('.rating-section').exists()).toBe(false);
    expect(wrapper.find('.stats-grid').exists()).toBe(false);
    expect(wrapper.find('comment-section-stub').exists()).toBe(false);
    expect(actions.getRatings).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="enter-story"]').exists()).toBe(true);
  });

  it('previews the playable alternate instead of an author promotion cover', async () => {
    const card = story();
    card.cardData!.first_mes = '本角色卡分享于以下社区。点击右箭头开始正文内容→';
    card.cardData!.alternate_greetings = ['车站里有人向你挥手。'];
    actions.getCharacter.mockResolvedValue(card);
    render();
    await flushPromises();
    expect(wrapper.get('[data-testid="story-opening"]').text()).toContain('车站里有人向你挥手。');
    expect(wrapper.get('[data-testid="story-opening"]').text()).not.toContain('本角色卡分享于以下');
    expect(actions.push).not.toHaveBeenCalled();
  });

  it('puts private play before management and keeps long settings available on demand', async () => {
    actions.getCharacter.mockResolvedValue({ ...story(), isPublic: false, creatorId: 'reader', description: 'A private setting. '.repeat(100) });
    user.user = { id: 'reader', tenantId: 'tenant' };
    user.isAuthenticated = true;
    render();
    await flushPromises();
    expect(wrapper.get('.story-eyebrow').text()).toBe(i18n.global.t('privateLibrary.privateDetail'));
    expect(wrapper.get('.story-summary').text().length).toBeLessThan(200);
    expect(wrapper.get('.introduction-details').attributes('open')).toBeUndefined();
    expect(wrapper.get('.introduction-details p').text()).toContain('A private setting. '.repeat(10).trim());
    expect(wrapper.get('[data-testid="story-opening"]').element.compareDocumentPosition(wrapper.get('#story-management').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await wrapper.get('.private-detail-tools button').trigger('click');
    expect(actions.push).toHaveBeenCalledWith({ name: 'CharacterEdit', params: { id: 'story-1' } });
  });

  it('does not describe a shared private work as visible only to its owner', async () => {
    actions.getCharacter.mockResolvedValue({ ...story(), isPublic: false, shareToken: 'existing-share' });
    render();
    await flushPromises();
    expect(wrapper.get('.story-eyebrow').text()).toBe(i18n.global.t('privateLibrary.sharedDetail'));
  });

  it('does not wait for optional ratings before displaying the story', async () => {
    actions.getRatings.mockReturnValue(new Promise(() => {}));
    render();
    await flushPromises();
    expect(wrapper.get('h1').text()).toBe('story-1');
  });

  it('omits markup-only scenario and handles missing opening and cover', async () => {
    actions.getCharacter.mockResolvedValue({ ...story(), avatar: undefined, cardData: { scenario: '<img src=x onerror=alert(1)>' } });
    render();
    await flushPromises();
    expect(wrapper.find('[data-testid="story-scenario"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="story-opening"]').text()).toContain(i18n.global.t('characterDetail.noOpening'));
    expect(wrapper.get('.story-cover').find('img').exists()).toBe(false);
  });

  it('replaces a broken cover with the title initial', async () => {
    render();
    await flushPromises();
    await wrapper.get('.story-cover img').trigger('error');
    expect(wrapper.get('.story-cover').find('img').exists()).toBe(false);
    expect(wrapper.get('.story-cover').text()).toBe('s');
  });

  it('keeps only the newest story when requests complete out of order', async () => {
    const oldRequest = deferred<Character>();
    actions.getCharacter.mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce(story('story-2'));
    render();
    route.params.id = 'story-2';
    await flushPromises();
    oldRequest.resolve(story());
    await flushPromises();
    expect(wrapper.get('h1').text()).toBe('story-2');
    expect(actions.getRatings).toHaveBeenCalledExactlyOnceWith('/characters/story-2/ratings');
  });

  it('does not let a stale error replace the new story', async () => {
    const oldRequest = deferred<Character>();
    actions.getCharacter.mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce(story('story-2'));
    render();
    route.params.id = 'story-2';
    await flushPromises();
    oldRequest.reject(new Error('Gone'));
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('h1').text()).toBe('story-2');
  });

  it('shows a retryable detail error instead of a stale start action', async () => {
    actions.getCharacter.mockRejectedValueOnce(new Error('Unavailable'));
    render();
    await flushPromises();
    expect(wrapper.find('[data-testid="enter-story"]').exists()).toBe(false);
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.get('h1').text()).toBe('story-1');
  });

  it('navigates to the existing start flow once while navigation is pending', async () => {
    const navigation = deferred<void>();
    actions.push.mockReturnValueOnce(navigation.promise);
    render();
    await flushPromises();
    await wrapper.get('[data-testid="enter-story"]').trigger('click');
    await wrapper.get('[data-testid="enter-story"]').trigger('click');
    expect(actions.push).toHaveBeenCalledExactlyOnceWith({ name: 'Chat', query: { characterId: 'story-1', storyEntry: 'quick' } });
    navigation.resolve();
    await flushPromises();
  });

  it('shows available credits and actual usage guidance', async () => {
    user.isAuthenticated = true;
    user.user = { id: 'user-1', tenantId: 'tenant-1' };
    render();
    await flushPromises();
    expect(wrapper.get('.story-balance').text()).toContain(i18n.global.t('characterDetail.availablePoints', { points: '4' }));
    expect(wrapper.get('.story-balance').text()).toContain(i18n.global.t('characterDetail.costHint'));
    await wrapper.get('.story-balance button').trigger('click');
    expect(actions.push).toHaveBeenCalledWith({ name: 'Subscription' });
  });

  it('does not display credits in subscription mode', async () => {
    user.isAuthenticated = true;
    user.user = { id: 'user-1', tenantId: 'tenant-1' };
    actions.getBalance.mockResolvedValue({ ...credits, billingMode: 'subscription' });
    render();
    await flushPromises();
    expect(wrapper.get('.story-balance').text()).toBe('');
  });

  it('retries a balance failure without showing a fabricated zero', async () => {
    user.isAuthenticated = true;
    user.user = { id: 'user-1', tenantId: 'tenant-1' };
    actions.getBalance.mockRejectedValueOnce(new Error('Unavailable'));
    render();
    await flushPromises();
    expect(wrapper.get('.story-balance').text()).toContain(i18n.global.t('characterDetail.balanceUnavailable'));
    await wrapper.get('.story-balance button').trigger('click');
    await flushPromises();
    expect(wrapper.get('.story-balance').text()).toContain(i18n.global.t('characterDetail.availablePoints', { points: '4' }));
  });

  it('ignores the previous account balance after switching users', async () => {
    user.isAuthenticated = true;
    user.user = { id: 'user-1', tenantId: 'tenant-1' };
    const oldBalance = deferred<CreditBalance>();
    actions.getBalance.mockReturnValueOnce(oldBalance.promise).mockResolvedValueOnce({ ...credits, availablePoints: 9 });
    render();
    await flushPromises();
    user.user = { id: 'user-2', tenantId: 'tenant-2' };
    await flushPromises();
    oldBalance.resolve(credits);
    await flushPromises();
    expect(wrapper.get('.story-balance').text()).toContain(i18n.global.t('characterDetail.availablePoints', { points: '9' }));
  });
});
