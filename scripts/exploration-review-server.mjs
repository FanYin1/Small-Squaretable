import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.EXPERIENCE_REVIEW_PORT || 5189);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid EXPERIENCE_REVIEW_PORT');
const root = new URL('../docs/design/experience-review/', import.meta.url);
const comparisonRoot = new URL('../docs/design/exploration-07ac-integration/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', comparisonRoot), 'utf8'));
const routes = new Map([
  ['/', [new URL('index.html', root), 'text/html; charset=utf-8']],
  ['/style.css', [new URL('style.css', root), 'text/css; charset=utf-8']],
  ['/app.js', [new URL('app.js', root), 'text/javascript; charset=utf-8']],
  ['/fonts/newsreader-latin.woff2', [new URL('../public/fonts/newsreader-latin.woff2', import.meta.url), 'font/woff2']],
]);
for (const image of manifest.images) {
  if (!/^(reference|production)-(discover|detail|identity|library|create|account)-(390|768|1440)-(light|dark)\.webp$/.test(image.file)) throw new Error('Unexpected comparison image');
  routes.set(`/compare/${image.file}`, [new URL(image.file, comparisonRoot), 'image/webp']);
}
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  routes.set(`/play/play-${width}-${theme}.webp`, [new URL(`../docs/deployment/evidence/story-entry-creator-07ac-play-${width}-${theme}.webp`, import.meta.url), 'image/webp']);
}
const server = createServer(async (request, response) => {
  const asset = routes.get((request.url || '/').split('?')[0]);
  if (!asset || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404); response.end(); return; }
  try {
    const bytes = await readFile(asset[0]);
    response.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; connect-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch { response.writeHead(500); response.end('Review asset unavailable'); }
});
server.listen(port, '127.0.0.1', () => console.info(`Experience review: http://localhost:${port}; static assets and scripted examples only`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
