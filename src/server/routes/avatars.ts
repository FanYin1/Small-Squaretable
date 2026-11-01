import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../../core/config';

// Avatars are public profile images, unlike authenticated conversation uploads.
// Only generated, re-encoded WebP files in this dedicated directory are served.
export function createAvatarRoutes(storagePath = config.storagePath) {
  const routes = new Hono();
  routes.get('/:filename', async c => {
    const filename = c.req.param('filename');
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.webp$/.test(filename)) {
      return c.notFound();
    }
    try {
      const bytes = await readFile(join(storagePath, 'avatars', filename));
      return new Response(bytes, { headers: {
        'Content-Type': 'image/webp',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=31536000, immutable',
      } });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return c.notFound();
      throw error;
    }
  });
  return routes;
}
