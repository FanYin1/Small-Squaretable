import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request } from 'node:https';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import WebSocket from 'ws';

const execute = promisify(execFile);
const suffix = randomUUID();
const network = `squaretable-proxy-check-${suffix}`;
const upstream = `${network}-upstream`;
const proxy = `${network}-proxy`;
const port = Number(process.env.BETA_PROXY_CHECK_PORT || 55443);
assert.ok(Number.isInteger(port) && port > 1024 && port <= 65535);
const origin = `https://localhost:${port}`;
const upstreamProgram = `
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
const server = createServer((request, response) => {
  if (request.url === '/events') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write('data: first\\n\\n');
    setTimeout(() => response.end('data: last\\n\\n'), 500);
    return;
  }
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ path: request.url, headers: request.headers }));
});
server.on('upgrade', (request, socket) => {
  const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: ' + accept + '\\r\\n\\r\\n');
  const message = Buffer.from('proxy-ok');
  socket.write(Buffer.concat([Buffer.from([129, message.length]), message]));
});
server.listen(55445, '0.0.0.0');
`;

async function docker(argumentsList) {
  return execute('docker', argumentsList, { timeout: 30000, maxBuffer: 1024 * 1024 });
}

function get(pathname, headers = {}) {
  return new Promise((resolveResponse, reject) => {
    const client = request(`${origin}${pathname}`, {
      hostname: '127.0.0.1', servername: 'localhost', rejectUnauthorized: false,
      headers: { Host: `localhost:${port}`, ...headers },
    }, response => {
      let content = '';
      const chunks = [];
      const protocol = response.socket.getProtocol();
      response.on('data', chunk => { content += chunk; chunks.push(chunk.toString()); });
      response.on('error', reject);
      response.on('end', () => resolveResponse({ status: response.statusCode, content, chunks, protocol }));
    });
    client.setTimeout(3000, () => client.destroy(new Error('Proxy request timed out')));
    client.on('error', reject);
    client.end();
  });
}

try {
  await docker(['network', 'create', '--label', 'squaretable.task=proxy-check', network]);
  await docker(['run', '-d', '--rm', '--name', upstream, '--network', network, '--network-alias', 'upstream', '--label', 'squaretable.task=proxy-check', 'node:22-bookworm-slim', 'node', '--input-type=module', '-e', upstreamProgram]);
  await docker(['run', '-d', '--rm', '--name', proxy, '--network', network, '--label', 'squaretable.task=proxy-check', '-p', `127.0.0.1:${port}:443`, '-e', 'BETA_SITE_ADDRESS=https://localhost', '-e', 'BETA_PROXY_UPSTREAM=upstream:55445', '-v', `${resolve('deploy/Caddyfile.beta')}:/etc/caddy/Caddyfile:ro`, 'caddy:2-alpine']);
  const deadline = Date.now() + 20000;
  while (true) {
    try {
      assert.equal((await get('/health/ready')).status, 200);
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise(resolveDelay => setTimeout(resolveDelay, 200));
    }
  }
  const response = await get('/chat/isolated?check=1', {
    'X-Forwarded-For': '203.0.113.99, 192.0.2.10',
    'X-Real-IP': '203.0.113.99', 'CF-Connecting-IP': '203.0.113.99',
  });
  assert.equal(response.status, 200);
  assert.ok(['TLSv1.2', 'TLSv1.3'].includes(response.protocol));
  const forwarded = JSON.parse(response.content);
  assert.equal(forwarded.path, '/chat/isolated?check=1');
  assert.equal(forwarded.headers['x-forwarded-proto'], 'https');
  assert.equal(forwarded.headers['x-forwarded-host'], `localhost:${port}`);
  assert.equal(forwarded.headers['x-real-ip'], forwarded.headers['x-forwarded-for']);
  assert.ok(forwarded.headers['x-real-ip']);
  assert.ok(!forwarded.headers['x-forwarded-for'].includes('203.0.113.99'));
  assert.ok(!forwarded.headers['x-forwarded-for'].includes('192.0.2.10'));
  assert.equal(forwarded.headers['cf-connecting-ip'], undefined);
  const stream = await get('/events');
  assert.equal(stream.status, 200);
  assert.equal(stream.chunks[0], 'data: first\n\n');
  assert.equal(stream.content, 'data: first\n\ndata: last\n\n');
  const socket = new WebSocket(`wss://127.0.0.1:${port}/ws`, {
    servername: 'localhost', rejectUnauthorized: false, handshakeTimeout: 5000,
    headers: { Host: `localhost:${port}` },
  });
  try {
    const [message] = await once(socket, 'message', { signal: AbortSignal.timeout(5000) });
    assert.equal(message.toString(), 'proxy-ok');
  } finally {
    socket.terminate();
  }
  console.info('Proxy check passed: local TLS, deep path/query forwarding, unbuffered SSE, WSS upgrade, spoofed client IP headers replaced. Local certificate verification is disabled only in this isolated check; public DNS/certificates are not verified.');
} finally {
  const cleanup = await Promise.allSettled([docker(['rm', '-f', proxy]), docker(['rm', '-f', upstream])]);
  const failures = cleanup.filter(result => result.status === 'rejected' && !result.reason.stderr?.includes('No such container'));
  try {
    await docker(['network', 'rm', network]);
  } catch (error) {
    if (!error.stderr?.includes('not found')) failures.push({ status: 'rejected', reason: error });
  }
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Proxy check resources could not be cleaned up');
}
