import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { AppError, ValidationError } from '../../core/errors';
import { MAX_AVATAR_BYTES } from '../../types/user';

// Keep image bytes out of users.avatar_url (varchar(500)) and profile responses.
export async function prepareAvatar(source: string | undefined, storagePath: string) {
  if (source === undefined || !source.startsWith('data:')) {
    if (source && source.length > 500) throw new ValidationError('头像地址过长，请重新选择图片');
    return { url: source, discard: async () => {} };
  }
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
  if (!match || match[2].length > 4 * Math.ceil(MAX_AVATAR_BYTES / 3)) {
    throw new ValidationError('请选择不超过 5MB 的 PNG、JPEG 或 WebP 头像');
  }
  const input = Buffer.from(match[2], 'base64');
  if (input.length > MAX_AVATAR_BYTES) throw new ValidationError('头像不能超过 5MB');
  let image: Buffer;
  try {
    const options = { limitInputPixels: 20_000_000, sequentialRead: true };
    const metadata = await sharp(input, options).metadata();
    if (metadata.format !== match[1]) throw new Error('Image type mismatch');
    image = await sharp(input, options).rotate()
      .resize({ width: 256, height: 256, fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 80, effort: 2 }).toBuffer();
  } catch {
    throw new ValidationError('头像图片无法读取，请选择有效的 PNG、JPEG 或 WebP 图片');
  }
  const filename = `${randomUUID()}.webp`;
  const directory = join(storagePath, 'avatars');
  const file = join(directory, filename);
  const discard = async () => { await unlink(file).catch(() => {}); };
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(file, image, { flag: 'wx' });
  } catch {
    await discard();
    throw new AppError('头像暂时无法保存，请稍后重试', 503, 'AVATAR_SAVE_FAILED');
  }
  return { url: `/avatars/${filename}`, discard };
}
