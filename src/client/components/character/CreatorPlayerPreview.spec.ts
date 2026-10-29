import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CreatorPlayerPreview from './CreatorPlayerPreview.vue';

const form = { name: 'Harbor', description: 'Public introduction', category: 'game', tags: ['Mystery'], isNsfw: false, personality: 'SECRET personality', scenario: 'SECRET background', systemPrompt: 'SECRET instructions', firstMessage: 'Hello {{user}}', alternateGreetings: ['<script>window.attack()</script>Evening {{char}}\n<VariableInsert>SECRET state</VariableInsert>'], exampleMessages: 'SECRET examples', creatorNotes: 'SECRET notes', avatarUrl: '' };
describe('static player preview', () => {
  it('only renders public fields, strips scripts/control blocks and follows selected opening', async () => {
    const wrapper = mount(CreatorPlayerPreview, { props: { form, selectedOpening: 1 } });
    expect(wrapper.text()).not.toContain('SECRET');
    await wrapper.findAll('button')[2].trigger('click');
    expect(wrapper.text()).toContain('Evening Harbor');
    expect(wrapper.text()).not.toContain('SECRET');
    expect(wrapper.html()).not.toContain('<script');
    expect(wrapper.text()).not.toContain('window.attack');
    await wrapper.setProps({ selectedOpening: 0 });
    expect(wrapper.text()).toContain('Hello 你');
    wrapper.unmount();
  });
  it('keeps complete long prose and has a real missing-cover fallback', async () => {
    const long = `${'场景'.repeat(9000)}最后一句`;
    const wrapper = mount(CreatorPlayerPreview, { props: { form: { ...form, firstMessage: long, avatarUrl: '/missing.png' }, selectedOpening: 0 } });
    await wrapper.get('img').trigger('error');
    expect(wrapper.find('img').exists()).toBe(false);
    await wrapper.findAll('button')[2].trigger('click');
    expect(wrapper.get('.preview-prose').text()).toBe(long);
    wrapper.unmount();
  });
});
