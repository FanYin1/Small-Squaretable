<script setup lang="ts">
import { ref } from 'vue';
import { Search, Plus } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';

const router = useRouter();

interface Props {
  modelValue: string;
}

interface Emits {
  (e: 'update:modelValue', value: string): void;
  (e: 'search'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const localValue = ref(props.modelValue);

const handleInput = (value: string) => {
  localValue.value = value;
  emit('update:modelValue', value);
};

const handleSearch = () => {
  emit('search');
};

const handleKeyEnter = () => {
  emit('search');
};

const handleNewChat = () => {
  router.push('/chat');
};
</script>

<template>
  <div class="search-combo">
    <div class="search-input-wrapper">
      <el-icon class="search-icon">
        <Search />
      </el-icon>
      <input
        :value="modelValue"
        type="text"
        class="search-input"
        placeholder="搜索角色名称或描述..."
        @input="handleInput(($event.target as HTMLInputElement).value)"
        @keyup.enter="handleKeyEnter"
      />
    </div>

    <button class="search-btn" @click="handleSearch">
      搜索
    </button>

    <button class="new-chat-btn" @click="handleNewChat">
      <el-icon><Plus /></el-icon>
      新建聊天
    </button>
  </div>
</template>

<style scoped>
.search-combo {
  display: flex;
  align-items: center;
  gap: 0;
  background: white;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;
  max-width: 800px;
  width: 100%;
}

.search-combo:focus-within {
  border-color: #3B82F6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.search-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  min-width: 0;
}

.search-icon {
  color: #9CA3AF;
  font-size: 20px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 15px;
  color: #111827;
  background: transparent;
  padding: 12px 0;
  min-width: 0;
}

.search-input::placeholder {
  color: #9CA3AF;
}

.search-btn,
.new-chat-btn {
  padding: 12px 24px;
  border: none;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}

.search-btn {
  background: #3B82F6;
  color: white;
}

.search-btn:hover {
  background: #2563EB;
}

.search-btn:active {
  background: #1D4ED8;
}

.new-chat-btn {
  background: #10B981;
  color: white;
}

.new-chat-btn:hover {
  background: #059669;
}

.new-chat-btn:active {
  background: #047857;
}

/* 移动端适配 */
@media (max-width: 767px) {
  .search-combo {
    flex-direction: column;
    border-radius: 12px;
  }

  .search-input-wrapper {
    width: 100%;
    padding: 12px 16px;
  }

  .search-btn,
  .new-chat-btn {
    width: 100%;
    justify-content: center;
    padding: 14px 24px;
    border-radius: 0;
  }

  .search-btn {
    border-top: 1px solid #E5E7EB;
  }

  .new-chat-btn {
    border-top: 1px solid #E5E7EB;
    border-radius: 0 0 12px 12px;
  }
}
</style>
