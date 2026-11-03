import type { StoryIntent } from './story-intent';
import { applyStoryAction, availableStoryActions, type StoryRules, type StoryValues, type StoryAction } from './story-state';

/** The model selects authored actions; only the deterministic rules change values. */
export function resolveStoryExecution(rules: StoryRules | null, values: StoryValues, completed: string[], intent?: StoryIntent | null) {
  const actions: StoryAction[] = [];
  let nextValues = values;
  const completedActions = [...completed];
  if (intent?.disposition !== 'execution') return { actions, nextValues };
  for (const step of intent.steps) {
    if (step.kind !== 'execute') continue;
    const action = availableStoryActions(rules, nextValues, completedActions).find(candidate => candidate.id === step.actionId);
    if (!rules || !action) throw new Error('The current state does not allow this action.');
    nextValues = applyStoryAction(rules, action, nextValues);
    actions.push(action);
    completedActions.push(action.id);
  }
  return { actions, nextValues };
}
