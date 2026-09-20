<template>
  <div class="audio-player">
    <button class="play-btn" @click="togglePlay" :aria-label="isPlaying ? 'Pause' : 'Play'">
      <el-icon :size="20"><VideoPlay v-if="!isPlaying" /><VideoPause v-else /></el-icon>
    </button>
    <div class="progress-bar" @click="seek" ref="progressRef">
      <div class="progress-fill" :style="{ width: progress + '%' }" />
    </div>
    <span class="time">{{ formatTime(currentTime) }} / {{ formatTime(totalDuration) }}</span>
    <button class="speed-btn" @click="cycleSpeed">{{ playbackRate }}x</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from 'vue';
import { ElIcon } from 'element-plus';
import { VideoPlay, VideoPause } from '@element-plus/icons-vue';

const props = defineProps<{
  src: string;
  duration?: number;
}>();

const audio = ref<HTMLAudioElement | null>(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const audioDuration = ref(0);
const playbackRate = ref(1);
const progressRef = ref<HTMLDivElement | null>(null);

const speeds = [1, 1.5, 2];

const totalDuration = computed(() => {
  if (audioDuration.value > 0) return audioDuration.value;
  return props.duration ?? 0;
});

const progress = computed(() => {
  if (totalDuration.value === 0) return 0;
  return (currentTime.value / totalDuration.value) * 100;
});

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function onTimeUpdate() {
  if (audio.value) {
    currentTime.value = audio.value.currentTime;
  }
}

function onLoadedMetadata() {
  if (audio.value) {
    audioDuration.value = audio.value.duration;
  }
}

function onEnded() {
  isPlaying.value = false;
  currentTime.value = 0;
}

function getAudio(): HTMLAudioElement {
  if (!audio.value) {
    audio.value = new Audio(props.src);
    audio.value.playbackRate = playbackRate.value;
    audio.value.addEventListener('timeupdate', onTimeUpdate);
    audio.value.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.value.addEventListener('ended', onEnded);
  }
  return audio.value;
}

function togglePlay() {
  const el = getAudio();
  if (isPlaying.value) {
    el.pause();
  } else {
    el.play();
  }
  isPlaying.value = !isPlaying.value;
}

function seek(event: MouseEvent) {
  if (!progressRef.value || totalDuration.value === 0) return;
  const rect = progressRef.value.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const el = getAudio();
  el.currentTime = ratio * totalDuration.value;
  currentTime.value = el.currentTime;
}

function cycleSpeed() {
  const idx = speeds.indexOf(playbackRate.value);
  playbackRate.value = speeds[(idx + 1) % speeds.length];
  if (audio.value) {
    audio.value.playbackRate = playbackRate.value;
  }
}

watch(() => props.src, () => {
  cleanup();
});

function cleanup() {
  if (audio.value) {
    audio.value.pause();
    audio.value.removeEventListener('timeupdate', onTimeUpdate);
    audio.value.removeEventListener('loadedmetadata', onLoadedMetadata);
    audio.value.removeEventListener('ended', onEnded);
    audio.value = null;
  }
  isPlaying.value = false;
  currentTime.value = 0;
  audioDuration.value = 0;
}

onBeforeUnmount(cleanup);

defineExpose({ formatTime });
</script>

<style scoped>
.audio-player {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 20px;
  max-width: 320px;
}
.progress-bar {
  flex: 1;
  height: 4px;
  background: var(--border-color, #ddd);
  border-radius: 2px;
  cursor: pointer;
  position: relative;
}
.progress-fill {
  height: 100%;
  background: var(--primary-color, #409eff);
  border-radius: 2px;
  transition: width 0.1s;
}
.time {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.speed-btn {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
}
.play-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-primary);
  display: flex;
  align-items: center;
}
</style>
