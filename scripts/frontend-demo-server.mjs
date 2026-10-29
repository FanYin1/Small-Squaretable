import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.FRONTEND_DEMO_PORT || 5187);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid FRONTEND_DEMO_PORT');
const root = new URL('../docs/design/frontend-redesign-demo/', import.meta.url);
const routes = new Map([
  ['/', [new URL('index.html', root), 'text/html; charset=utf-8']],
  ['/demo.css', [new URL('demo.css', root), 'text/css; charset=utf-8']],
  ['/demo.js', [new URL('demo.js', root), 'text/javascript; charset=utf-8']],
  ...['newsreader-latin.woff2', 'plus-jakarta-sans-latin.woff2'].map(name => [`/fonts/${name}`, [new URL(`../public/fonts/${name}`, import.meta.url), 'font/woff2']]),
]);
const server = createServer(async (request, response) => {
  const route = routes.get((request.url || '/').split('?')[0]);
  if (!route || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404); response.end(); return; }
  try {
    const data = await readFile(fileURLToPath(route[0]));
    response.writeHead(200, {
      'Content-Type': route[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch {
    response.writeHead(500); response.end('Demo asset unavailable');
  }
});
server.listen(port, '127.0.0.1', () => console.info(`Frontend design demo: http://localhost:${port} (fixtures only; no business API)`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
