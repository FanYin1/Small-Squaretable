import type { InjectionKey, Ref } from 'vue';

export const workbenchSection: InjectionKey<Ref<string | undefined>> = Symbol('workbench-section');
export const workbenchRoutes = new Set([
  'Market', 'MyCharacters', 'CharacterDetail', 'CharacterCreate', 'CharacterEdit',
  'Chat', 'ChatSession', 'Profile', 'Subscription',
]);

export const workbenchNavigation: InjectionKey<{
  mobile: Ref<boolean>; collapsed: Ref<boolean>; open: Ref<boolean>;
  toggle: () => void;
}> = Symbol('workbench-navigation');
