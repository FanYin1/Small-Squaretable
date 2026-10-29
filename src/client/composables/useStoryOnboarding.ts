import { ref, watch, type Ref } from 'vue';

export function useStoryOnboarding(owner: Readonly<Ref<string | null>>) {
  const visible = ref(false);
  const step = ref(0);
  const dismissed = new Set<string>();
  const key = () => owner.value ? `story-onboarding:v1:${owner.value}` : null;
  watch(owner, () => {
    step.value = 0;
    const current = key();
    visible.value = false;
    if (!current || dismissed.has(current)) return;
    try { visible.value = localStorage.getItem(current) !== 'done'; }
    catch { visible.value = true; }
  }, { immediate: true });
  function dismiss() {
    const current = key();
    if (!current) return;
    dismissed.add(current);
    try { localStorage.setItem(current, 'done'); } catch { visible.value = false; }
    visible.value = false;
  }
  function next() { if (step.value < 2) step.value += 1; else dismiss(); }
  return { visible, step, next, dismiss };
}
