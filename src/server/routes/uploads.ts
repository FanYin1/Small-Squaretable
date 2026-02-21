/**
 * Upload API Routes
 *
 * Handles file uploads (audio) with validation and tenant-isolated storage.
 */

import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { authMiddleware } from '../middleware/auth';
import { logger } from '../services/logger.service';
import { config } from '@/core/config';
import type { ApiResponse } from '../../types/api';

const uploadLogger = logger.child({ module: 'uploads' });

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/webm',
  'audio/mp3',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-m4a',
  'audio/m4a',
]);

const MIME_TO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp3': 'mp3',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
};

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB

export const uploadRoutes = new Hono();

uploadRoutes.post('/audio', authMiddleware(), async (c) => {
  const user = c.get('user');

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Invalid multipart form data' },
        meta: { timestamp: new Date().toISOString() },
      },
      400,
    );
  }

  const audioFile = formData.get('audio');
  if (!audioFile || !(audioFile instanceof File)) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'MISSING_FILE', message: 'Missing audio file' },
        meta: { timestamp: new Date().toISOString() },
      },
      400,
    );
  }

  // Validate MIME type
  if (!ALLOWED_AUDIO_MIMES.has(audioFile.type)) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'INVALID_MIME_TYPE',
          message: `Invalid audio type: ${audioFile.type}. Allowed: ${[...ALLOWED_AUDIO_MIMES].join(', ')}`,
        },
        meta: { timestamp: new Date().toISOString() },
      },
      400,
    );
  }

  // Validate file size
  if (audioFile.size > MAX_AUDIO_SIZE) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: `File exceeds maximum size of 25MB`,
        },
        meta: { timestamp: new Date().toISOString() },
      },
      400,
    );
  }

  const ext = MIME_TO_EXT[audioFile.type] || 'bin';
  const filename = `${randomUUID()}.${ext}`;
  const relativeDir = path.join(user.tenantId, 'audio');
  const absoluteDir = path.resolve(config.storagePath, relativeDir);
  const absolutePath = path.join(absoluteDir, filename);

  try {
    await fs.mkdir(absoluteDir, { recursive: true });
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    await fs.writeFile(absolutePath, buffer);
  } catch (error) {
    uploadLogger.error('Failed to save audio file', { error: String(error), tenantId: user.tenantId });
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'UPLOAD_FAILED', message: 'Failed to save audio file' },
        meta: { timestamp: new Date().toISOString() },
      },
      500,
    );
  }

  const url = `/uploads/${user.tenantId}/audio/${filename}`;
  uploadLogger.info('Audio uploaded', { tenantId: user.tenantId, filename, size: audioFile.size });

  return c.json<ApiResponse<{ url: string }>>(
    {
      success: true,
      data: { url },
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});
