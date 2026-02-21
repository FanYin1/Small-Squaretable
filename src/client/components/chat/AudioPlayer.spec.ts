import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import AudioPlayer from './AudioPlayer.vue';
import i18n from '../../i18n';

// Mock HTMLAudioElement
const mockPlay = vi.fn().mockResolvedValue(undefined);
const mockPause = vi.fn();
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();

vi.stubGlobal('Audio', vi.fn(function (this: Record<string, unknown>) {
  this.play = mockPlay;
  this.pause = mockPause;
  this.addEventListener = mockAddEventListener;
  this.removeEventListener = mockRemoveEventListener;
  this.currentTime = 0;
  this.duration = 0;
  this.playbackRate = 1;
}));

function createWrapper(props: { src: string; duration?: number } = { src: '/audio/test.mp3' }) {
  return mount(AudioPlayer, {
    props,
    global: {
      plugins: [i18n],
      stubs: {
        'el-icon': { template: '<span><slot /></span>' },
        VideoPlay: { template: '<i class="icon-play" />' },
        VideoPause: { template: '<i class="icon-pause" />' },
      },
    },
  });
}

describe('AudioPlayer', () => {
  it('renders with src prop', () => {
    const wrapper = createWrapper({ src: '/audio/test.mp3' });
    expect(wrapper.find('.audio-player').exists()).toBe(true);
    expect(wrapper.find('.play-btn').exists()).toBe(true);
    expect(wrapper.find('.progress-bar').exists()).toBe(true);
    expect(wrapper.find('.time').exists()).toBe(true);
    expect(wrapper.find('.speed-btn').exists()).toBe(true);
  });

  it('shows play button initially (not pause)', () => {
    const wrapper = createWrapper();
    expect(wrapper.find('.icon-play').exists()).toBe(true);
    expect(wrapper.find('.icon-pause').exists()).toBe(false);
    expect(wrapper.find('.play-btn').attributes('aria-label')).toBe('Play');
  });

  it('formatTime helper works correctly', () => {
    const wrapper = createWrapper();
    const vm = wrapper.vm as unknown as { formatTime: (s: number) => string };
    expect(vm.formatTime(0)).toBe('0:00');
    expect(vm.formatTime(65)).toBe('1:05');
    expect(vm.formatTime(3661)).toBe('61:01');
  });

  it('speed button cycles through 1x -> 1.5x -> 2x -> 1x', async () => {
    const wrapper = createWrapper();
    const speedBtn = wrapper.find('.speed-btn');

    expect(speedBtn.text()).toBe('1x');

    await speedBtn.trigger('click');
    expect(speedBtn.text()).toBe('1.5x');

    await speedBtn.trigger('click');
    expect(speedBtn.text()).toBe('2x');

    await speedBtn.trigger('click');
    expect(speedBtn.text()).toBe('1x');
  });

  it('displays duration from prop when audio not loaded', () => {
    const wrapper = createWrapper({ src: '/audio/test.mp3', duration: 120 });
    expect(wrapper.find('.time').text()).toContain('0:00');
    expect(wrapper.find('.time').text()).toContain('2:00');
  });

  it('toggles play/pause on button click', async () => {
    const wrapper = createWrapper();
    const playBtn = wrapper.find('.play-btn');

    await playBtn.trigger('click');
    expect(wrapper.find('.icon-pause').exists()).toBe(true);
    expect(wrapper.find('.icon-play').exists()).toBe(false);
    expect(playBtn.attributes('aria-label')).toBe('Pause');

    await playBtn.trigger('click');
    expect(wrapper.find('.icon-play').exists()).toBe(true);
    expect(wrapper.find('.icon-pause').exists()).toBe(false);
    expect(playBtn.attributes('aria-label')).toBe('Play');
  });
});
