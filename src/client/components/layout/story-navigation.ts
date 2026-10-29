export const storyNavigation = [
  { name: 'Chat', label: 'storyShell.library', symbol: '▤' },
  { name: 'Market', label: 'storyShell.discover', symbol: '✧' },
  { name: 'MyCharacters', label: 'storyShell.create', symbol: '＋' },
  { name: 'Profile', label: 'storyShell.account', symbol: '◯' },
] as const;

export function storyNavigationSection(name: unknown): string {
  if (['Chat', 'ChatSession', 'ChatTemplates'].includes(String(name))) return 'Chat';
  if (['MyCharacters', 'CharacterCreate', 'CharacterEdit', 'WorldBooks', 'WorldBookDetail', 'PresetManager', 'CharacterTemplates'].includes(String(name))) return 'MyCharacters';
  if (['Home', 'Market', 'Search', 'CharacterDetail', 'SharedCharacter', 'UserProfile', 'ActivityFeed'].includes(String(name))) return 'Market';
  return 'Profile';
}
