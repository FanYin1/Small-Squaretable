<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import { characterApi } from '../../services/character.api';
import { useUserStore } from '../../stores/user';
import { presentationJobMessages, type PresentationJobView } from '../../../types/presentation-job';

const props = defineProps<{ characterId: string }>();
const emit = defineEmits<{ adopted: [] }>();
const userStore = useUserStore();
const job = ref<PresentationJobView>();
const failed = ref(false);
const busy = ref(false);
const cancellable = computed(() => job.value && ['queued', 'dispatching', 'received', 'unknown'].includes(job.value.status));
let epoch = 0;
let read = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  const current = epoch;
  const request = ++read;
  failed.value = false;
  try {
    const jobs = await characterApi.getPresentationJobs(props.characterId);
    if (current !== epoch || request !== read) return;
    const previous = job.value;
    job.value = jobs[0];
    if (job.value?.status === 'complete' && previous && previous.status !== 'complete' && job.value.current) emit('adopted');
    clearTimeout(timer);
    if (job.value && ['queued', 'dispatching', 'received'].includes(job.value.status)) timer = setTimeout(() => { void load(); }, 5000);
  } catch { if (current === epoch && request === read) failed.value = true; }
}
async function cancel() {
  if (busy.value || !job.value || !cancellable.value) return;
  const current = epoch;
  busy.value = true;
  clearTimeout(timer);
  read++;
  try {
    const updated = await characterApi.cancelPresentationJob(props.characterId, job.value.id);
    if (current === epoch) { job.value = updated; failed.value = false; }
  } catch { if (current === epoch) failed.value = true; }
  finally { if (current === epoch) busy.value = false; }
}
watch(() => [props.characterId, userStore.user?.id, userStore.user?.tenantId], () => {
  epoch++; read++; clearTimeout(timer); job.value = undefined; busy.value = false;
  void load();
}, { immediate: true });
onScopeDispose(() => { epoch++; read++; clearTimeout(timer); });
</script>

<template>
  <section v-if="job || failed" class="presentation-job" aria-label="介绍整理进度">
    <h2>介绍整理</h2>
    <p v-if="job" role="status">{{ presentationJobMessages[job.status] }}</p>
    <p v-if="job && !job.current">来源已改变，旧结果不会用于当前卡片。</p>
    <p v-if="failed" role="alert">暂时无法读取或更新整理状态，未触发新的模型请求。</p>
    <div class="presentation-job-actions">
      <button v-if="failed" type="button" :disabled="busy" @click="load">重新读取状态</button>
      <button v-if="cancellable" type="button" :disabled="busy" @click="cancel">停止采用本次整理</button>
    </div>
  </section>
</template>

<style scoped>
.presentation-job { border: 1px solid var(--border-default); border-radius: 16px; padding: 20px; margin-bottom: 24px; background: var(--bg-secondary); }
h2 { font-size: 16px; margin: 0 0 12px; }
p { color: var(--text-secondary); font-size: 14px; line-height: 1.8; }
.presentation-job-actions { display: flex; gap: 12px; flex-wrap: wrap; }
button { min-height: 44px; background: transparent; color: var(--accent-text); border: 1px solid var(--border-default); border-radius: 8px; padding: 8px 12px; font: inherit; cursor: pointer; }
button:disabled { opacity: .6; cursor: wait; }
</style>
