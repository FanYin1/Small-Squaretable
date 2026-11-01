import type { StoryEntryProfile } from './story-opening';
import type { StoryCapabilities } from './story-capabilities';

/** Read-only presentation; original card data is fetched separately for editing/export. */
export interface CharacterDetailPreview {
  introduction: StoryEntryProfile['description'];
  opening: string;
  scenario: string;
  personality: string;
  creator: string;
  creatorNotes: string;
  capabilities: StoryCapabilities;
}
