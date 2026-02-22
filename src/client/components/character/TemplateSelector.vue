<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Document, Service, UserFilled, Reading, EditPen } from '@element-plus/icons-vue';
import type { CharacterCardData } from '@client/types';
import type { Component } from 'vue';

const { t } = useI18n();

const emit = defineEmits<{
  (e: 'select', cardData: CharacterCardData): void;
}>();

interface Template {
  key: string;
  icon: Component;
  cardData: CharacterCardData;
}

const templates: Template[] = [
  {
    key: 'Blank',
    icon: Document,
    cardData: {},
  },
  {
    key: 'Assistant',
    icon: Service,
    cardData: {
      system_prompt: 'You are a helpful AI assistant. Answer questions accurately and concisely. If you are unsure about something, say so rather than guessing.',
      personality: 'Helpful, knowledgeable, friendly',
      first_mes: 'Hello! How can I help you today?',
    },
  },
  {
    key: 'Roleplay',
    icon: UserFilled,
    cardData: {
      personality: 'Brave, curious, witty',
      scenario: 'A fantasy world where magic and technology coexist. Ancient ruins hold forgotten secrets, and adventurers seek glory and treasure.',
      first_mes: '*looks up with a warm smile* Welcome, traveler. It\'s not often we see new faces around here. What brings you to our corner of the world?',
    },
  },
  {
    key: 'Educator',
    icon: Reading,
    cardData: {
      system_prompt: 'You are an educational tutor. Break down complex topics into simple explanations. Use examples and analogies. Ask follow-up questions to check understanding.',
      personality: 'Patient, encouraging, thorough',
      first_mes: 'Welcome to our learning session! What topic would you like to explore today? I\'ll do my best to explain it clearly.',
    },
  },
  {
    key: 'Storyteller',
    icon: EditPen,
    cardData: {
      system_prompt: 'You are a creative storyteller. Craft vivid narratives with rich descriptions and compelling characters. Adapt the story based on the reader\'s choices and reactions.',
      personality: 'Imaginative, eloquent, dramatic',
      first_mes: 'Gather round, for I have a tale to tell... a story of wonder and mystery that begins on a night much like this one.',
    },
  },
];

function handleSelect(template: Template) {
  emit('select', { ...template.cardData });
}
</script>

<template>
  <div class="template-selector">
    <h4 class="template-title">{{ t('characterEditor.templateTitle', 'Choose a Template') }}</h4>
    <el-row :gutter="12">
      <el-col
        v-for="tpl in templates"
        :key="tpl.key"
        :xs="12"
        :sm="8"
        :md="8"
        :lg="4"
      >
        <el-card
          shadow="hover"
          class="template-card"
          @click="handleSelect(tpl)"
        >
          <div class="template-card-body">
            <el-icon :size="28" class="template-icon">
              <component :is="tpl.icon" />
            </el-icon>
            <span class="template-name">{{ t(`characterEditor.template${tpl.key}`, tpl.key) }}</span>
            <span class="template-desc">{{ t(`characterEditor.template${tpl.key}Desc`, '') }}</span>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.template-selector {
  margin-bottom: 24px;
}

.template-title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.template-card {
  cursor: pointer;
  margin-bottom: 12px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.template-card:hover {
  border-color: var(--el-color-primary);
}

.template-card :deep(.el-card__body) {
  padding: 16px 12px;
}

.template-card-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}

.template-icon {
  color: var(--el-color-primary);
}

.template-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.template-desc {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.3;
}
</style>
