import { mkdir, writeFile } from 'node:fs/promises';
import { QvacAdapter } from '../server/qvac.js';
import { sampleTitle, sampleText } from '../shared/sample.js';
const adapter = new QvacAdapter(undefined, undefined, raw => console.log('SAMPLE-ONLY RAW OUTPUT:', raw));
let last = '';
const ticker = setInterval(() => {
  const status = adapter.status;
  const text = `${status.phase}: ${status.message}${status.phase === 'downloading' && status.total ? ` (${Math.floor((status.downloaded || 0) / status.total * 100)}%)` : ''}`;
  if (text !== last) { console.log(text); last = text; }
}, 2000);
const timeout = setTimeout(() => { console.error('Live test exceeded 20 minutes.'); void adapter.shutdown().finally(() => process.exit(1)); }, 1200000);
try {
  await adapter.prepare();
  const quiz = await adapter.generate({ count: process.argv.includes('--five') ? 5 : 3, source: { id: 'sample', title: sampleTitle, text: sampleText } });
  await mkdir('.local', { recursive: true });
  await writeFile('.local/live-quiz.json', JSON.stringify(quiz, null, 2));
  console.log(JSON.stringify(quiz, null, 2));
  console.log('LIVE QVAC QUIZ PASSED. Inspect .local/live-quiz.json for educational correctness.');
} catch (error) { console.error(error); process.exitCode = 1; }
finally { clearInterval(ticker); clearTimeout(timeout); await adapter.shutdown(); }
