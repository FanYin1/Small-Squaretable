<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ChatDotRound, Star, TrendCharts, Check } from '@element-plus/icons-vue';

const router = useRouter();

// Marketing page features
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
  router.push({ name: 'Market' });
};

const handleLogin = () => {
  router.push({ name: 'Login' });
};

const handleRegister = () => {
  router.push({ name: 'Register' });
};
</script>

<template>
  <!-- Marketing Page (Guest Only) -->
  <div class="home-page-marketing">
    <!-- Two-column layout container -->
    <div class="main-layout">
      <!-- Left Column: Hero Content (40%) -->
      <div class="left-column">
        <div class="hero-content glass-card">
          <div class="hero-badge">AI 驱动的智能对话</div>
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
            <button class="btn-secondary" @click="handleLogin">
              登录账户
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

      <!-- Right Column: Features & Stats (60%) -->
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

        <!-- CTA Section -->
        <div class="cta-section glass-card">
          <h2 class="cta-title">准备好开始了吗？</h2>
          <p class="cta-description">加入数千名用户，体验 AI 对话的未来</p>
          <div class="cta-buttons-bottom">
            <button class="btn-primary-large" @click="handleRegister">
              免费注册
            </button>
            <button class="btn-secondary-large" @click="handleLogin">
              已有账户？登录
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Import Plus Jakarta Sans font */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');

.home-page-marketing {
  min-height: 100vh;
  background: linear-gradient(135deg, var(--color-bg) 0%, var(--color-bg-light) 100%);
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
  background: color-mix(in srgb, var(--bg-color) 80%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-border);
  border-radius: 24px;
  padding: 40px;
  box-shadow: 0 8px 32px color-mix(in srgb, var(--color-primary) 12%, transparent);
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
  box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 30%, transparent);
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

/* CTA Buttons - Marketing Page */
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
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
}

.btn-primary {
  background: var(--color-success-strong);
  color: white;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--color-success-strong) 30%, transparent);
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

.btn-primary:hover {
  background: var(--color-success-strong-dark);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--color-success-strong) 40%, transparent);
  transform: translateY(-2px);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-secondary {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.btn-secondary:hover {
  background: color-mix(in srgb, var(--color-primary) 20%, transparent);
  border-color: var(--color-primary-dark);
  color: var(--color-primary-dark);
  transform: translateY(-2px);
}

.btn-secondary:active {
  transform: translateY(0);
}

/* Features List */
.features-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 8px;
  padding: 20px;
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
  border-radius: 12px;
  border: 1px solid var(--color-border-light);
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
  color: var(--color-success-strong);
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
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
  border-radius: 8px;
  border: 1px solid var(--color-border-light);
  transition: all 0.2s ease;
}

.quick-stat-item:hover {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 15%, transparent);
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
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
  transition: all 0.2s ease;
}

.stat-item:hover {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  transform: translateY(-2px);
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 8px;
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
  background: color-mix(in srgb, var(--bg-color) 95%, transparent);
  box-shadow: 0 12px 40px color-mix(in srgb, var(--color-primary) 15%, transparent);
  border-color: var(--color-primary);
  transform: translateY(-4px);
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
  color: var(--color-primary-dark);
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

/* CTA Section */
.cta-section {
  text-align: center;
  padding: 48px 40px;
}

.cta-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 12px 0;
}

.cta-description {
  font-size: 16px;
  color: var(--color-text-secondary);
  margin: 0 0 24px 0;
}

.cta-buttons-bottom {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn-primary-large,
.btn-secondary-large {
  padding: 14px 40px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.btn-primary-large {
  background: var(--color-primary);
  color: white;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--color-primary) 30%, transparent);
}

.btn-primary-large:hover {
  background: var(--color-primary-dark);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--color-primary) 40%, transparent);
  transform: translateY(-2px);
}

.btn-secondary-large {
  background: transparent;
  color: var(--color-primary);
  border: 2px solid var(--color-primary);
}

.btn-secondary-large:hover {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  transform: translateY(-2px);
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
  background: color-mix(in srgb, var(--bg-color) 80%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-border-light);
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 8%, transparent);
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
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  color: white;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  width: fit-content;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 30%, transparent);
}

.hero-title {
  font-size: 56px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  line-height: 1.1;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
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
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
}

.btn-primary {
  background: var(--color-success-strong);
  color: white;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--color-success-strong) 30%, transparent);
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

.btn-primary:hover {
  background: var(--color-success-strong-dark);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--color-success-strong) 40%, transparent);
  transform: translateY(-2px);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-secondary {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.btn-secondary:hover {
  background: color-mix(in srgb, var(--color-primary) 20%, transparent);
  border-color: var(--color-primary-dark);
  color: var(--color-primary-dark);
  transform: translateY(-2px);
}

.btn-secondary:active {
  transform: translateY(0);
}

/* Features List */
.features-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 8px;
  padding: 20px;
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
  border-radius: 12px;
  border: 1px solid var(--color-border-light);
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
  color: var(--color-success-strong);
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
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
  border-radius: 8px;
  border: 1px solid var(--color-border-light);
  transition: all 0.2s ease;
}

