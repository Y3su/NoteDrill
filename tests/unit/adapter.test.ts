// SDK doubles exercise control flow only. npm run test:live uses real QVAC.
import { expect, it, vi } from 'vitest';
import { QvacAdapter } from '../../server/qvac';
import { sampleText, sampleTitle } from '../../shared/sample';
type SDK = NonNullable<ConstructorParameters<typeof QvacAdapter>[0]>;
const report = async () => ({ platform: 'test', node: '24', availableMemory: 4e9, cacheDirectory: '/test', blockers: [], warnings: [] });
const input = { count: 3 as const, source: { id: 'sample', title: sampleTitle, text: sampleText } };
function fixture() {
  const mock = { loadModel: vi.fn(() => Object.assign(Promise.resolve('model'), { requestId: 'load' })), completion: vi.fn(), cancel: vi.fn(async () => {}), unloadModel: vi.fn(async () => {}), close: vi.fn(async () => {}), QWEN3_4B_INST_Q4_K_M: {} };
  return { mock, adapter: new QvacAdapter(mock as unknown as SDK, report) };
}
it('deduplicates loads and reuses the loaded model', async () => { const { adapter, mock } = fixture(); const a = adapter.prepare(); const b = adapter.prepare(); expect(a).toBe(b); await a; await adapter.prepare(); expect(mock.loadModel).toHaveBeenCalledTimes(1); await adapter.shutdown(); expect(mock.unloadModel).toHaveBeenCalledWith({ modelId: 'model', clearStorage: false }); });
it('targets cancellation at the SDK and unlocks the next operation', async () => {
  const { adapter, mock } = fixture(); await adapter.prepare();
  let resolve!: (value: unknown) => void;
  const final = new Promise(r => { resolve = r; });
  mock.completion.mockReturnValue({ requestId: 'real-target', events: (async function* () { await final; })(), final });
  mock.cancel.mockImplementation(async () => { resolve({ contentText: '', stopReason: 'cancelled' }); });
  const job = adapter.generate(input); const expectation = expect(job).rejects.toThrow(/Stopped/);
  await vi.waitFor(() => expect(mock.completion).toHaveBeenCalled());
  await expect(adapter.generate(input)).rejects.toThrow(/still running/);
  await adapter.cancel(); await expectation;
  expect(mock.cancel).toHaveBeenCalledWith({ requestId: 'real-target' }); expect(adapter.status.busy).toBe(false); expect(adapter.status.phase).toBe('cancelled'); await adapter.shutdown();
});
it('closes a crashed worker and permits explicit reload', async () => {
  const { adapter, mock } = fixture(); await adapter.prepare(); mock.completion.mockImplementation(() => { throw new Error('worker crashed'); });
  await expect(adapter.generate(input)).rejects.toThrow(/worker crashed/); expect(adapter.status.loaded).toBe(false); expect(adapter.status.busy).toBe(false);
  await adapter.prepare(); expect(mock.loadModel).toHaveBeenCalledTimes(2); await adapter.shutdown();
});
it('makes no more than two repair attempts', async () => {
  const { adapter, mock } = fixture(); await adapter.prepare(); mock.completion.mockImplementation(() => ({ requestId: 'bad-json', events: (async function* () {})(), final: Promise.resolve({ contentText: '{', stopReason: 'eos' }) }));
  await expect(adapter.generate(input)).rejects.toThrow(/JSON/); expect(mock.completion).toHaveBeenCalledTimes(3); expect(adapter.status.busy).toBe(false); await adapter.shutdown();
});
it('rejects truncated output even when it happens to parse', async () => {
  const { adapter, mock } = fixture(); await adapter.prepare(); mock.completion.mockImplementation(() => ({ requestId: 'truncated', events: (async function* () {})(), final: Promise.resolve({ contentText: '{"questions":[]}', stopReason: 'length' }) }));
  await expect(adapter.generate(input)).rejects.toThrow(/before completing/); expect(mock.completion).toHaveBeenCalledTimes(3); await adapter.shutdown();
});
it('recovers from failed preparation without retry loops', async () => {
  const { adapter, mock } = fixture(); mock.loadModel.mockImplementationOnce(() => Object.assign(Promise.reject(new Error('native runtime missing')), { requestId: 'failed-load' }));
  await expect(adapter.prepare()).rejects.toThrow(); expect(mock.loadModel).toHaveBeenCalledTimes(1); expect(adapter.status.phase).toBe('failed'); await adapter.prepare(); expect(adapter.status.phase).toBe('ready'); await adapter.shutdown();
});

it('rejects structurally valid questions that fail local semantic review', async () => {
  const { adapter, mock } = fixture(); await adapter.prepare();
  const draft = JSON.stringify({ questions: [{ quote: 'Leaves also release water vapour through transpiration.', answer: 'transpiration', explanation: 'Leaves also release water vapour through transpiration.', distractors: ['Infiltration', 'Compaction', 'Shading'] }] });
  let calls = 0;
  mock.completion.mockImplementation(() => ({ requestId: 'review', events: (async function* () {})(), final: Promise.resolve({ contentText: calls++ % 2 === 0 ? draft : JSON.stringify({ valid: false, reason: 'Mocked semantic rejection' }), stopReason: 'eos' }) }));
  await expect(adapter.generate(input)).rejects.toThrow('Mocked semantic rejection');
  expect(mock.completion).toHaveBeenCalledTimes(6);
  expect(adapter.status.completed).toBe(0);
  expect(adapter.status.busy).toBe(false);
  await adapter.shutdown();
});
