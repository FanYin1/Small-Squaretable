import { describe, it, expect, beforeEach, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useStoryOnboarding } from './useStoryOnboarding';
describe('story onboarding', () => {
  beforeEach(() => localStorage.clear());
  it('allows three inline steps and remembers completion only for the current owner', async () => {
    const scope = effectScope();
    const owner = ref<string | null>('tenant:user');
    const guide = scope.run(() => useStoryOnboarding(owner))!;
    expect(guide.visible.value).toBe(true);
    guide.next(); guide.next();
    expect(guide.step.value).toBe(2);
    guide.next();
    expect(guide.visible.value).toBe(false);
    owner.value = 'tenant:other'; await nextTick();
    expect(guide.visible.value).toBe(true);
    expect(guide.step.value).toBe(0);
    owner.value = 'tenant:user'; await nextTick();
    expect(guide.visible.value).toBe(false);
    owner.value = null; await nextTick();
    expect(guide.visible.value).toBe(false);
    scope.stop();
  });
  it('does not block reading when storage is unavailable', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const scope = effectScope();
    try {
      const guide = scope.run(() => useStoryOnboarding(ref('owner')))!;
      expect(guide.visible.value).toBe(true);
      guide.dismiss();
      expect(guide.visible.value).toBe(false);
    } finally { scope.stop(); read.mockRestore(); write.mockRestore(); }
  });
});
