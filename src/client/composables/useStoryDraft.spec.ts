import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { useStoryDraft } from './useStoryDraft';

describe('story drafts', () => {
  const scopes: ReturnType<typeof effectScope>[] = [];
  function createDraft(initialKey = 'story-draft:account-a:story-a') {
    const key = ref<string | null>(initialKey);
    const scope = effectScope();
    scopes.push(scope);
    return { key, ...scope.run(() => useStoryDraft(key))! };
  }

  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    scopes.splice(0).forEach(scope => scope.stop());
    vi.restoreAllMocks();
  });

  it('restores text after remounting and isolates accounts and stories', () => {
    const draft = createDraft();
    draft.text.value = '我翻开车票';
    draft.key.value = 'story-draft:account-a:story-b';
    expect(draft.text.value).toBe('');
    draft.text.value = '另一段故事';
    draft.key.value = 'story-draft:account-b:story-a';
    expect(draft.text.value).toBe('');
    draft.key.value = null;
    expect(draft.text.value).toBe('');
    const restored = createDraft();
    expect(restored.text.value).toBe('我翻开车票');
    expect(restored.restored.value).toBe(true);
  });

  it('keeps a submitted draft until acceptance and removes it once accepted', () => {
    const draft = createDraft();
    draft.text.value = '  尚未确认的消息  ';
    const accept = draft.captureAcknowledgement();
    expect(createDraft().text.value).toBe('  尚未确认的消息  ');
    accept();
    expect(draft.text.value).toBe('');
    expect(createDraft().text.value).toBe('');
    accept();
    expect(draft.text.value).toBe('');
  });

  it('does not erase newer text when an older send is accepted', () => {
    const draft = createDraft();
    draft.text.value = '第一句';
    const accept = draft.captureAcknowledgement();
    draft.text.value = '修改后的草稿';
    accept();
    expect(draft.text.value).toBe('修改后的草稿');
    expect(createDraft().text.value).toBe('修改后的草稿');
  });

  it('clears only the submitted story after switching', () => {
    const draft = createDraft();
    draft.text.value = '旧故事';
    const accept = draft.captureAcknowledgement();
    draft.key.value = 'story-draft:account-a:story-b';
    draft.text.value = '新故事';
    accept();
    expect(draft.text.value).toBe('新故事');
    draft.key.value = 'story-draft:account-a:story-a';
    expect(draft.text.value).toBe('');
  });

  it('protects a replacement component’s draft from a late acceptance', () => {
    const draft = createDraft();
    draft.text.value = '旧草稿';
    const accept = draft.captureAcknowledgement();
    scopes[0].stop();
    const replacement = createDraft();
    replacement.text.value = '新草稿';
    accept();
    expect(createDraft().text.value).toBe('新草稿');
  });

  it('retains editable text in memory when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const draft = createDraft();
    draft.text.value = '不会丢掉的输入';
    expect(draft.storageAvailable.value).toBe(false);
    draft.key.value = 'story-draft:account-a:story-b';
    draft.key.value = 'story-draft:account-a:story-a';
    expect(draft.text.value).toBe('不会丢掉的输入');
  });
});
