<!-- src/client/components/debug/EmotionScatterPlot.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, GraphicComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

use([ScatterChart, GridComponent, TooltipComponent, GraphicComponent, CanvasRenderer]);

interface EmotionPoint {
  valence: number;
  arousal: number;
  label: string;
  timestamp?: string;
}

interface Props {
  currentEmotion: EmotionPoint | null;
  emotionHistory: EmotionPoint[];
}

const props = defineProps<Props>();

const chartOption = computed(() => {
  const history = props.emotionHistory;
  const len = history.length;

  // History series: older → lighter/smaller, newer → darker/larger
  const historyData = history.map((pt, i) => {
    const age = len > 1 ? i / (len - 1) : 0; // 0 = newest, 1 = oldest
    const size = 12 - age * 8; // 12px newest → 4px oldest
    const alpha = 1 - age * 0.65; // 1.0 → 0.35
    return {
      value: [pt.valence, pt.arousal],
      symbolSize: size,
      itemStyle: {
        color: `rgba(64, 158, 255, ${alpha})`,
      },
      label: pt.label,
      timestamp: pt.timestamp ?? '',
    };
  });

  // Current emotion highlight
  const currentData = props.currentEmotion
    ? [{
        value: [props.currentEmotion.valence, props.currentEmotion.arousal],
        symbolSize: 16,
        itemStyle: { color: '#E6A23C', borderColor: '#fff', borderWidth: 2 },
        label: props.currentEmotion.label,
        timestamp: '',
      }]
    : [];
  // Quadrant labels
  const quadrantLabels = [
    { left: '8%', top: '8%', text: 'Angry / Fearful', color: '#F56C6C' },
    { right: '8%', top: '8%', text: 'Excited / Happy', color: '#67C23A' },
    { left: '8%', bottom: '8%', text: 'Sad / Bored', color: '#409EFF' },
    { right: '8%', bottom: '8%', text: 'Calm / Loving', color: '#A855F6' },
  ];

  return {
    grid: {
      left: '12%',
      right: '8%',
      top: '10%',
      bottom: '15%',
      backgroundColor: 'rgba(128,128,128,0.03)',
      show: true,
      borderColor: 'rgba(128,128,128,0.15)',
    },
    graphic: quadrantLabels.map((q) => ({
      type: 'text' as const,
      ...( q.left ? { left: q.left } : {}),
      ...( q.right ? { right: q.right } : {}),
      ...( q.top ? { top: q.top } : {}),
      ...( q.bottom ? { bottom: q.bottom } : {}),
      style: {
        text: q.text,
        fill: q.color,
        fontSize: 11,
        fontWeight: 500 as const,
        opacity: 0.6,
      },
    })),
    xAxis: {
      type: 'value' as const,
      name: 'Valence',
      nameLocation: 'center' as const,
      nameGap: 28,
      min: -1,
      max: 1,
      splitLine: { lineStyle: { type: 'dashed' as const, opacity: 0.3 } },
    },
    yAxis: {
      type: 'value' as const,
      name: 'Arousal',
      nameLocation: 'center' as const,
      nameGap: 35,
      min: 0,
      max: 1,
      splitLine: { lineStyle: { type: 'dashed' as const, opacity: 0.3 } },
    },
    tooltip: {
      trigger: 'item' as const,
      formatter: (params: { data: { label: string; value: number[]; timestamp: string } }) => {
        const d = params.data;
        const ts = d.timestamp ? `<br/>Time: ${d.timestamp}` : '';
        return `<b>${d.label}</b><br/>Valence: ${d.value[0].toFixed(2)}<br/>Arousal: ${d.value[1].toFixed(2)}${ts}`;
      },
    },
    series: [
      {
        name: 'History',
        type: 'scatter' as const,
        data: historyData,
        encode: { x: 0, y: 1 },
      },
      {
        name: 'Current',
        type: 'scatter' as const,
        data: currentData,
        encode: { x: 0, y: 1 },
        label: {
          show: currentData.length > 0,
          formatter: (p: { data: { label: string } }) => p.data.label,
          position: 'top' as const,
          fontSize: 11,
          fontWeight: 600 as const,
          color: '#E6A23C',
        },
      },
    ],
  };
});
</script>

<template>
  <div class="emotion-scatter">
    <v-chart :option="chartOption" autoresize style="height: 300px" />
  </div>
</template>

<style scoped>
.emotion-scatter {
  background: var(--bg-surface, #fafafa);
  border-radius: 8px;
  padding: 8px;
}
</style>
