import assert from 'node:assert/strict';
import { QvacAdapter, Cancelled } from '../server/qvac.js';
import { sampleTitle, sampleText } from '../shared/sample.js';
const adapter = new QvacAdapter();
try {
  await adapter.prepare();
  const started = adapter.generate({ count: 5, source: { id: 'cancel-test', title: sampleTitle, text: sampleText } });
  const outcome = started.then(() => 'complete', error => error);
  await new Promise(resolve => setTimeout(resolve, 1500));
  await adapter.cancel();
  const result = await outcome;
  assert(result instanceof Cancelled, 'Real SDK generation must report cancellation.');
  assert.equal(adapter.status.busy, false);
  assert.equal(adapter.status.phase, 'cancelled');
  await adapter.prepare();
  assert.equal(adapter.status.loaded, true);
  console.log('LIVE QVAC CANCELLATION AND RECOVERY PASSED');
} finally { await adapter.shutdown(); }
