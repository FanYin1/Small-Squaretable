import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { extname } from 'node:path';

export function createFrontendRoutes(root = './dist/client') {
  const routes = new Hono();
  const files = serveStatic({ root });
  const index = serveStatic({ root, path: 'index.html' });

  routes.get('*', async (context, next) => {
    const pathname = context.req.path;
    if (/^\/(api|ws|health|uploads)(\/|$)/.test(pathname)) return next();
    if (pathname === '/story-experience-demo.html' || pathname === '/stats.html') return next();
    const response = await files(context, async () => {});
    if (response) {
      if (pathname.startsWith('/assets/') && response.status === 200) {
        response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (response.headers.get('Content-Type')?.includes('text/html')) {
        response.headers.set('Cache-Control', 'no-cache');
      }
      return response;
    }
    if (extname(pathname) || !context.req.header('Accept')?.includes('text/html')) return next();
    context.header('Cache-Control', 'no-cache');
    return index(context, next);
  });

  return routes;
}
