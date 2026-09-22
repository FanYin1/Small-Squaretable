/**
 * upload.api 测试
 *
 * 这里断言的是「实际发出去的请求」——字段名和 URL。
 * 缺陷原样：前端发 `file` + `/uploads/images`，服务端读 `audio`/`image`
 * + 挂 `/audio`/`/image`，音频必然 400、图片必然 404，而两侧单测都绿。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UPLOAD_FIELD, UPLOAD_PATH } from '@/types/upload';

const { mockApiRequest } = vi.hoisted(() => ({ mockApiRequest: vi.fn() }));

vi.mock('./api', () => ({ apiRequest: mockApiRequest }));

import { uploadApi } from './upload.api';

describe('uploadApi', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    mockApiRequest.mockResolvedValue({ url: '/uploads/t/audio/x.webm' });
  });

  function lastCall() {
    const [endpoint, options] = mockApiRequest.mock.calls[0];
    return { endpoint, options, body: options.body as FormData };
  }

  describe('uploadAudio', () => {
    it('用契约里的字段名装文件，而不是 file', () => {
      const file = new File([new ArrayBuffer(8)], 'r.webm', { type: 'audio/webm' });
      void uploadApi.uploadAudio(file);

      const { body } = lastCall();
      expect(body.get(UPLOAD_FIELD.audio)).toBe(file);
      expect(body.get('file')).toBeNull();
    });

    it('打服务端真实存在的路径', () => {
      void uploadApi.uploadAudio(new File([''], 'r.webm', { type: 'audio/webm' }));
      expect(lastCall().endpoint).toBe(UPLOAD_PATH.audio);
    });

    it('POST 且不自己设 Content-Type（要留给浏览器带 boundary）', () => {
      void uploadApi.uploadAudio(new File([''], 'r.webm', { type: 'audio/webm' }));
      const { options } = lastCall();
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({});
    });

    it('返回服务端给的 url', async () => {
      mockApiRequest.mockResolvedValue({ url: '/uploads/t/audio/a.webm' });
      const res = await uploadApi.uploadAudio(new File([''], 'a.webm', { type: 'audio/webm' }));
      expect(res.url).toBe('/uploads/t/audio/a.webm');
    });
  });

  describe('uploadImage', () => {
    it('用契约里的字段名装文件，而不是 file', () => {
      const file = new File([new ArrayBuffer(8)], 's.png', { type: 'image/png' });
      void uploadApi.uploadImage(file);

      const { body } = lastCall();
      expect(body.get(UPLOAD_FIELD.image)).toBe(file);
      expect(body.get('file')).toBeNull();
    });

    it('打 /uploads/image，不是复数的 /uploads/images', () => {
      void uploadApi.uploadImage(new File([''], 's.png', { type: 'image/png' }));
      const { endpoint } = lastCall();
      expect(endpoint).toBe(UPLOAD_PATH.image);
      expect(endpoint).not.toBe('/uploads/images');
    });
  });
});
