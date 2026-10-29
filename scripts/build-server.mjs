import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

await rm('dist/server', { recursive: true, force: true });
await build({
  entryPoints: {
    index: 'src/server/index.ts',
    'services/plugin-sandbox': 'src/server/services/plugin-sandbox.ts',
    'workers/plugin.worker': 'src/server/workers/plugin.worker.ts',
    migrate: 'src/db/migrate.ts',
  },
  outdir: 'dist/server',
  chunkNames: 'services/[name]-[hash]',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});
