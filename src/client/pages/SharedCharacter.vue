<template>
  <div class="shared-character-page">
    <el-skeleton v-if="loading" :rows="8" animated />
    <el-empty v-else-if="error" :description="t('share.characterNotFound') || 'Character not found'" />
    <div v-else-if="character" class="shared-character-content">
      <div class="character-header">
        <el-avatar :size="100" :src="character.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${token}`">
          {{ character.name?.[0]?.toUpperCase() || '?' }}
        </el-avatar>
        <h1>{{ character.name }}</h1>
        <div v-if="character.category" class="character-category">
          <el-tag type="info">{{ character.category }}</el-tag>
        </div>
      </div>

      <el-card v-if="character.description" class="character-section">
        <template #header>{{ t('characterDetail.description') }}</template>
        <p class="description-text">{{ character.description }}</p>
      </el-card>

      <div v-if="character.tags?.length" class="character-tags">
        <el-tag v-for="tag in character.tags" :key="tag" type="info" style="margin-right: 8px; margin-bottom: 8px">
          {{ tag }}
        </el-tag>
      </div>

      <div class="character-actions">
        <el-button v-if="isAuthenticated" type="primary" @click="forkCharacter">
          {{ t('share.forkToMyCharacters') || 'Fork to My Characters' }}
        </el-button>
        <el-button v-else type="primary" @click="goToLogin">
          {{ t('share.loginToFork') || 'Login to Fork' }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { shareApi } from '@client/services/share.api';
import { useUserStore } from '@client/stores/user';
import type { Character } from '@client/types';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const userStore = useUserStore();

const token = computed(() => route.params.token as string);
const character = ref<Character | null>(null);
const loading = ref(true);
const error = ref(false);
const isAuthenticated = computed(() => userStore.isAuthenticated);

onMounted(async () => {
  try {
    character.value = await shareApi.getSharedCharacter(token.value);
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
});

const forkCharacter = () => {
  if (character.value) {
    router.push({ name: 'CharacterCreate', query: { forkFrom: character.value.id } });
  }
};

const goToLogin = () => {
  router.push({ name: 'Login', query: { redirect: route.fullPath } });
};
</script>

<style scoped>
.shared-character-page {
  max-width: 700px;
  margin: 40px auto;
  padding: 0 20px;
}

.shared-character-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.character-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.character-header h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
}

.character-category {
  margin-top: 4px;
}

.description-text {
  margin: 0;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--text-primary);
}

.character-tags {
  display: flex;
  flex-wrap: wrap;
}

.character-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}
</style>
