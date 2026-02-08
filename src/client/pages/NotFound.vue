<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { HomeFilled, ChatDotRound, Goods, DataBoard } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const { t } = useI18n();

const searchQuery = ref('');

const goHome = () => {
  router.push({ name: 'Home' });
};

const handleSearch = () => {
  if (searchQuery.value.trim()) {
    router.push({ name: 'Market', query: { q: searchQuery.value } });
  }
};

const popularPages = [
  { name: 'Dashboard', icon: DataBoard, labelKey: 'notFound.dashboard' },
  { name: 'Chat', icon: ChatDotRound, labelKey: 'notFound.chat' },
  { name: 'Market', icon: Goods, labelKey: 'notFound.market' },
];
</script>

<template>
  <div class="not-found-page">
    <div class="not-found-container">
      <!-- SVG Illustration: disconnected plug -->
      <div class="illustration" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 200 200"
          width="180"
          height="180"
          fill="none"
        >
          <!-- Outer ring -->
          <circle cx="100" cy="100" r="90" stroke="var(--text-inverse)" stroke-width="2" opacity="0.15" />
          <circle cx="100" cy="100" r="70" stroke="var(--text-inverse)" stroke-width="1.5" opacity="0.1" />
          <!-- Plug body (left half) -->
          <g class="plug-left">
            <rect x="30" y="80" width="50" height="40" rx="6" fill="var(--text-inverse)" opacity="0.9" />
            <rect x="42" y="70" width="8" height="16" rx="3" fill="var(--text-inverse)" opacity="0.7" />
            <rect x="60" y="70" width="8" height="16" rx="3" fill="var(--text-inverse)" opacity="0.7" />
            <!-- Cable -->
            <path d="M30 100 Q10 100 8 110 Q6 120 10 130" stroke="var(--text-inverse)" stroke-width="3" stroke-linecap="round" opacity="0.5" />
          </g>
          <!-- Socket body (right half) -->
          <g class="plug-right">
            <rect x="120" y="78" width="50" height="44" rx="8" fill="var(--text-inverse)" opacity="0.2" stroke="var(--text-inverse)" stroke-width="2" stroke-opacity="0.4" />
            <rect x="120" y="88" width="12" height="8" rx="2" fill="var(--text-inverse)" opacity="0.5" />
            <rect x="120" y="104" width="12" height="8" rx="2" fill="var(--text-inverse)" opacity="0.5" />
            <!-- Cable -->
            <path d="M170 100 Q190 100 192 110 Q194 120 190 130" stroke="var(--text-inverse)" stroke-width="3" stroke-linecap="round" opacity="0.5" />
          </g>
          <!-- Spark particles between plug and socket -->
          <circle cx="95" cy="92" r="2.5" fill="var(--text-inverse)" opacity="0.6" class="spark spark-1" />
          <circle cx="105" cy="100" r="2" fill="var(--text-inverse)" opacity="0.5" class="spark spark-2" />
          <circle cx="98" cy="108" r="1.5" fill="var(--text-inverse)" opacity="0.4" class="spark spark-3" />
          <!-- Small decorative dots -->
          <circle cx="155" cy="55" r="3" fill="var(--text-inverse)" opacity="0.15" />
          <circle cx="45" cy="150" r="4" fill="var(--text-inverse)" opacity="0.1" />
          <circle cx="160" cy="155" r="2" fill="var(--text-inverse)" opacity="0.12" />
        </svg>
      </div>

      <div class="error-code">404</div>
      <h1 class="error-title">{{ t('notFound.title') }}</h1>
      <p class="error-description">{{ t('notFound.description') }}</p>

      <el-button type="primary" size="large" class="home-button" @click="goHome">
        <el-icon><HomeFilled /></el-icon>
        {{ t('notFound.backHome') }}
      </el-button>

      <div class="search-section">
        <el-input
          v-model="searchQuery"
          :placeholder="t('notFound.searchPlaceholder')"
          size="large"
          clearable
          @keyup.enter="handleSearch"
          class="search-input"
        >
          <template #append>
            <el-button @click="handleSearch">{{ t('common.search') }}</el-button>
          </template>
        </el-input>
      </div>

      <div class="popular-pages">
        <p class="popular-label">{{ t('notFound.popularPages') }}</p>
        <div class="popular-links">
          <router-link
            v-for="page in popularPages"
            :key="page.name"
            :to="{ name: page.name }"
            class="popular-link"
          >
            <el-icon><component :is="page.icon" /></el-icon>
            <span>{{ t(page.labelKey) }}</span>
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.not-found-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-cyan) 100%);
  padding: 20px;
}

