<script setup lang="ts">
/**
 * 作者侧审核状态徽标
 *
 * 只显示「已发布 / 未发布」会骗人：发布后角色进入 pending，而公开发现入口
 * 要求 approved，所以作者以为上线了、实际还在排队；被驳回的角色永远不会出现
 * 在市场里，作者却看不到任何解释。
 *
 * draft 刻意不渲染：未发布是默认状态，给每张未发布的卡片挂个徽标只是噪音。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ModerationStatusValue, ViolationCategory } from '@/types/moderation';

const props = defineProps<{
  status?: ModerationStatusValue;
  category?: ViolationCategory;
  note?: string;
}>();

const { t } = useI18n();

const TAG_TYPES: Record<string, string> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  hidden: 'info',
};

const visible = computed(() => Boolean(props.status && props.status in TAG_TYPES));
const tagType = computed(() => (props.status ? TAG_TYPES[props.status] : 'info'));
const label = computed(() => (props.status ? t(`moderation.status.${props.status}`) : ''));

/** 分类和理由拼在一起：作者需要同时知道「触碰了哪条线」和「具体哪里」 */
const detail = computed(() => {
  const parts: string[] = [];
  if (props.category) parts.push(t(`report.categories.${props.category}`));
  if (props.note) parts.push(props.note);
  return parts.join('：');
});
</script>

<template>
  <el-tooltip v-if="visible && detail" :content="detail" placement="top">
    <el-tag :type="tagType" size="small" effect="light">{{ label }}</el-tag>
  </el-tooltip>
  <el-tag v-else-if="visible" :type="tagType" size="small" effect="light">{{ label }}</el-tag>
</template>
