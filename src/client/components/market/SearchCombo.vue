<script setup lang="ts">
import { ref } from 'vue';
import { Search, Plus } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

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
  router.push({ name: 'Chat' });
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
        :placeholder="$t('market.searchPlaceholder')"
        @input="handleInput(($event.target as HTMLInputElement).value)"
        @keyup.enter="handleKeyEnter"
      />
    </div>

    <button class="search-btn" @click="handleSearch">
      {{ $t('market.searchBtn') }}
    </button>

    <button class="new-chat-btn" @click="handleNewChat">
      <el-icon><Plus /></el-icon>
      {{ $t('market.newChat') }}
    </button>
  </div>
</template>

<style scoped>
/*
 * 取值全部改走令牌。原先硬编码 white / #3B82F6（蓝）/ #10B981（绿），
 * 既在深色表面上整块发白，也和琥珀品牌色冲突——搜索按钮是蓝的、
 * 新建按钮是绿的，同一个控件里出现两种互不相关的主色。
 * 该组件只被 Market 使用，改动范围可控。
 */
.search-combo {
  display: flex;
  align-items: center;
  gap: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.2s ease;
  max-width: 800px;
  width: 100%;
}

.search-combo:focus-within {
  border-color: var(--accent);
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
  color: var(--text-tertiary);
  font-size: 20px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  /* outline 由 .search-combo:focus-within 的边框接管，聚焦仍然可见 */
  outline: none;
  font-size: 15px;
  color: var(--text-primary);
  background: transparent;
  padding: 12px 0;
  min-width: 0;
}

.search-input::placeholder {
  color: var(--text-tertiary);
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

/*
 * 主次分明：搜索是主操作（实心琥珀），新建会话是次操作（描边）。
 * 原来两个按钮都是实心且各用一种颜色，等于没有层级。
 * 琥珀底上用 --accent-on（深炭），不用白字——白字只有 ≈2.1:1 不过 AA。
 */
.search-btn {
  background: var(--accent);
  color: var(--accent-on);
}

.search-btn:hover {
  background: var(--accent-hover);
}

.search-btn:active {
  background: var(--accent-press);
}

.new-chat-btn {
  background: transparent;
  color: var(--text-primary);
  border-left: 1px solid var(--border-default);
}

.new-chat-btn:hover {
  background: var(--surface-hover);
  color: var(--accent-text);
}

.search-btn:focus-visible,
.new-chat-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
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
