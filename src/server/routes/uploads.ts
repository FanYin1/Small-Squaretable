/**
 * Upload API Routes
 *
 * Handles file uploads (audio, images) with validation and tenant-isolated storage.
 */

import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { authMiddleware } from '../middleware/auth';
import { logger } from '../services/logger.service';
import { config } from '@/core/config';
import type { ApiResponse } from '../../types/api';
import { UPLOAD_FIELD } from '@/types/upload';
import { featureService } from '../services/feature.service';
import { meterUsage } from '../services/usage-meter';

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

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
]);

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

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

  const audioFile = formData.get(UPLOAD_FIELD.audio);
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

uploadRoutes.post('/image', authMiddleware(), async (c) => {
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

  const imageFile = formData.get(UPLOAD_FIELD.image);
  if (!imageFile || !(imageFile instanceof File)) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'MISSING_FILE', message: 'Missing image file' },
        meta: { timestamp: new Date().toISOString() },
      },
      400,
    );
  }

  // Validate MIME type
  if (!ALLOWED_IMAGE_MIMES.has(imageFile.type)) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'INVALID_MIME_TYPE',
          message: `Invalid image type: ${imageFile.type}. Allowed: ${[...ALLOWED_IMAGE_MIMES].join(', ')}`,
        },
        meta: { timestamp: new Date().toISOString() },
      },
      400,
    );
  }

  // Validate file size
  if (imageFile.size > MAX_IMAGE_SIZE) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: `File exceeds maximum size of 5MB`,
        },
        meta: { timestamp: new Date().toISOString() },
      },
      400,
    );
  }

  // images 配额此前既不检查也不计量。PLAN_LIMITS 里 free 10 / pro 500 /
  // team 5000 写得明明白白，usage 面板也展示这一项，但上传路径上一次
  // checkQuota / meterUsage 都没有——面板永远是 0，上限永远不触发。
  //
  // 不用 requireQuota 中间件，是因为它返回的是裸 { error, message } 结构，
  // 而这个路由通篇是 ApiResponse 信封，前端按 error.code 分支。在这里内联
  // 检查能保持响应结构一致；顺序放在格式/大小校验之后，避免一个畸形请求
  // 也要先打一次数据库。
  const tenantId = c.get('tenantId');
  const quota = await featureService.checkQuota(tenantId, 'images');
  if (!quota.allowed) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `Image quota exceeded (${quota.currentUsage}/${quota.limit}). Upgrade your plan to upload more.`,
        },
        meta: { timestamp: new Date().toISOString() },
      },
      403,
    );
  }

  const ext = IMAGE_MIME_TO_EXT[imageFile.type] || 'png';
  const filename = `${randomUUID()}.${ext}`;
  const relativeDir = path.join(user.tenantId, 'images');
  const absoluteDir = path.resolve(config.storagePath, relativeDir);
  const absolutePath = path.join(absoluteDir, filename);

  try {
    await fs.mkdir(absoluteDir, { recursive: true });
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    await fs.writeFile(absolutePath, buffer);
  } catch (error) {
    uploadLogger.error('Failed to save image file', { error: String(error), tenantId: user.tenantId });
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'UPLOAD_FAILED', message: 'Failed to save image file' },
        meta: { timestamp: new Date().toISOString() },
      },
      500,
    );
  }

  const url = `/uploads/${user.tenantId}/images/${filename}`;
  uploadLogger.info('Image uploaded', { tenantId: user.tenantId, filename, size: imageFile.size });

  // 先落盘再记账：反过来的话写盘失败会留下幻影用量，等于为没存下来的图收费。
  // meterUsage 失败只进日志，不反过来打断已经成功的上传（见 usage-meter.ts）。
  await meterUsage(tenantId, 'images', 1, {
    mime: imageFile.type,
    size: imageFile.size,
    filename,
  });

  return c.json<ApiResponse<{ url: string }>>(
    {
      success: true,
      data: { url },
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});
