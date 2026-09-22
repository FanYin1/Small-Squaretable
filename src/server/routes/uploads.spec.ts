/**
 * Upload Routes Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

const { mockCheckQuota, mockMeterUsage } = vi.hoisted(() => ({
  mockCheckQuota: vi.fn(),
  mockMeterUsage: vi.fn(),
}));

// Mock auth middleware
// tenantId 必须也设上：requireQuota 读的是 c.get('tenantId')，不是 user.tenantId
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
    c.set('tenantId', 'tenant-123');
    return next();
  },
}));

vi.mock('../services/feature.service', () => ({
  featureService: { checkQuota: mockCheckQuota },
}));

vi.mock('../services/usage-meter', () => ({
  meterUsage: mockMeterUsage,
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
import { UPLOAD_FIELD } from '@/types/upload';

// 默认字段名取自共享契约：写死 'audio' / 'image' 正是这些测试全绿
// 而真实前端请求必然 400 的原因——两侧各测自己那一半。
/** Helper to build a multipart FormData body with a File */
function buildAudioFormData(
  mime: string,
  size: number = 1024,
  fieldName: string = UPLOAD_FIELD.audio,
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
  fieldName: string = UPLOAD_FIELD.image,
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
    // 默认配额充足；需要测超限的用例自己覆盖
    mockCheckQuota.mockResolvedValue({
      allowed: true,
      currentUsage: 3,
      limit: 10,
      remaining: 7,
    });
    mockMeterUsage.mockResolvedValue(true);
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

  /**
   * images 配额此前既不计量也不拦截：PLAN_LIMITS 里 free 10 / pro 500 /
   * team 5000 三档写得明明白白，usage.ts 也把它显示在用量面板上，
   * 但上传路径上一次 checkQuota / meterUsage 都没有——面板永远显示 0，
   * 上限永远不会触发。写在套餐页上的限额只是装饰。
   */
  describe('images 配额', () => {
    it('配额耗尽时拒绝上传（403）且不写文件', async () => {
      mockCheckQuota.mockResolvedValue({
        allowed: false,
        currentUsage: 10,
        limit: 10,
        remaining: 0,
      });

      const res = await app.request('/uploads/image', {
        method: 'POST',
        body: buildImageFormData('image/png'),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('QUOTA_EXCEEDED');
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('拒绝时不记账——被拒的请求不该消耗配额', async () => {
      mockCheckQuota.mockResolvedValue({
        allowed: false,
        currentUsage: 10,
        limit: 10,
        remaining: 0,
      });

      await app.request('/uploads/image', {
        method: 'POST',
        body: buildImageFormData('image/png'),
      });

      expect(mockMeterUsage).not.toHaveBeenCalled();
    });

    it('查的是 images 配额，租户取自上下文', async () => {
      await app.request('/uploads/image', {
        method: 'POST',
        body: buildImageFormData('image/png'),
      });

      expect(mockCheckQuota).toHaveBeenCalledWith('tenant-123', 'images');
    });

    it('上传成功后记一次用量', async () => {
      const res = await app.request('/uploads/image', {
        method: 'POST',
        body: buildImageFormData('image/png'),
      });

      expect(res.status).toBe(200);
      expect(mockMeterUsage).toHaveBeenCalledWith(
        'tenant-123',
        'images',
        1,
        expect.objectContaining({ mime: 'image/png' }),
      );
    });

    it('错误响应带上用量和上限，前端才能提示「升级」而不是干报错', async () => {
      mockCheckQuota.mockResolvedValue({
        allowed: false,
        currentUsage: 10,
        limit: 10,
        remaining: 0,
      });

      const res = await app.request('/uploads/image', {
        method: 'POST',
        body: buildImageFormData('image/png'),
      });

      const data = await res.json();
      expect(data.error.message).toMatch(/10/);
    });

    it('校验失败的请求不该白耗一次配额检查之外的记账', async () => {
      await app.request('/uploads/image', {
        method: 'POST',
        body: buildImageFormData('application/pdf'),
      });

      expect(mockMeterUsage).not.toHaveBeenCalled();
    });

    it('写文件失败时不记账——不能为没存下来的图收费', async () => {
      vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error('disk full'));

      const res = await app.request('/uploads/image', {
        method: 'POST',
        body: buildImageFormData('image/png'),
      });

      expect(res.status).toBe(500);
      expect(mockMeterUsage).not.toHaveBeenCalled();
    });

    it('音频不计入 images 配额', async () => {
      await app.request('/uploads/audio', {
        method: 'POST',
        body: buildAudioFormData('audio/webm'),
      });

      expect(mockCheckQuota).not.toHaveBeenCalledWith('tenant-123', 'images');
      expect(mockMeterUsage).not.toHaveBeenCalledWith(
        'tenant-123',
        'images',
        expect.anything(),
        expect.anything(),
      );
    });
  });
});
