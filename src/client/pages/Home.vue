<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ChatDotRound, Star, TrendCharts } from '@element-plus/icons-vue';

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
    <div class="hero-section">
      <div class="hero-content">
        <h1 class="hero-title">欢迎来到 Small Squaretable</h1>
        <p class="hero-subtitle">AI 角色聊天平台 - 开启智能对话新体验</p>

        <div class="cta-buttons">
          <el-button type="primary" size="large" @click="handleStartChat">
            开始聊天
          </el-button>
          <el-button size="large" @click="showFeatures">
            了解更多
          </el-button>
        </div>
      </div>
    </div>

    <div class="features-section">
      <h2 class="section-title">核心功能</h2>
      <div class="features-grid">
        <el-card
          v-for="(feature, index) in features"
          :key="index"
          class="feature-card"
          shadow="hover"
        >
          <div class="feature-content">
            <el-icon :size="48" color="#409eff" class="feature-icon">
              <component :is="feature.icon" />
            </el-icon>
            <h3 class="feature-title">{{ feature.title }}</h3>
            <p class="feature-description">{{ feature.description }}</p>
          </div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  max-width: 1200px;
  margin: 0 auto;
}

.hero-section {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 20px;
}

.hero-content {
  max-width: 800px;
}

.hero-title {
  font-size: 48px;
  font-weight: 700;
  color: #303133;
  margin: 0 0 20px 0;
  line-height: 1.2;
}

.hero-subtitle {
  font-size: 20px;
  color: #606266;
  margin: 0 0 40px 0;
  line-height: 1.6;
}

.cta-buttons {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

.features-section {
  padding: 60px 20px;
}

.section-title {
  font-size: 32px;
  font-weight: 600;
  color: #303133;
  text-align: center;
  margin: 0 0 40px 0;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.feature-card {
  transition: transform 0.3s ease;
}

.feature-card:hover {
  transform: translateY(-4px);
}

.feature-content {
  text-align: center;
  padding: 20px;
}

.feature-icon {
  margin-bottom: 20px;
}

.feature-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 12px 0;
}

.feature-description {
  font-size: 14px;
  color: #606266;
  line-height: 1.6;
  margin: 0;
}

/* Responsive Design */
@media (max-width: 768px) {
  .hero-title {
    font-size: 32px;
  }

  .hero-subtitle {
    font-size: 16px;
  }

  .section-title {
    font-size: 24px;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }
}

/* Dark theme support preparation */
@media (prefers-color-scheme: dark) {
  .hero-title,
  .section-title,
  .feature-title {
    color: var(--el-text-color-primary);
  }

  .hero-subtitle,
  .feature-description {
    color: var(--el-text-color-regular);
  }
}
</style>
