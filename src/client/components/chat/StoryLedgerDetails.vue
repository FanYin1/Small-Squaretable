<template>
  <section class="ledger-details" aria-label="故事账簿">
    <h3>{{ snapshot.opening ? '开局账簿' : '当轮账簿' }}</h3>
    <p class="ledger-origin">{{ snapshot.opening ? '开局记录 · 不代表当前余额' : '模型描述 · 未经规则核验' }} · {{ snapshot.version != null ? `第 ${snapshot.version} 轮` : `回复 ${snapshot.messageId}` }}</p>
    <p v-if="busy" role="status">本轮仍在生成，以下保留此前已保存的描述。</p>
    <p class="ledger-help">预计收益尚未到账，参考市价不代表已成交。这里显示已加载回复的当轮描述，不替代概况中的规则确认值。</p>
    <details v-for="(section, index) in snapshot.ledger.sections" :key="section.title" :open="index < 2">
      <summary>{{ section.title }}</summary>
      <div v-if="section.title === '商品库存' && snapshot.ledger.inventory" class="ledger-table-wrap">
        <table><thead><tr><th>商品</th><th>数量</th><th>参考市价</th></tr></thead><tbody><tr v-for="(row, i) in snapshot.ledger.inventory" :key="i"><td>{{ row.name }}</td><td>{{ row.quantity }}</td><td>{{ row.price }}</td></tr></tbody></table>
      </div>
      <p v-else class="ledger-text">{{ section.text }}</p>
    </details>
    <details class="ledger-original"><summary>查看账簿原文</summary><pre>{{ snapshot.ledger.raw }}</pre></details>
    <button type="button" @click="$emit('source', Number(snapshot.messageId))">阅读整条回复原文</button>
  </section>
</template>
<script setup lang="ts">
import type { StoryLedgerSnapshot } from '../../utils/story-ledger';
defineProps<{ snapshot: StoryLedgerSnapshot; busy: boolean }>();
defineEmits<{ source: [id: number] }>();
</script>
<style scoped>
.ledger-origin, .ledger-help { color: var(--text-secondary); font-size: 13px; line-height: 1.7; }
.ledger-details details { border-top: 1px solid var(--border-default); padding-block: 8px; }
.ledger-details summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; }
.ledger-text, .ledger-original pre { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.8; font: inherit; }
.ledger-table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 10px 6px; text-align: left; border-bottom: 1px solid var(--border-default); overflow-wrap: anywhere; }
button { min-height: 44px; padding: 8px 12px; background: var(--bg-subtle); border: 1px solid var(--border-default); border-radius: 8px; color: var(--text-primary); cursor: pointer; }
</style>
