import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

type Position = { messageId: string; offset: number; latest: boolean };
type Options = {
  key: Readonly<Ref<string | null>>;
  loading: Readonly<Ref<boolean>>;
  container: Ref<HTMLElement | null>;
  messages: Readonly<Ref<Array<{ id: string }>>>;
  hasMore: () => boolean;
  loadOlder: () => Promise<void>;
  height: (id: string) => number;
  setTop: (top: number) => void;
  setFollowing: (following: boolean) => void;
  latest: () => void;
};

export function useStoryReadingPosition(options: Options) {
  const restoring = ref(false);
  const notice = ref('');
  let ticket = 0;
  let activeKey: string | null = null;
  const memory = new Map<string, Position>();

  function remember() {
    if (!activeKey || restoring.value || options.loading.value || !options.container.value) return;
    const container = options.container.value;
    const top = container.getBoundingClientRect().top;
    const element = [...container.querySelectorAll<HTMLElement>('[data-message-id]')]
      .find(item => item.getBoundingClientRect().bottom > top);
    if (!element?.dataset.messageId) return;
    const position: Position = { messageId: element.dataset.messageId, offset: top - element.getBoundingClientRect().top,
      latest: container.scrollHeight - container.scrollTop - container.clientHeight <= 100 };
    memory.set(activeKey, position);
    try { sessionStorage.setItem(activeKey, JSON.stringify(position)); } catch { notice.value = '阅读位置仅在当前页面暂存。'; }
  }

  async function restore() {
    const current = ++ticket;
    const key = activeKey;
    if (options.loading.value) return;
    if (!key) { returnToLatest(); return; }
    let position = memory.get(key);
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (saved && typeof saved.messageId === 'string' && Number.isFinite(saved.offset) && typeof saved.latest === 'boolean') position = saved;
    } catch { notice.value = '无法读取已保存的阅读位置。'; }
    if (!position || position.latest) { restoring.value = false; options.setFollowing(true); options.latest(); return; }
    restoring.value = true; options.setFollowing(false);
    const unchanged = () => current === ticket && key === activeKey;
    try {
      let pages = 0;
      while (!options.messages.value.some(message => message.id === position!.messageId) && options.hasMore() && pages++ < 250) {
        const previous = options.messages.value[0]?.id;
        await options.loadOlder();
        if (!unchanged()) return;
        if (options.messages.value[0]?.id === previous) break;
      }
      if (!unchanged()) return;
      const index = options.messages.value.findIndex(message => message.id === position!.messageId);
      if (index < 0) { notice.value = '原阅读位置暂不可用；可继续阅读或返回最新。'; return; }
      const top = options.messages.value.slice(0, index).reduce((sum, message) => sum + options.height(message.id), 0);
      options.setTop(top + position.offset);
      await nextTick();
      if (!unchanged() || !options.container.value) return;
      const container = options.container.value;
      container.scrollTop = top + position.offset;
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (!unchanged()) return;
      const element = [...container.querySelectorAll<HTMLElement>('[data-message-id]')].find(item => item.dataset.messageId === position!.messageId);
      if (element) {
        container.scrollTop += element.getBoundingClientRect().top - container.getBoundingClientRect().top + position.offset;
        options.setTop(container.scrollTop);
      }
    } catch {
      if (unchanged()) notice.value = '暂时无法恢复阅读位置，当前内容仍可阅读；也可以返回最新。';
    } finally { if (unchanged()) restoring.value = false; }
  }

  function returnToLatest() {
    ticket++;
    restoring.value = false;
    notice.value = '';
    options.setFollowing(true);
    options.latest();
  }

  watch(options.key, key => { ticket++; activeKey = key; notice.value = ''; restoring.value = Boolean(key); options.setFollowing(!key); }, { immediate: true, flush: 'sync' });
  watch([options.key, options.loading], () => { if (!options.loading.value) void nextTick(restore); }, { immediate: true, flush: 'post' });
  onMounted(() => window.addEventListener('pagehide', remember));
  onBeforeUnmount(() => { remember(); ticket++; window.removeEventListener('pagehide', remember); });
  return { restoring, notice, remember, returnToLatest };
}
