<template>
  <el-dialog
    v-model="visible"
    :title="t('personas.selectPersona')"
    width="500px"
    :close-on-click-modal="false"
  >
    <div v-loading="loading" class="persona-selector">
      <div v-if="personas.length === 0" class="empty-state">
        <p class="empty-message">{{ t('personas.noPersonas') }}</p>
        <el-button type="primary" size="small" @click="goToPersonas">
          {{ t('personas.createFirst') }}
        </el-button>
      </div>
      <div v-else class="persona-list">
        <div
          v-for="persona in personas"
          :key="persona.id"
          :class="['persona-item', { selected: selectedPersonaId === persona.id }]"
          @click="selectedPersonaId = persona.id"
        >
          <el-avatar :size="40" :src="persona.avatarUrl || undefined">
            {{ persona.name.charAt(0) }}
          </el-avatar>
          <div class="persona-info">
            <div class="persona-name">
              {{ persona.name }}
              <el-icon v-if="persona.isDefault" class="default-icon" :size="14">
                <StarFilled />
              </el-icon>
            </div>
            <div v-if="persona.description" class="persona-desc">
              {{ persona.description }}
            </div>
          </div>
          <el-icon v-if="selectedPersonaId === persona.id" class="check-icon" :size="20">
            <Check />
          </el-icon>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="handleCancel">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :disabled="!selectedPersonaId" @click="handleConfirm">
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { StarFilled, Check } from '@element-plus/icons-vue';
import { userPersonaApi, type UserPersona } from '@client/services/user-persona.api';
import { createLogger } from '@client/utils/logger';

const logger = createLogger('PersonaSelector');

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'confirm': [personaId: string];
}>();

const { t } = useI18n();
const router = useRouter();

const visible = ref(props.modelValue);
const personas = ref<UserPersona[]>([]);
const selectedPersonaId = ref<string | null>(null);
const loading = ref(false);

watch(() => props.modelValue, (val) => {
  visible.value = val;
  if (val) {
    loadPersonas();
  }
});

watch(visible, (val) => {
  emit('update:modelValue', val);
});

const loadPersonas = async () => {
  loading.value = true;
  try {
    personas.value = await userPersonaApi.list();
    // Auto-select default persona
    const defaultPersona = personas.value.find(p => p.isDefault);
    if (defaultPersona) {
      selectedPersonaId.value = defaultPersona.id;
    } else if (personas.value.length > 0) {
      selectedPersonaId.value = personas.value[0].id;
    }
  } catch (error) {
    logger.error('Failed to load personas:', error);
  } finally {
    loading.value = false;
  }
};

const handleConfirm = () => {
  if (selectedPersonaId.value) {
    emit('confirm', selectedPersonaId.value);
    visible.value = false;
  }
};

const handleCancel = () => {
  visible.value = false;
};

const goToPersonas = () => {
  visible.value = false;
  router.push({ name: 'UserPersonas' });
};

onMounted(() => {
  if (visible.value) {
    loadPersonas();
  }
});
</script>

<style scoped>
.persona-selector {
  min-height: 200px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px 0;
}

.empty-message {
  font-size: 14px;
  color: var(--text-secondary);
}

.persona-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.persona-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 2px solid var(--border-default);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.persona-item:hover {
  border-color: var(--accent);
  background: var(--bg-hover);
}

.persona-item.selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-surface));
}

.persona-info {
  flex: 1;
  min-width: 0;
}

.persona-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.default-icon {
  color: var(--warning);
}

.persona-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.check-icon {
  color: var(--accent-text);
  flex-shrink: 0;
}
</style>
