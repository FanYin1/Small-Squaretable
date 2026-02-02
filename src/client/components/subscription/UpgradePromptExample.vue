<!-- Example: Using UpgradePrompt in App.vue or MainLayout.vue -->
<script setup lang="ts">
import { useUpgradePrompt } from '@client/composables/useUpgradePrompt';
import { useSubscriptionStore } from '@client/stores/subscription';
import UpgradePrompt from '@client/components/subscription/UpgradePrompt.vue';

const { upgradePromptVisible, upgradePromptResource, hideUpgradePrompt } = useUpgradePrompt();
const subscriptionStore = useSubscriptionStore();
</script>

<template>
  <div>
    <!-- Your app content -->

    <!-- Global upgrade prompt -->
    <UpgradePrompt
      v-model:visible="upgradePromptVisible"
      :resource-type="upgradePromptResource"
      :current-plan="subscriptionStore.currentPlan"
      @close="hideUpgradePrompt"
    />
  </div>
</template>

<!--
  Usage in any component:

  import { useUpgradePrompt } from '@client/composables/useUpgradePrompt';

  const { showUpgradePrompt } = useUpgradePrompt();

  // When user hits quota limit:
  if (!quotaAllowed) {
    showUpgradePrompt('messages'); // or 'llm_tokens', 'images', 'api_calls'
  }
-->
