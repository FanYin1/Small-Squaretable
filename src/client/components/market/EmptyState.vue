<script setup lang="ts">
interface Emits {
  (e: 'clear-filters'): void;
  (e: 'browse-all'): void;
}

const emit = defineEmits<Emits>();

const handleClearFilters = () => {
  emit('clear-filters');
};

const handleBrowseAll = () => {
  emit('browse-all');
};
</script>

<template>
  <div class="empty-state">
    <div class="empty-illustration">
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Robot head -->
        <rect x="30" y="30" width="60" height="50" rx="8" fill="#DBEAFE" stroke="#3B82F6" stroke-width="2"/>
        <!-- Eyes -->
        <circle cx="45" cy="50" r="6" fill="#3B82F6"/>
        <circle cx="75" cy="50" r="6" fill="#3B82F6"/>
        <!-- Antenna -->
        <line x1="60" y1="30" x2="60" y2="15" stroke="#3B82F6" stroke-width="2" stroke-linecap="round"/>
        <circle cx="60" cy="12" r="4" fill="#3B82F6"/>
        <!-- Mouth -->
        <path d="M 45 65 Q 60 70 75 65" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" fill="none"/>
        <!-- Speech bubble -->
        <ellipse cx="95" cy="45" rx="18" ry="15" fill="#EFF6FF" stroke="#3B82F6" stroke-width="2"/>
        <path d="M 85 52 L 80 58 L 88 55 Z" fill="#EFF6FF" stroke="#3B82F6" stroke-width="2"/>
        <text x="95" y="50" text-anchor="middle" font-size="20" fill="#3B82F6">?</text>
      </svg>
    </div>

    <h3 class="empty-title">暂无角色</h3>
    <p class="empty-description">调整筛选条件或搜索其他关键词</p>

    <div class="empty-actions">
      <el-button type="primary" plain @click="handleClearFilters">
        清除所有筛选
      </el-button>
      <el-button type="primary" @click="handleBrowseAll">
        浏览全部角色
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
  min-height: 400px;
}

.empty-illustration {
  margin-bottom: 24px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.empty-title {
  font-size: 20px;
  font-weight: 700;
  color: #4B5563;
  margin: 0 0 8px 0;
}

.empty-description {
  font-size: 14px;
  color: #9CA3AF;
  margin: 0 0 24px 0;
  max-width: 400px;
}

.empty-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

/* 移动端适配 */
@media (max-width: 767px) {
  .empty-state {
    padding: 60px 20px;
  }

  .empty-illustration svg {
    width: 100px;
    height: 100px;
  }

  .empty-title {
    font-size: 18px;
  }

  .empty-actions {
    flex-direction: column;
    width: 100%;
  }

  .empty-actions .el-button {
    width: 100%;
  }
}
</style>
