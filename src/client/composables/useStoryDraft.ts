import { ref, watch, type Ref } from 'vue';

export function useStoryDraft(key: Readonly<Ref<string | null>>) {
  const text = ref('');
  const restored = ref(false);
  const storageAvailable = ref(true);
  const memory = new Map<string, string>();
  let activeKey: string | null = null;

  function read(storageKey: string): string {
    try {
      return sessionStorage.getItem(storageKey) ?? '';
    } catch {
      storageAvailable.value = false;
      return memory.get(storageKey) ?? '';
    }
  }

  function write(storageKey: string, value: string) {
    memory.set(storageKey, value);
    try {
      if (value) sessionStorage.setItem(storageKey, value);
      else sessionStorage.removeItem(storageKey);
      storageAvailable.value = true;
    } catch {
      storageAvailable.value = false;
    }
  }

  watch(key, (storageKey) => {
    activeKey = null;
    text.value = storageKey ? (memory.get(storageKey) ?? read(storageKey)) : '';
    restored.value = Boolean(text.value);
    activeKey = storageKey;
  }, { immediate: true, flush: 'sync' });

  watch(text, (value) => {
    restored.value = false;
    if (activeKey) write(activeKey, value);
  }, { flush: 'sync' });

  function captureAcknowledgement(): () => void {
    const storageKey = activeKey;
    const submitted = text.value;
    return () => {
      if (storageKey) {
        if (read(storageKey) !== submitted) return;
        write(storageKey, '');
      }
      if (storageKey === activeKey && text.value === submitted) {
        text.value = '';
        restored.value = false;
      }
    };
  }

  return { text, restored, storageAvailable, captureAcknowledgement };
}
