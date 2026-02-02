import { ref } from 'vue';
import type { ResourceType } from '@client/services/usage.api';

const upgradePromptVisible = ref(false);
const upgradePromptResource = ref<ResourceType>('messages');

export function useUpgradePrompt() {
  function showUpgradePrompt(resourceType: ResourceType = 'messages') {
    upgradePromptResource.value = resourceType;
    upgradePromptVisible.value = true;
  }

  function hideUpgradePrompt() {
    upgradePromptVisible.value = false;
  }

  return {
    upgradePromptVisible,
    upgradePromptResource,
    showUpgradePrompt,
    hideUpgradePrompt,
  };
}
