import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import StoryNextActions from './StoryNextActions.vue';
import { DEFAULT_STORY_RECOMMENDATIONS_LEAD, sourcedStoryRecommendations } from '../../../types/story-recommendations';

const props = { actions: [], recommendations: sourcedStoryRecommendations('').storyRecommendations,
  opening: false, actionBlocked: false, recommendationBlocked: false };

describe('recommendation guidance', () => {
  it('places a plain paragraph before the choices and submits only the chosen input', async () => {
    const lead = '门锁上的划痕值得留意，你也可以选择自己的行动。';
    const wrapper = mount(StoryNextActions, { props: { ...props, lead } });
    expect(wrapper.get('.turn-recommendations').element.firstElementChild?.textContent).toBe(lead);
    expect(wrapper.findAll('.turn-recommendations button')).toHaveLength(3);
    await wrapper.get('.turn-recommendations button').trigger('click');
    expect(wrapper.emitted('suggest')).toEqual([[props.recommendations[0].input]]);
    wrapper.unmount();
  });

  it.each([undefined, '', '<img src=x onerror=alert(1)>', '字'.repeat(121)])('falls back for missing or invalid stored guidance: %j', lead => {
    const wrapper = mount(StoryNextActions, { props: { ...props, lead } });
    expect(wrapper.get('.story-recommendations-lead').text()).toBe(DEFAULT_STORY_RECOMMENDATIONS_LEAD);
    expect(wrapper.find('img').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not add a paragraph to authored actions alone', () => {
    const wrapper = mount(StoryNextActions, { props: { ...props, recommendations: [],
      actions: [{ id: 'look', label: '查看地图', intent: 'observe', version: 0 }] } });
    expect(wrapper.find('.story-recommendations-lead').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps guidance readable while blocking submissions during generation', async () => {
    const wrapper = mount(StoryNextActions, { props: { ...props, recommendationBlocked: true } });
    expect(wrapper.get('.story-recommendations-lead').text()).toBe(DEFAULT_STORY_RECOMMENDATIONS_LEAD);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('suggest')).toBeUndefined();
    wrapper.unmount();
  });
});
