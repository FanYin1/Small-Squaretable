<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ChatDotRound, Star, TrendCharts, Check } from '@element-plus/icons-vue';

const router = useRouter();
const { t } = useI18n();

// Marketing page features
const features = computed(() => [
  {
    icon: ChatDotRound,
    title: t('home.features.smartChat.title'),
    description: t('home.features.smartChat.description'),
  },
  {
    icon: Star,
    title: t('home.features.richCharacters.title'),
    description: t('home.features.richCharacters.description'),
  },
  {
    icon: TrendCharts,
    title: t('home.features.continuousLearning.title'),
    description: t('home.features.continuousLearning.description'),
  },
]);

const stats = computed(() => [
  { label: t('home.stats.activeUsers'), value: '10K+' },
  { label: t('home.stats.aiCharacters'), value: '500+' },
  { label: t('home.stats.conversations'), value: '1M+' },
]);

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
  <div class="home-page-marketing" role="main">
    <!-- Two-column layout container -->
    <div class="main-layout">
      <!-- Left Column: Hero Content (40%) -->
      <div class="left-column" role="banner">
        <div class="hero-content glass-card">
          <div class="hero-badge">{{ t('home.heroBadge') }}</div>
          <h1 class="hero-title">Small Squaretable</h1>
          <p class="hero-subtitle">{{ t('home.heroSubtitle') }}</p>
          <p class="hero-description">
            {{ t('home.heroDescription') }}
          </p>

          <div class="cta-buttons">
            <button class="btn-primary" @click="handleStartChat">
              <el-icon><ChatDotRound /></el-icon>
              {{ t('home.startChat') }}
            </button>
            <button class="btn-secondary" @click="handleLogin">
              {{ t('home.loginAccount') }}
            </button>
          </div>

          <!-- Features List -->
          <div class="features-list">
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>{{ t('home.checklist.multiModel') }}</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>{{ t('home.checklist.realtimeChat') }}</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>{{ t('home.checklist.characterMemory') }}</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>{{ t('home.checklist.communityMarket') }}</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>{{ t('home.checklist.multiPlatform') }}</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>{{ t('home.checklist.enterpriseSecurity') }}</span>
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
            @click="handleRegister"
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
          <h2 class="cta-title">{{ t('home.ctaTitle') }}</h2>
          <p class="cta-description">{{ t('home.ctaDescription') }}</p>
          <div class="cta-buttons-bottom">
            <button class="btn-primary-large" @click="handleRegister">
              {{ t('home.freeRegister') }}
            </button>
            <button class="btn-secondary-large" @click="handleLogin">
              {{ t('home.hasAccountLogin') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <footer class="site-footer" role="contentinfo">
      <div class="footer-content">
        <nav class="footer-links" aria-label="Footer navigation">
          <router-link :to="{ name: 'About' }">{{ t('footer.about') }}</router-link>
          <router-link :to="{ name: 'Privacy' }">{{ t('footer.privacy') }}</router-link>
          <router-link :to="{ name: 'Terms' }">{{ t('footer.terms') }}</router-link>
        </nav>
        <p class="footer-copyright">{{ t('footer.copyright') }}</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.home-page-marketing {
  min-height: 100vh;
  background: var(--bg-base);
  position: relative;
  overflow: hidden;
  padding: 40px 20px;
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.home-page-marketing::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle at 30% 40%, color-mix(in srgb, var(--accent-purple) 8%, transparent) 0%, transparent 50%),
              radial-gradient(circle at 70% 60%, color-mix(in srgb, var(--accent-cyan) 6%, transparent) 0%, transparent 50%),
              radial-gradient(circle at 50% 80%, color-mix(in srgb, var(--accent-pink) 4%, transparent) 0%, transparent 50%);
  animation: gradientDrift 20s ease-in-out infinite;
  z-index: 0;
  pointer-events: none;
}

/* Main two-column layout */
.main-layout {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 40% 60%;
  gap: 32px;
  align-items: start;
  position: relative;
  z-index: 1;
}

/* Glassmorphism card style */
.glass-card {
  background: color-mix(in srgb, var(--bg-base) 80%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--accent-purple) 8%, transparent);
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
  animation: fadeInUp 0.6s ease-out both;
}

.hero-badge {
  display: inline-block;
  padding: 8px 16px;
  background: linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-cyan) 100%);
  color: white;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  width: fit-content;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--accent-purple) 30%, transparent);
}

.hero-title {
  font-size: 56px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.1;
  background: linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-cyan) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.4;
}

