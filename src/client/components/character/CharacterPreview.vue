<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  name: string;
  description: string;
  avatarUrl: string;
  personality: string;
  firstMessage: string;
  tags: string[];
  category: string;
}>(), {
  name: '',
  description: '',
  avatarUrl: '',
  personality: '',
  firstMessage: '',
  tags: () => [],
  category: '',
});

const displayAvatar = computed(() =>
  props.avatarUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=preview'
);

const personalitySnippet = computed(() => {
  if (!props.personality) return '';
  return props.personality.length > 200
    ? props.personality.slice(0, 200) + '...'
    : props.personality;
});

const firstMessageSnippet = computed(() => {
  if (!props.firstMessage) return '';
  return props.firstMessage.length > 300
    ? props.firstMessage.slice(0, 300) + '...'
    : props.firstMessage;
});

const categoryLabel = computed(() => {
  const map: Record<string, string> = {
    assistant: 'Assistant',
    entertainment: 'Entertainment',
    education: 'Education',
    game: 'Game',
    historical: 'Historical',
    modern: 'Modern',
  };
  return map[props.category] || props.category;
});
</script>

<template>
  <div class="character-preview">
    <div class="preview-header">
      <span class="preview-label">Preview</span>
    </div>

    <div class="preview-card">
      <div class="preview-avatar">
        <img :src="displayAvatar" :alt="name || 'Character'" class="avatar-img" />
      </div>

      <h3 class="preview-name">{{ name || 'Untitled Character' }}</h3>

      <el-tag v-if="category" type="primary" size="small" class="category-badge">
        {{ categoryLabel }}
      </el-tag>

      <p v-if="description" class="preview-description">{{ description }}</p>

      <div v-if="tags.length" class="preview-tags">
        <el-tag
          v-for="tag in tags"
          :key="tag"
          size="small"
          type="info"
        >
          {{ tag }}
        </el-tag>
      </div>

      <div v-if="personalitySnippet" class="preview-section">
        <span class="section-label">Personality</span>
        <p class="section-text">{{ personalitySnippet }}</p>
      </div>

      <div v-if="firstMessageSnippet" class="preview-section">
        <span class="section-label">First Message</span>
        <div class="first-message-bubble">
          <p class="section-text">{{ firstMessageSnippet }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.character-preview {
  position: sticky;
  top: 80px;
}

.preview-header {
  margin-bottom: 12px;
}

.preview-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.preview-card {
  background: var(--surface-card);
  border-radius: 16px;
  padding: 24px;
  border: 1px solid var(--border-default);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.preview-avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid var(--border-default);
  flex-shrink: 0;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-name {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
  text-align: center;
  word-break: break-word;
}

.category-badge {
  margin-top: -4px;
}

.preview-description {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  text-align: center;
  line-height: 1.5;
  word-break: break-word;
}

.preview-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
}

.preview-tags :deep(.el-tag) {
  background: color-mix(in srgb, var(--accent-purple, #7c3aed) 8%, transparent);
  color: var(--accent-purple, #7c3aed);
  border-color: color-mix(in srgb, var(--accent-purple, #7c3aed) 15%, transparent);
  font-size: 12px;
}

.preview-section {
  width: 100%;
  margin-top: 4px;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  display: block;
  margin-bottom: 6px;
}

.section-text {
  font-size: 13px;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.6;
  word-break: break-word;
}

.first-message-bubble {
  background: color-mix(in srgb, var(--accent-purple, #7c3aed) 6%, transparent);
  border-radius: 12px;
  padding: 12px;
  border-left: 3px solid var(--accent-purple, #7c3aed);
}

.first-message-bubble .section-text {
  font-style: italic;
}
</style>
