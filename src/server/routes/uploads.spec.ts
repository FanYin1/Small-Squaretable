/**
 * Upload Routes Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// Mock auth middleware
vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', {
      id: 'user-123',
      tenantId: 'tenant-123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: null,
      role: 'user',
    });
    return next();
  },
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock('../services/logger.service', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// Mock config
vi.mock('@/core/config', () => ({
  config: {
    storagePath: '/tmp/test-uploads',
  },
}));

import { uploadRoutes } from './uploads';
import * as fs from 'fs/promises';

/** Helper to build a multipart FormData body with a File */
function buildAudioFormData(
  mime: string,
  size: number = 1024,
  fieldName: string = 'audio',
): FormData {
  const buffer = new ArrayBuffer(size);
  const file = new File([buffer], 'recording.webm', { type: mime });
  const form = new FormData();
  form.append(fieldName, file);
  return form;
}

/** Helper to build a multipart FormData body with an image File */
function buildImageFormData(
  mime: string,
  size: number = 1024,
  fieldName: string = 'image',
): FormData {
  const buffer = new ArrayBuffer(size);
  const file = new File([buffer], 'sprite.png', { type: mime });
  const form = new FormData();
  form.append(fieldName, file);
  return form;
}

describe('Upload Routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/uploads', uploadRoutes);
  });

  describe('POST /uploads/audio', () => {
    it('should reject request without audio file (400)', async () => {
      const form = new FormData();
      const res = await app.request('/uploads/audio', {
        method: 'POST',
        body: form,
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('MISSING_FILE');
    });

    it('should reject invalid MIME type (400)', async () => {
      const form = buildAudioFormData('video/mp4');
      const res = await app.request('/uploads/audio', {
        method: 'POST',
        body: form,
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_MIME_TYPE');
    });

    it('should reject file exceeding 25MB (400)', async () => {
      const oversized = 26 * 1024 * 1024; // 26 MB
      const form = buildAudioFormData('audio/webm', oversized);
      const res = await app.request('/uploads/audio', {
        method: 'POST',
        body: form,
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('FILE_TOO_LARGE');
    });

    it('should accept valid audio upload (200)', async () => {
      const form = buildAudioFormData('audio/webm');
      const res = await app.request('/uploads/audio', {
        method: 'POST',
        body: form,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.url).toMatch(/^\/uploads\/tenant-123\/audio\/[a-f0-9-]+\.webm$/);
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('tenant-123'),
        { recursive: true },
      );
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should accept audio/mpeg and map to .mp3 extension', async () => {
      const form = buildAudioFormData('audio/mpeg');
      const res = await app.request('/uploads/audio', {
        method: 'POST',
        body: form,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.url).toMatch(/\.mp3$/);
    });

    it('should return 500 when filesystem write fails', async () => {
      vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error('disk full'));
      const form = buildAudioFormData('audio/wav');
      const res = await app.request('/uploads/audio', {
        method: 'POST',
        body: form,
      });
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UPLOAD_FAILED');
    });
  });

  describe('POST /uploads/image', () => {
    it('should accept valid image upload and return correct URL path', async () => {
      const form = buildImageFormData('image/png');
      const res = await app.request('/uploads/image', {
        method: 'POST',
        body: form,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.url).toMatch(/^\/uploads\/tenant-123\/images\/[a-f0-9-]+\.png$/);
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('tenant-123'),
        { recursive: true },
      );
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should reject invalid MIME type with 400', async () => {
      const form = buildImageFormData('application/pdf');
      const res = await app.request('/uploads/image', {
        method: 'POST',
        body: form,
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_MIME_TYPE');
    });

    it('should reject file exceeding 5MB with 400', async () => {
      const oversized = 6 * 1024 * 1024; // 6 MB
      const form = buildImageFormData('image/png', oversized);
      const res = await app.request('/uploads/image', {
        method: 'POST',
        body: form,
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('FILE_TOO_LARGE');
    });
  });
});
