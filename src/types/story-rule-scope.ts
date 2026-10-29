import { openingModeScope, openingModeScopeMessage } from './story-opening-mode';
import { firstTaskScope, firstTaskScopeMessage } from './story-first-task';

export const storyRuleScopes = [openingModeScope, firstTaskScope] as const;
export const storyRuleScopeMessages: Record<typeof storyRuleScopes[number], string> = {
  [openingModeScope]: openingModeScopeMessage,
  [firstTaskScope]: firstTaskScopeMessage,
};
export const storyRuleScopeReasons = {
  [openingModeScope]: 'reviewed-opening-mode',
  [firstTaskScope]: 'reviewed-first-task',
} as const;
