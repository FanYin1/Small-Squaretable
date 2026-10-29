import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { useStoryReadingPosition } from './useStoryReadingPosition';

describe('independent story reading positions', () => {
  const wrappers: ReturnType<typeof mount>[] = [];
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  });
  afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  function create(keyValue: string | null = 'story-position:owner:main', initialMessages = ['3', '4']) {
    const key = ref<string | null>(keyValue);
    const loading = ref(false);
    const container = ref<HTMLElement | null>(null);
    const messages = ref(initialMessages.map(id => ({ id })));
    const following = ref(true);
    const setTop = vi.fn();
    const latest = vi.fn();
    const loadOlder = vi.fn(async () => { messages.value = [{ id: '1' }, { id: '2' }, ...messages.value]; });
    let position!: ReturnType<typeof useStoryReadingPosition>;
    const wrapper = mount(defineComponent({ setup() {
      position = useStoryReadingPosition({ key, loading, container, messages, hasMore: () => messages.value[0]?.id !== '1', loadOlder,
        height: () => 100, setTop, setFollowing: value => { following.value = value; }, latest });
      return { container };
    }, template: '<div ref="container"><div data-message-id="2">原文</div></div>' }));
    wrappers.push(wrapper);
    return { key, container, messages, following, setTop, latest, loadOlder, position };
  }
  it('loads older pages to restore an anchor and keeps independent story/account keys', async () => {
    sessionStorage.setItem('story-position:owner:main', JSON.stringify({ messageId: '2', offset: 15, latest: false }));
    const state = create();
    await flushPromises();
    expect(state.loadOlder).toHaveBeenCalledOnce();
    expect(state.setTop).toHaveBeenCalledWith(115);
    expect(state.following.value).toBe(false);
    state.key.value = 'story-position:owner:child';
    await flushPromises();
    expect(state.latest).toHaveBeenCalledOnce();
    state.key.value = 'story-position:another-owner:main';
    await flushPromises();
    expect(state.latest).toHaveBeenCalledTimes(2);
    expect(JSON.parse(sessionStorage.getItem('story-position:owner:main')!).messageId).toBe('2');
  });
  it('ignores a late pagination response after changing stories', async () => {
    sessionStorage.setItem('story-position:owner:main', JSON.stringify({ messageId: '1', offset: 0, latest: false }));
    const state = create();
    let release!: () => void;
    state.loadOlder.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    await flushPromises();
    state.key.value = 'story-position:owner:child';
    release();
    await flushPromises();
    expect(state.setTop).not.toHaveBeenCalled();
    expect(state.following.value).toBe(true);
  });
  it('reports a missing anchor without silently jumping to latest', async () => {
    sessionStorage.setItem('story-position:owner:main', JSON.stringify({ messageId: '999', offset: 0, latest: false }));
    const state = create(undefined, ['1', '2']);
    await flushPromises();
    expect(state.position.notice.value).toContain('暂不可用');
    expect(state.latest).not.toHaveBeenCalled();
  });
  it('keeps following available without an account key and restores normally once it arrives', async () => {
    const state = create(null);
    await flushPromises();
    expect(state.position.restoring.value).toBe(false);
    expect(state.following.value).toBe(true);
    expect(state.latest).toHaveBeenCalledOnce();
    sessionStorage.setItem('story-position:owner:main', JSON.stringify({ messageId: '2', offset: 15, latest: false }));
    state.key.value = 'story-position:owner:main';
    await flushPromises();
    expect(state.setTop).toHaveBeenCalledWith(115);
    expect(state.following.value).toBe(false);
  });
  it('returns to latest immediately and ignores a late restoration after the player cancels', async () => {
    sessionStorage.setItem('story-position:owner:main', JSON.stringify({ messageId: '1', offset: 0, latest: false }));
    const state = create();
    let release!: () => void;
    state.loadOlder.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    await flushPromises();
    expect(state.position.restoring.value).toBe(true);
    state.position.returnToLatest();
    expect(state.position.restoring.value).toBe(false);
    expect(state.following.value).toBe(true);
    release();
    await flushPromises();
    expect(state.setTop).not.toHaveBeenCalled();
    expect(state.latest).toHaveBeenCalledOnce();
    expect(state.position.notice.value).toBe('');
  });
  it('contains a pagination failure and lets the player explicitly resume latest', async () => {
    sessionStorage.setItem('story-position:owner:main', JSON.stringify({ messageId: '1', offset: 0, latest: false }));
    const state = create();
    state.loadOlder.mockRejectedValue(new Error('offline'));
    await flushPromises();
    expect(state.position.restoring.value).toBe(false);
    expect(state.following.value).toBe(false);
    expect(state.position.notice.value).toContain('暂时无法恢复');
    expect(state.latest).not.toHaveBeenCalled();
    state.position.returnToLatest();
    expect(state.position.notice.value).toBe('');
    expect(state.latest).toHaveBeenCalledOnce();
  });
});
