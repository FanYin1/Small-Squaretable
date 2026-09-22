/**
 * 上传契约测试。
 *
 * 这里做的事和普通单元测试不同：它读两侧的源码，确认前端真的用了这份契约、
 * 服务端也真的用了。因为缺陷本身就是「两侧各自有测试、各自都绿、
 * 但字段名对不上」——只断言常量的值，是钉不住任何东西的。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UPLOAD_FIELD, UPLOAD_PATH } from './upload';

const clientSource = readFileSync(
  join(__dirname, '../client/services/upload.api.ts'),
  'utf8',
);
const serverSource = readFileSync(join(__dirname, '../server/routes/uploads.ts'), 'utf8');

describe('上传契约', () => {
  it('字段名和路径都不为空且形状正确', () => {
    expect(UPLOAD_FIELD.audio).toBe('audio');
    expect(UPLOAD_FIELD.image).toBe('image');
    expect(UPLOAD_PATH.audio).toBe('/uploads/audio');
    expect(UPLOAD_PATH.image).toBe('/uploads/image');
  });

  it('路径不带复数 s——服务端挂的是 /image，不是 /images', () => {
    // 前端原来打的是 /uploads/images，直接 404
    expect(UPLOAD_PATH.image).not.toMatch(/images$/);
  });

  describe('前端确实从契约取值，而不是写死字面量', () => {
    it('upload.api.ts 引入了契约', () => {
      expect(clientSource).toMatch(/from '@\/types\/upload'/);
    });

    it('不再出现写死的 file 字段名', () => {
      expect(clientSource).not.toMatch(/append\(\s*['"]file['"]/);
    });

    it('不再出现写死的端点字面量', () => {
      expect(clientSource).not.toMatch(/['"]\/uploads\/(images?|audio)['"]/);
    });

    it('append 和请求路径都走 UPLOAD_FIELD / UPLOAD_PATH', () => {
      expect(clientSource).toMatch(/append\(\s*UPLOAD_FIELD\./);
      expect(clientSource).toMatch(/UPLOAD_PATH\./);
    });
  });

  describe('服务端确实从契约取值', () => {
    it('uploads.ts 引入了契约', () => {
      expect(serverSource).toMatch(/from '@\/types\/upload'/);
    });

    it('formData.get 用 UPLOAD_FIELD，不写死字符串', () => {
      expect(serverSource).not.toMatch(/formData\.get\(\s*['"](audio|image)['"]\s*\)/);
      expect(serverSource).toMatch(/formData\.get\(\s*UPLOAD_FIELD\./);
    });
  });
});
