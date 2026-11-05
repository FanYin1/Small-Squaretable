import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { RouterLinkStub } from '@vue/test-utils';
import i18n from '../../i18n';
import StoryTools from './StoryTools.vue';

function mountTools(frozen = true, busy = false) {
  return mount(StoryTools, {
    props: { frozen, busy, group: false, hasCharacter: true },
    global: { plugins: [i18n], stubs: { RouterLink: RouterLinkStub } },
  });
}

describe('StoryTools scope', () => {
  it('keeps secondary sections folded and omits legacy overrides from frozen stories', async () => {
    const wrapper = mountTools();
    expect(wrapper.findAll('details').every(section => !section.element.open)).toBe(true);
    expect(wrapper.text()).toContain('不会覆盖这里的进度');
    expect(wrapper.text()).not.toContain(i18n.global.t('chat.parameterTuning'));
    expect(wrapper.text()).not.toContain(i18n.global.t('character.growth'));
    expect(wrapper.findAllComponents(RouterLinkStub).map(link => link.props('to'))).toEqual([
      { name: 'MyCharacters' }, { name: 'WorldBooks' },
    ]);
    const commands = ['memory', 'pinned', 'search', 'context'];
    for (const button of wrapper.findAll('button')) await button.trigger('click');
    expect(wrapper.emitted('select')).toEqual(commands.map(command => [command]));
    wrapper.unmount();
  });

  it('preserves explicit legacy tools but disables parameter edits during generation', async () => {
    const wrapper = mountTools(false, true);
    const tuner = wrapper.findAll('button').find(button => button.text().includes(i18n.global.t('chat.parameterTuning')))!;
    expect(tuner.attributes('disabled')).toBeDefined();
    await tuner.trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
    await wrapper.setProps({ busy: false });
    await tuner.trigger('click');
    expect(wrapper.emitted('select')).toEqual([['tuner']]);
    expect(wrapper.text()).toContain(i18n.global.t('chat.debug'));
    expect(wrapper.text()).toContain(i18n.global.t('character.growth'));
    wrapper.unmount();
  });
});
