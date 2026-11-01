<script setup lang="ts">
import { inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { Fold, Expand } from '@element-plus/icons-vue';
import { workbenchNavigation } from './workbench';
const navigation = inject(workbenchNavigation, undefined);
const { t } = useI18n();
</script>
<template>
  <button v-if="navigation" type="button" class="workbench-icon workbench-navigation-toggle"
    :aria-expanded="navigation.mobile.value ? navigation.open.value : !navigation.collapsed.value"
    aria-controls="workbench-navigation"
    :aria-label="t(navigation.mobile.value ? 'chat.sidebar.openDrawer' : navigation.collapsed.value ? 'chat.sidebar.expand' : 'chat.sidebar.collapse')"
    @click="navigation.toggle">
    <Expand v-if="navigation.mobile.value || navigation.collapsed.value" /><Fold v-else />
  </button>
</template>
