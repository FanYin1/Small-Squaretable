<template>
  <el-dialog v-model="visible" title="上下文详情" width="min(560px, 92vw)">
    <el-empty description="本轮实际上下文详情暂未接入" />
    <p>当前无法查看后端实际选入的历史、世界书和记忆。页面上的文字估算不代表已发送给模型的内容。</p>
  </el-dialog>
</template>
<script setup lang="ts">
defineProps<{ chatId: string }>();
const visible = defineModel<boolean>({ required: true });
</script>
