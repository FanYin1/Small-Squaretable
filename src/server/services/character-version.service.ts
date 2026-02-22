/**
 * Character Version Service
 *
 * Manages version history for characters — creating snapshots,
 * listing versions, and retrieving specific versions.
 */

import { characterVersionRepository } from '../../db/repositories/character-version.repository';
import { logger } from './logger.service';

const versionLogger = logger.child({ module: 'character-version' });

export class CharacterVersionService {
  /**
   * Save a new version snapshot for a character.
   * Automatically increments the version number.
   */
  async saveVersion(
    characterId: string,
    cardData: Record<string, unknown>,
    userId: string,
    changeNote?: string,
  ) {
    const latestVersion = await characterVersionRepository.getLatestVersion(characterId);
    const newVersion = latestVersion + 1;

    versionLogger.info('Saving character version', { characterId, version: newVersion });

    return characterVersionRepository.create({
      characterId,
      version: newVersion,
      cardData,
      changeNote: changeNote ?? null,
      createdBy: userId,
    });
  }

  /**
   * List version history for a character.
   */
  async listVersions(characterId: string, limit = 20, offset = 0) {
    return characterVersionRepository.listByCharacter(characterId, limit, offset);
  }

  /**
   * Get a specific version by version number.
   */
  async getVersion(characterId: string, version: number) {
    return characterVersionRepository.getByVersion(characterId, version);
  }
}

export const characterVersionService = new CharacterVersionService();