.quick-stat-item:hover {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 15%, transparent);
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
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
  transition: all 0.2s ease;
}

.stat-item:hover {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  transform: translateY(-2px);
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 8px;
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
  background: color-mix(in srgb, var(--bg-color) 95%, transparent);
  box-shadow: 0 12px 40px color-mix(in srgb, var(--color-primary) 15%, transparent);
  border-color: var(--color-primary);
  transform: translateY(-4px);
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
  color: var(--color-primary-dark);
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

/* CTA Section */
.cta-section {
  text-align: center;
  padding: 48px 40px;
}

.cta-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 12px 0;
}

.cta-description {
  font-size: 16px;
  color: var(--color-text-secondary);
  margin: 0 0 24px 0;
}

.cta-buttons-bottom {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn-primary-large,
.btn-secondary-large {
  padding: 14px 40px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.btn-primary-large {
  background: var(--color-primary);
  color: white;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--color-primary) 30%, transparent);
}

.btn-primary-large:hover {
  background: var(--color-primary-dark);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--color-primary) 40%, transparent);
  transform: translateY(-2px);
}

.btn-secondary-large {
  background: transparent;
  color: var(--color-primary);
  border: 2px solid var(--color-primary);
}

.btn-secondary-large:hover {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  transform: translateY(-2px);
}

/* ===== DASHBOARD STYLES ===== */

.btn-action {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--bg-color);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.btn-action:hover {
  background: var(--color-bg);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn-action-primary {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.btn-action-primary:hover {
  background: var(--color-primary-dark);
  border-color: var(--color-primary-dark);
}

/* Dashboard content */
.dashboard-content {
  flex: 1;
  padding: 32px;
  overflow-y: auto;
}

.welcome-section {
  margin-bottom: 32px;
}

.welcome-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
}

.welcome-subtitle {
  font-size: 16px;
  color: var(--color-text-secondary);
  margin: 0;
}

/* Dashboard grid */
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.dashboard-card {
  background: var(--bg-color);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.dashboard-card:hover {
  box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 10%, transparent);
  border-color: var(--color-primary-light);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-primary) 2%, transparent);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.card-title :deep(.el-icon) {
  color: var(--color-primary);
}

.card-link {
  padding: 0;
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.2s ease;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.card-link:hover {
  color: var(--color-primary-dark);
}

.card-content {
  padding: 20px;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  color: var(--color-primary-light);
  margin-bottom: 16px;
}

.empty-state p {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0 0 16px 0;
}

/* Chat list */
.chat-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 2%, transparent);
  cursor: pointer;
  transition: all 0.2s ease;
}

.chat-item:hover {
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  transform: translateX(4px);
}

.chat-avatar {
  flex-shrink: 0;
}

.chat-info {
  flex: 1;
  min-width: 0;
}

.chat-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.chat-preview {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-time {
  font-size: 12px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

/* Stats container */
.stats-container {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-box {
  padding: 16px;
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
  border-radius: 8px;
  text-align: center;
}

.stat-box .stat-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.stat-box .stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-primary);
}

/* Small button */
.btn-small {
  width: 100%;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid var(--color-primary);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.btn-small:hover {
  background: var(--color-primary);
  color: white;
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

  .dashboard-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Responsive Design: Mobile (<768px) - Single column stack */
@media (max-width: 768px) {
  .home-page-marketing {
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
    border-radius: 12px;
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

  .btn-action {
    flex: 1;
  }

  .dashboard-content {
    padding: 16px;
  }

  .dashboard-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .welcome-title {
    font-size: 20px;
  }

  .cta-buttons-bottom {
    flex-direction: column;
  }

  .btn-primary-large,
  .btn-secondary-large {
    width: 100%;
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

  .stats-container {
    grid-template-columns: 1fr;
  }
}

/* Dark theme support */
@media (prefers-color-scheme: dark) {
  .home-page-marketing {
    background: linear-gradient(135deg, var(--color-bg-dark) 0%, var(--color-bg-darker) 100%);
  }

  .glass-card {
    background: color-mix(in srgb, var(--color-surface-dark) 80%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 20%, transparent);
  }

  .stat-item {
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
  }

  .stat-item:hover {
    background: color-mix(in srgb, var(--color-primary) 25%, transparent);
  }

  .btn-secondary {
    background: color-mix(in srgb, var(--color-primary) 20%, transparent);
    color: var(--color-primary-light);
  }

  .btn-secondary:hover {
    background: color-mix(in srgb, var(--color-primary) 30%, transparent);
  }

  .dashboard-card {
    background: var(--color-surface-dark);
    border-color: var(--color-border);
  }

  .card-header {
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    border-bottom-color: var(--color-border);
  }

  .btn-action {
    background: var(--color-surface-dark);
    color: var(--color-text-primary);
    border-color: var(--color-border);
  }

  .btn-action:hover {
    background: var(--color-surface-darker);
    border-color: var(--color-primary);
  }

  .chat-item {
    background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  }

  .chat-item:hover {
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
  }

  .stat-box {
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  }
}
</style>
