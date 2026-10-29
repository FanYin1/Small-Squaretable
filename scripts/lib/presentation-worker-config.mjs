import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'dotenv';
import { readPrivateFile } from './presentation-receipts.mjs';

export async function readPresentationWorkerConfig(path) {
  const settings = parse(await readPrivateFile(path, 16_384));
  const identifier = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!identifier.test(settings.PRESENTATION_WORKER_USER_ID ?? '') || !identifier.test(settings.PRESENTATION_WORKER_TENANT_ID ?? '')) {
    throw new Error('PRESENTATION_WORKER_OWNER_REQUIRED');
  }
  const target = new URL(settings.PRESENTATION_WORKER_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !target.port || target.search || target.hash) throw new Error('PRESENTATION_WORKER_TARGET');
  if (target.pathname === '/squaretable_beta_test') {
    if (target.hostname !== '127.0.0.1') throw new Error('PRESENTATION_WORKER_TARGET');
  } else if (target.pathname === '/squaretable_beta') {
    const inspected = await promisify(execFile)('docker', ['inspect', '--format', '{{json .NetworkSettings.Networks}}', 'squaretable-exploration-postgres-1']);
    const addresses = Object.values(JSON.parse(inspected.stdout)).map(network => network.IPAddress).filter(Boolean);
    if (target.port !== '5432' || !addresses.includes(target.hostname)) throw new Error('PRESENTATION_WORKER_TARGET');
  } else throw new Error('PRESENTATION_WORKER_TARGET');
  return settings;
}
