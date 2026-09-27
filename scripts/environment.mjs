import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const dataDirectory = process.platform === 'win32'
  ? join(process.env.LOCALAPPDATA || homedir(), 'NoteDrill')
  : join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'notedrill');
export const cacheDirectory = join(dataDirectory, 'models');
export function configureQvac() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 17)) throw new Error('NoteDrill needs Node.js 22.17 or newer. Install Node.js 24 LTS, then reopen your terminal.');
  mkdirSync(dataDirectory, { recursive: true });
  const config = join(dataDirectory, 'qvac.config.json');
  writeFileSync(config, JSON.stringify({ cacheDirectory, loggerConsoleOutput: false, loggerLevel: 'error', swarmRelays: [], registryDownloadMaxRetries: 1, registryStreamTimeoutMs: 30000, rpcInitTimeoutMs: 90000, requireSecureTransport: true, requireHttpChecksum: true }));
  process.env.QVAC_CONFIG_PATH = config;
}
