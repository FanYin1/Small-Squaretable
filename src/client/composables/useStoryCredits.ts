import { computed, onScopeDispose, ref, watch } from 'vue';
import { creditsApi, type CreditBalance, type CreditLedgerItem } from '@client/services/credits.api';

export function useStoryCredits(
  owner: () => string | null,
  chatId: () => string | undefined,
  generating: () => boolean,
  revision: () => number,
) {
  const balance = ref<CreditBalance | null>(null);
  const latest = ref<CreditLedgerItem | null>(null);
  const failed = ref(false);
  const loading = ref(false);
  let version = 0;
  let disposed = false;

  async function refresh() {
    const requestVersion = ++version;
    const selectedChat = chatId();
    if (disposed || !owner() || !selectedChat) return;
    loading.value = true;
    failed.value = false;
    try {
      const result = await creditsApi.getBalance();
      if (requestVersion !== version) return;
      balance.value = result;
      if (result.billingMode === 'credits') {
        const ledger = await creditsApi.getLedger({ chatId: selectedChat, page: 1, limit: 10 });
        if (requestVersion !== version) return;
        latest.value = ledger.items.find(item => item.kind === 'charge') ?? null;
      }
    } catch {
      if (requestVersion === version) failed.value = true;
    } finally {
      if (requestVersion === version) loading.value = false;
    }
  }

  watch([owner, chatId], () => {
    version += 1;
    balance.value = null;
    latest.value = null;
    failed.value = false;
    loading.value = false;
    void refresh();
  }, { immediate: true, flush: 'sync' });
  watch([generating, revision], () => { void refresh(); });
  const timer = setInterval(() => {
    if (generating() && !loading.value) void refresh();
  }, 3000);
  onScopeDispose(() => {
    disposed = true;
    version += 1;
    clearInterval(timer);
  });

  const blocked = computed(() => !failed.value && balance.value?.billingMode === 'credits' && !balance.value.unlimited && balance.value.availableTokens <= 0);
  return { balance, latest, failed, loading, blocked, refresh };
}
