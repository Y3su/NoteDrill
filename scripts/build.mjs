import { cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const args of [['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json'], ['node_modules/vite/bin/vite.js', 'build']]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
cpSync('scripts/vulkan.ps1', 'dist/scripts/vulkan.ps1');
