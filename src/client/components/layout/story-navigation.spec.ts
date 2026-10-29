import { describe, expect, it } from 'vitest';
import { storyNavigation, storyNavigationSection } from './story-navigation';

describe('story navigation', () => {
  it('shares exactly four ordered primary destinations', () => {
    expect(storyNavigation.map(item => item.name)).toEqual(['Chat', 'Market', 'MyCharacters', 'Profile']);
  });
  it.each([
    ['ChatSession', 'Chat'], ['Chat', 'Chat'], ['CharacterDetail', 'Market'], ['Search', 'Market'],
    ['Home', 'Market'], ['CharacterEdit', 'MyCharacters'], ['WorldBookDetail', 'MyCharacters'],
    ['PresetManager', 'MyCharacters'], ['Subscription', 'Profile'], ['UserPersonas', 'Profile'],
    ['AdminUsers', 'Profile'], ['SecuritySettings', 'Profile'],
  ])('groups %s under %s without duplicating active destinations', (name, section) => {
    expect(storyNavigationSection(name)).toBe(section);
    expect(storyNavigation.filter(item => item.name === storyNavigationSection(name))).toHaveLength(1);
  });
});
