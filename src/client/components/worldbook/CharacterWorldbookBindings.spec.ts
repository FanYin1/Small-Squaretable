import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import i18n from '../../i18n';
import CharacterWorldbookBindings from './CharacterWorldbookBindings.vue';
import { characterWorldbookApi } from '../../services/character-worldbook.api';

vi.mock('../../services/character-worldbook.api', () => ({ characterWorldbookApi: { list: vi.fn(), change: vi.fn() } }));

const free = { id: 'free-book', name: 'Harbor lore', characterId: null, scope: 'global', isEnabled: true, entryCount: 1, enabledEntryCount: 1 };
const linked = { ...free, id: 'bound-book', characterId: 'character', scope: 'character' };
const render = () => mount(CharacterWorldbookBindings, { props: { characterId: 'character' }, global: {
  plugins: [i18n], stubs: { RouterLink: { template: '<a><slot /></a>' } },
} });

describe('character worldbook binding controls', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(characterWorldbookApi.list).mockResolvedValue({ books: [free, linked, { ...free, id: 'elsewhere', characterId: 'other' }, { ...free, id: 'persona-book', scope: 'persona' }], dependencies: [] });
    vi.mocked(characterWorldbookApi.change).mockResolvedValue(undefined);
  });
  it('requires selection and explicit save, excluding books bound elsewhere', async () => {
    const wrapper = render();
    await flushPromises();
    expect(wrapper.findAll('option')).toHaveLength(2);
    await wrapper.get('select').setValue('free-book');
    expect(characterWorldbookApi.change).not.toHaveBeenCalled();
    await wrapper.get('.binding-controls button').trigger('click');
    await flushPromises();
    expect(characterWorldbookApi.change).toHaveBeenCalledWith('character', 'free-book', 'bind', null);
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
  });
  it('sends the expected binding when removing a reference', async () => {
    const wrapper = render();
    await flushPromises();
    await wrapper.get('.bound-books button').trigger('click');
    await flushPromises();
    expect(characterWorldbookApi.change).toHaveBeenCalledWith('character', 'bound-book', 'unbind', 'character');
  });
  it('does not show saved or allow blind retry after an uncertain failure', async () => {
    vi.mocked(characterWorldbookApi.change).mockRejectedValue(new Error('Conflict'));
    const wrapper = render();
    await flushPromises();
    await wrapper.get('select').setValue('free-book');
    await wrapper.get('.binding-controls button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.find('select').exists()).toBe(false);
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('select').exists()).toBe(true);
    expect(characterWorldbookApi.change).toHaveBeenCalledTimes(1);
  });
  it('discards a stale load when the current character changes', async () => {
    let finish!: (value: Awaited<ReturnType<typeof characterWorldbookApi.list>>) => void;
    vi.mocked(characterWorldbookApi.list).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const wrapper = render();
    await wrapper.setProps({ characterId: 'other' });
    await flushPromises();
    finish({ books: [{ ...free, name: 'STALE_REFERENCE' }], dependencies: [] });
    await flushPromises();
    expect(wrapper.text()).not.toContain('STALE_REFERENCE');
  });
});
