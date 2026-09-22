/**
 * Upload API service
 *
 * Provides typed API calls for file uploads.
 *
 * 字段名和路径一律取自 @/types/upload —— 此前这里写死 `file` 和
 * `/uploads/images`，和服务端的 `audio` / `image`、`/audio` / `/image`
 * 两处都对不上，音频上传必然 400、图片上传 404。见 types/upload.spec.ts。
 */

import { apiRequest } from './api';
import { UPLOAD_FIELD, UPLOAD_PATH, type UploadResult } from '@/types/upload';

export const uploadApi = {
  uploadImage: async (file: File): Promise<UploadResult> => {
    const formData = new FormData();
    formData.append(UPLOAD_FIELD.image, file);

    return apiRequest<UploadResult>(UPLOAD_PATH.image, {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type with boundary
    });
  },

  uploadAudio: async (file: File): Promise<UploadResult> => {
    const formData = new FormData();
    formData.append(UPLOAD_FIELD.audio, file);

    return apiRequest<UploadResult>(UPLOAD_PATH.audio, {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type with boundary
    });
  },
};