.not-found-container {
  text-align: center;
  color: var(--text-inverse);
  max-width: 600px;
  animation: fadeIn var(--duration-slow) var(--ease-out) both;
}

.illustration {
  margin-bottom: var(--spacing-lg);
  animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) both;
}

.illustration svg {
  filter: drop-shadow(0 4px 12px color-mix(in srgb, var(--text-primary) 15%, transparent));
}

/* Plug halves: gentle floating drift */
.plug-left {
  animation: driftLeft 3s ease-in-out infinite;
  transform-origin: center;
}

.plug-right {
  animation: driftRight 3s ease-in-out infinite;
  transform-origin: center;
}

@keyframes driftLeft {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(-4px); }
}

@keyframes driftRight {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(4px); }
}

/* Spark blinking */
.spark {
  animation: sparkBlink 1.5s ease-in-out infinite;
}

.spark-1 { animation-delay: 0s; }
.spark-2 { animation-delay: 0.5s; }
.spark-3 { animation-delay: 1s; }

@keyframes sparkBlink {
  0%, 100% { opacity: 0.1; }
  50% { opacity: 0.7; }
}

.error-code {
  font-size: 120px;
  font-weight: 700;
  line-height: 1;
  margin-bottom: var(--spacing-md);
  color: var(--text-inverse);
  opacity: 0.95;
  animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.1s both;
}

.error-title {
  font-size: var(--font-size-3xl);
  font-weight: 600;
  margin-bottom: var(--spacing-md);
  color: var(--text-inverse);
  animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.2s both;
}
.error-description {
  font-size: var(--font-size-lg);
  margin-bottom: var(--spacing-xl);
  color: var(--text-inverse);
  opacity: 0.85;
  animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.3s both;
}

.home-button {
  animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.4s both;
}

.search-section {
  margin: var(--spacing-lg) 0;
  max-width: 400px;
  width: 100%;
  margin-left: auto;
  margin-right: auto;
  animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.45s both;
}

.search-input :deep(.el-input__wrapper) {
  background: color-mix(in srgb, var(--text-inverse) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--text-inverse) 25%, transparent);
  backdrop-filter: blur(8px);
}

.search-input :deep(.el-input__inner) {
  color: var(--text-inverse);
}

.search-input :deep(.el-input__inner::placeholder) {
  color: color-mix(in srgb, var(--text-inverse) 60%, transparent);
}

.search-input :deep(.el-input-group__append) {
  background: color-mix(in srgb, var(--text-inverse) 20%, transparent);
  border-color: color-mix(in srgb, var(--text-inverse) 25%, transparent);
  color: var(--text-inverse);
}

.popular-pages {
  margin-top: var(--spacing-xl);
  animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.5s both;
}

.popular-label {
  font-size: var(--font-size-sm);
  color: var(--text-inverse);
  opacity: 0.7;
  margin-bottom: var(--spacing-md);
}

.popular-links {
  display: flex;
  justify-content: center;
  gap: var(--spacing-md);
  flex-wrap: wrap;
}

.popular-link {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--text-inverse) 15%, transparent);
  color: var(--text-inverse);
  text-decoration: none;
  font-size: var(--font-size-sm);
  transition: background var(--duration-normal) var(--ease-out),
              transform var(--duration-normal) var(--ease-out);
  backdrop-filter: blur(4px);
}

.popular-link:hover {
  background: color-mix(in srgb, var(--text-inverse) 25%, transparent);
  transform: translateY(-2px);
}

@media (max-width: 768px) {
  .error-code {
    font-size: 80px;
  }

  .error-title {
    font-size: var(--font-size-2xl);
  }

  .error-description {
    font-size: var(--font-size-base);
  }

  .illustration svg {
    width: 140px;
    height: 140px;
  }
}
</style>
