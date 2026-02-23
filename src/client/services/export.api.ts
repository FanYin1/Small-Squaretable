/**
 * Export/Import API
 *
 * Handles character and chat export/import operations
 */

import { api } from './api';

export const exportApi = {
  /**
   * Export character as PNG (with embedded card data)
   */
  exportCharacterPng: (characterId: string): Promise<Blob> => {
    return api.getBlob(`/characters/${characterId}/export/png`);
  },

  /**
   * Export chat as JSON
   */
  exportChatJson: (chatId: string): Promise<Blob> => {
    return api.getBlob(`/chats/${chatId}/export?format=json`);
  },

  /**
   * Export chat as plain text
   */
  exportChatTxt: (chatId: string): Promise<Blob> => {
    return api.getBlob(`/chats/${chatId}/export?format=txt`);
  },

  /**
   * Batch export characters (returns ZIP)
   */
  batchExportCharacters: (characterIds: string[], format: 'json' | 'png' = 'json'): Promise<Blob> => {
    return api.postBlob('/characters/export/batch', { characterIds, format });
  },

  /**
   * Batch import characters from files
   */
  batchImportCharacters: (files: File[]): Promise<{ imported: number; failed: number; errors: string[] }> => {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    return api.postFormData('/characters/import/batch', formData);
  },
};