.hero-description {
  font-size: 16px;
  font-weight: 400;
  color: var(--text-secondary);
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
  background: var(--color-success);
  color: white;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--color-success) 30%, transparent);
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

.btn-primary:hover {
  background: var(--color-success);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--color-success) 40%, transparent);
  transform: translateY(-2px);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-secondary {
  background: color-mix(in srgb, var(--accent-purple) 10%, transparent);
  color: var(--accent-purple);
  border: 1px solid var(--accent-purple);
}

.btn-secondary:hover {
  background: color-mix(in srgb, var(--accent-purple) 20%, transparent);
  border-color: var(--accent-purple);
  color: var(--accent-purple);
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
  background: color-mix(in srgb, var(--accent-purple) 5%, transparent);
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: var(--text-primary);
  font-weight: 500;
}

.feature-check {
  color: var(--color-success);
  font-size: 20px;
  flex-shrink: 0;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
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
  animation: fadeInUp 0.6s ease-out 0.1s both;
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
  background: color-mix(in srgb, var(--accent-purple) 5%, transparent);
  transition: all 0.2s ease;
}

.stat-item:hover {
  background: color-mix(in srgb, var(--accent-purple) 10%, transparent);
  transform: translateY(-2px);
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--accent-purple);
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
  background: color-mix(in srgb, var(--bg-base) 95%, transparent);
  box-shadow: 0 12px 40px color-mix(in srgb, var(--accent-purple) 15%, transparent);
  border-color: var(--accent-purple);
  transform: translateY(-4px);
}

.feature-content {
  text-align: center;
}

.feature-icon {
  margin-bottom: 16px;
  color: var(--accent-purple);
  transition: color 0.2s ease;
}

.feature-card:hover .feature-icon {
  color: var(--accent-purple);
}

.feature-card:nth-child(1) {
  animation: fadeInUp 0.6s ease-out 0.2s both;
}

.feature-card:nth-child(2) {
  animation: fadeInUp 0.6s ease-out 0.3s both;
}

.feature-card:nth-child(3) {
  animation: fadeInUp 0.6s ease-out 0.4s both;
}

.feature-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.feature-description {
  font-size: 14px;
  font-weight: 400;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}

/* CTA Section */
.cta-section {
  text-align: center;
  padding: 48px 40px;
  animation: fadeInUp 0.6s ease-out 0.5s both;
}

.cta-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.cta-description {
  font-size: 16px;
  color: var(--text-secondary);
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
  background: var(--accent-purple);
  color: white;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--accent-purple) 30%, transparent);
}

.btn-primary-large:hover {
  background: var(--accent-purple);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--accent-purple) 40%, transparent);
  transform: translateY(-2px);
}

.btn-secondary-large {
  background: transparent;
  color: var(--accent-purple);
  border: 2px solid var(--accent-purple);
}

.btn-secondary-large:hover {
  background: color-mix(in srgb, var(--accent-purple) 10%, transparent);
  transform: translateY(-2px);
}

/* Footer */
.site-footer {
  padding: 32px 24px;
  border-top: 1px solid var(--border-subtle);
  text-align: center;
  position: relative;
  z-index: 1;
}

.footer-content {
  max-width: 1200px;
  margin: 0 auto;
}

.footer-links {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-bottom: 16px;
}

.footer-links a {
  color: var(--text-tertiary);
  text-decoration: none;
  font-size: 14px;
  transition: color 0.2s ease;
}

.footer-links a:hover {
  color: var(--accent-purple);
}

.footer-copyright {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
}

/* Entrance animations */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Gradient background animation */
@keyframes gradientDrift {
  0%, 100% { transform: translate(0, 0); }
  33% { transform: translate(2%, -2%); }
  66% { transform: translate(-2%, 2%); }
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
}

/* Dark theme support */
[data-theme="dark"] .glass-card {
  background: color-mix(in srgb, var(--surface-card) 80%, transparent);
  border-color: color-mix(in srgb, var(--accent-purple) 20%, transparent);
}

[data-theme="dark"] .stat-item {
  background: color-mix(in srgb, var(--accent-purple) 15%, transparent);
}

[data-theme="dark"] .stat-item:hover {
  background: color-mix(in srgb, var(--accent-purple) 25%, transparent);
}

[data-theme="dark"] .btn-secondary {
  background: color-mix(in srgb, var(--accent-purple) 20%, transparent);
  color: color-mix(in srgb, var(--accent-purple) 50%, transparent);
}

[data-theme="dark"] .btn-secondary:hover {
  background: color-mix(in srgb, var(--accent-purple) 30%, transparent);
}

</style>
