import { configureQvac } from '../scripts/environment.mjs';
import { QvacAdapter } from './qvac.js';
import { createApp } from './app.js';
configureQvac();
const adapter = new QvacAdapter();
const server = createApp(adapter, !process.argv.includes('--dev')).listen(4317, '127.0.0.1', () => console.log('NoteDrill is ready at http://127.0.0.1:4317'));
let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true;
  server.close();
  const fallback = setTimeout(() => process.exit(1), 25000).unref();
  try { await adapter.shutdown(); clearTimeout(fallback); process.exit(0); } catch { process.exit(1); }
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
