import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ExpressionSprite from './ExpressionSprite.vue';

describe('ExpressionSprite', () => {
  it('renders sprite image for matching emotion', () => {
    const wrapper = mount(ExpressionSprite, {
      props: {
        expressions: {
          happy: '/sprites/happy.png',
          sad: '/sprites/sad.png',
          neutral: '/sprites/neutral.png',
        },
        emotionLabel: 'happy',
      },
    });

    expect(wrapper.find('.expression-sprite').exists()).toBe(true);
    const img = wrapper.find('.sprite-image');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('/sprites/happy.png');
    expect(img.attributes('alt')).toBe('happy');
  });

  it('falls back to neutral when emotion not found', () => {
    const wrapper = mount(ExpressionSprite, {
      props: {
        expressions: {
          happy: '/sprites/happy.png',
          neutral: '/sprites/neutral.png',
        },
        emotionLabel: 'angry',
      },
    });

    const img = wrapper.find('.sprite-image');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('/sprites/neutral.png');
  });

  it('falls back to default when neither emotion nor neutral found', () => {
    const wrapper = mount(ExpressionSprite, {
      props: {
        expressions: {
          default: '/sprites/default.png',
        },
        emotionLabel: 'angry',
      },
    });

    const img = wrapper.find('.sprite-image');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('/sprites/default.png');
  });

  it('renders nothing when no expressions match (spriteUrl is null)', () => {
    const wrapper = mount(ExpressionSprite, {
      props: {
        expressions: {
          happy: '/sprites/happy.png',
        },
        emotionLabel: 'angry',
      },
    });

    expect(wrapper.find('.expression-sprite').exists()).toBe(false);
    expect(wrapper.find('.sprite-image').exists()).toBe(false);
  });
});
