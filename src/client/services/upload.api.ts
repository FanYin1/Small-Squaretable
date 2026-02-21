/**
 * Upload API service
 *
 * Provides typed API calls for file uploads.
 */

import { apiRequest } from './api';

export const uploadApi = {
  uploadImage: async (file: File): Promise<{ url: string; thumbnailUrl?: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    return apiRequest('/uploads/images', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type with boundary
    });
  },

  uploadAudio: async (file: File): Promise<{ url: string; duration?: number }> => {
    const formData = new FormData();
    formData.append('file', file);

    return apiRequest('/uploads/audio', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type with boundary
    });
  },
};
