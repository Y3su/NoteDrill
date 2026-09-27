// Unmocked first integration probe. No prerequisite bypass exists in the app.
import { configureQvac } from './environment.mjs';
configureQvac();
const sdk = await import('@qvac/sdk');
let modelId;
const timeout = setTimeout(() => { console.error('Live probe timed out after 15 minutes.'); sdk.close().finally(() => process.exit(1)); }, 900000);
let lastProgress = -10;
try {
  console.log('SDK 0.20.0; model:', sdk.QWEN3_4B_INST_Q4_K_M);
  modelId = await sdk.loadModel({ modelSrc: sdk.QWEN3_4B_INST_Q4_K_M, seed: false, modelConfig: { ctx_size: 8192, device: 'cpu', gpu_layers: 0 }, onProgress: p => { if (p.percentage >= lastProgress + 10) { lastProgress = p.percentage; console.log('Downloaded', p.downloaded, '/', p.total); } } });
  const run = sdk.completion({ modelId, history: [{ role: 'user', content: 'Use only this note: Tree canopies shade pavement. Leaves release water vapour through transpiration. Name the process by which leaves release water vapour. /no_think' }], stream: true, generationParams: { temp: 0.2, predict: 128, reasoning_budget: 0 }, kvCache: false });
  void run.final.catch(() => {});
  for await (const event of run.events) if (event.type === 'contentDelta') process.stdout.write(event.text);
  const result = await run.final;
  if (!result.contentText.trim() || result.stopReason === 'length') throw new Error('Empty or truncated completion');
  console.log('\nLIVE COMPLETION PASSED');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  if (modelId) await sdk.unloadModel({ modelId, clearStorage: false });
  await sdk.close();
}
