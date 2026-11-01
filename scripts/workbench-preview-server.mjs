import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const root = new URL('../docs/design/workbench-preview/', import.meta.url);
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/assets/azure.webp', ['assets/azure.webp', 'image/webp']],
  ['/assets/taiyan.webp', ['assets/taiyan.webp', 'image/webp']],
  ['/assets/newsreader.woff2', ['assets/newsreader.woff2', 'font/woff2']],
]);
const port = Number(process.env.WORKBENCH_PREVIEW_PORT || 5191);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');
const server = createServer(async (req, res) => {
  const asset = assets.get(new URL(req.url, 'http://localhost').pathname);
  if (!asset || !['GET','HEAD'].includes(req.method)) {res.writeHead(404);res.end();return;}
  try {
    const bytes = await readFile(new URL(asset[0], root));
    res.writeHead(200, {'Content-Type':asset[1], 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});
    res.end(req.method==='HEAD'?undefined:bytes);
  } catch {res.writeHead(500);res.end('Preview asset unavailable');}
});
server.listen(port, '127.0.0.1', () => console.log(`Workbench preview: http://127.0.0.1:${port}`));
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => server.close());
