<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ChatDotRound, Star, TrendCharts, Check } from '@element-plus/icons-vue';

const router = useRouter();

const features = [
  {
    icon: ChatDotRound,
    title: '智能对话',
    description: '与 AI 角色进行自然流畅的对话体验',
  },
  {
    icon: Star,
    title: '丰富角色',
    description: '海量精选 AI 角色，满足不同场景需求',
  },
  {
    icon: TrendCharts,
    title: '持续学习',
    description: 'AI 角色会记住对话历史，提供个性化体验',
  },
];

const stats = [
  { label: '活跃用户', value: '10K+' },
  { label: 'AI 角色', value: '500+' },
  { label: '对话次数', value: '1M+' },
];

const handleStartChat = () => {
  router.push('/market');
};

const showFeatures = () => {
  // This will be implemented later with a dialog or modal
  alert('功能介绍：\n\n1. 智能对话 - 与 AI 角色进行自然流畅的对话体验\n2. 丰富角色 - 海量精选 AI 角色，满足不同场景需求\n3. 持续学习 - AI 角色会记住对话历史，提供个性化体验');
};
</script>

<template>
  <div class="home-page">
    <!-- Two-column layout container -->
    <div class="main-layout">
      <!-- Left Column: Hero Content (50%) -->
      <div class="left-column">
        <div class="hero-content glass-card">
          <div class="hero-badge">✨ AI 驱动的智能对话</div>
          <h1 class="hero-title">Small Squaretable</h1>
          <p class="hero-subtitle">下一代 AI 角色聊天平台</p>
          <p class="hero-description">
            与智能 AI 角色进行深度对话，体验前所未有的交互体验。
            支持多种场景，满足您的各种需求。
          </p>

          <div class="cta-buttons">
            <button class="btn-primary" @click="handleStartChat">
              <el-icon><ChatDotRound /></el-icon>
              开始聊天
            </button>
            <button class="btn-secondary" @click="showFeatures">
              了解更多
            </button>
          </div>

          <!-- Features List -->
          <div class="features-list">
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>支持多种 AI 模型</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>实时流式对话</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>角色记忆系统</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>社区角色市场</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>多平台同步</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>企业级安全保障</span>
            </div>
          </div>

          <!-- Quick Stats -->
          <div class="quick-stats">
            <div class="quick-stat-item">
              <span class="stat-number">10K+</span>
              <span class="stat-label">活跃用户</span>
            </div>
            <div class="quick-stat-item">
              <span class="stat-number">500+</span>
              <span class="stat-label">AI 角色</span>
            </div>
            <div class="quick-stat-item">
              <span class="stat-number">1M+</span>
              <span class="stat-label">对话次数</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Features & Stats (50%) -->
      <div class="right-column">
        <!-- Stats Section -->
        <div class="stats-section glass-card">
          <div class="stats-grid">
            <div v-for="(stat, index) in stats" :key="index" class="stat-item">
              <div class="stat-value">{{ stat.value }}</div>
              <div class="stat-label">{{ stat.label }}</div>
            </div>
          </div>
        </div>

        <!-- Features Grid -->
        <div class="features-grid">
          <div
            v-for="(feature, index) in features"
            :key="index"
            class="feature-card glass-card"
          >
            <div class="feature-content">
              <el-icon :size="40" class="feature-icon">
                <component :is="feature.icon" />
              </el-icon>
              <h3 class="feature-title">{{ feature.title }}</h3>
              <p class="feature-description">{{ feature.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Import Plus Jakarta Sans font */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');

/* Root variables */
:root {
  --color-primary: #7C3AED;
  --color-secondary: #A78BFA;
  --color-cta: #22C55E;
  --color-bg: #FAF5FF;
  --color-text-primary: #1F2937;
  --color-text-secondary: #6B7280;
  --color-border: rgba(255, 255, 255, 0.2);
}

.home-page {
  min-height: 100vh;
  background: linear-gradient(135deg, var(--color-bg) 0%, #F3E8FF 100%);
  padding: 40px 20px;
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* Main two-column layout */
.main-layout {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 40% 60%;
  gap: 32px;
  align-items: start;
}

/* Glassmorphism card style */
.glass-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-border);
  border-radius: 24px;
  padding: 40px;
  box-shadow: 0 8px 32px rgba(124, 58, 237, 0.1);
  transition: all 0.3s ease;
}

/* Left Column */
.left-column {
  position: sticky;
  top: 40px;
}

.hero-content {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 600px;
  justify-content: center;
}

.hero-badge {
  display: inline-block;
  padding: 8px 16px;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: white;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  width: fit-content;
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
}

.hero-title {
  font-size: 56px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  line-height: 1.1;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  line-height: 1.4;
}

.hero-description {
  font-size: 16px;
  font-weight: 400;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.8;
}

/* CTA Buttons */
.cta-buttons {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.btn-primary,
.btn-secondary {
  padding: 14px 32px;
  font-size: 16px;
  font-weight: 600;
  font-family: 'Plus Jakarta Sans', sans-serif;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
}

.btn-primary {
  background: var(--color-cta);
  color: white;
  box-shadow: 0 4px 16px rgba(34, 197, 94, 0.3);
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

.btn-primary:hover {
  background: #16A34A;
  box-shadow: 0 6px 20px rgba(34, 197, 94, 0.4);
}

.btn-primary:active {
  transform: translateY(1px);
}

.btn-secondary {
  background: rgba(124, 58, 237, 0.1);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.btn-secondary:hover {
  background: rgba(124, 58, 237, 0.2);
  border-color: var(--color-secondary);
  color: var(--color-secondary);
}

.btn-secondary:active {
  transform: translateY(1px);
}

/* Features List */
.features-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 8px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 16px;
  border: 1px solid rgba(124, 58, 237, 0.1);
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: var(--color-text-primary);
  font-weight: 500;
}

.feature-check {
  color: var(--color-cta);
  font-size: 20px;
  flex-shrink: 0;
}

/* Quick Stats */
.quick-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 8px;
}

.quick-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  background: rgba(124, 58, 237, 0.05);
  border-radius: 12px;
  border: 1px solid rgba(124, 58, 237, 0.1);
  transition: all 0.2s ease;
}

.quick-stat-item:hover {
  background: rgba(124,7, 0.1);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.2);
}

.stat-number {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

/* Right Column */
.right-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Stats Section */
.stats-section {
  padding: 32px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  text-align: center;
}

.stat-item {
  padding: 16px;
  border-radius: 12px;
  background: rgba(124, 58, 237, 0.05);
  transition: background 0.2s ease;
}

.stat-item:hover {
  background: rgba(124, 58, 237, 0.1);
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 8px;
}

.stat-label {
  font-size: 14px;
  font-weight: 400;
  color: var(--color-text-secondary);
}

/* Features Grid */
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.feature-card {
  padding: 28px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.feature-card:hover {
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 12px 40px rgba(124, 58, 237, 0.15);
  border-color: var(--color-primary);
}

.feature-content {
  text-align: center;
}

.feature-icon {
  margin-bottom: 16px;
  color: var(--color-primary);
  transition: color 0.2s ease;
}

.feature-card:hover .feature-icon {
  color: var(--color-secondary);
}

.feature-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 12px 0;
}

.feature-description {
  font-size: 14px;
  font-weight: 400;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0;
}

/* Accessibility: Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* Responsive Design: Tablet */
@media (max-width: 1024px) {
  .main-layout {
    grid-template-columns: 45% 55%;
    gap: 24px;
  }

  .hero-title {
    font-size: 40px;
  }

  .glass-card {
    padding: 32px;
  }
}

/* Responsive Design: Mobile (<768px) - Single column stack */
@media (max-width: 768px) {
  .home-page {
    padding: 20px 16px;
  }

  .main-layout {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .left-column {
    position: static;
  }

  .hero-content {
    text-align: center;
  }

  .hero-title {
    font-size: 32px;
    margin-bottom: 16px;
  }

  .hero-subtitle {
    font-size: 18px;
  }

  .hero-description {
    font-size: 14px;
    margin-bottom: 24px;
  }

  .cta-buttons {
    justify-content: center;
  }

  .btn-primary,
  .btn-secondary {
    padding: 12px 24px;
    font-size: 14px;
  }

  .glass-card {
    padding: 24px;
    border-radius: 16px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .stat-value {
    font-size: 28px;
  }

  .features-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}

/* Small mobile devices */
@media (max-width: 480px) {
  .hero-title {
    font-size: 28px;
  }

  .hero-subtitle {
    font-size: 16px;
  }

  .cta-buttons {
    flex-direction: column;
    width: 100%;
  }

  .btn-primary,
  .btn-secondary {
    width: 100%;
  }
}

/* Dark theme support */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #1F1B24;
    --color-text-primary: #F9FAFB;
    --color-text-secondary: #D1D5DB;
  }

  .home-page {
    background: linear-gradient(135deg, #1F1B24 0%, #2D1B3D 100%);
  }

  .glass-card {
    background: rgba(30, 30, 40, 0.8);
    border-color: rgba(167, 139, 250, 0.2);
  }

  .stat-item {
    background: rgba(124, 58, 237, 0.15);
  }

  .stat-item:hover {
    background: rgba(124, 58, 237, 0.25);
  }

  .btn-secondary {
    background: rgba(124, 58, 237, 0.2);
    color: var(--color-secondary);
  }

  .btn-secondary:hover {
    background: rgba(124, 58, 237, 0.3);
  }
}
</style>
