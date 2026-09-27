import { afterAll, beforeAll, expect, it } from 'vitest';
import { request, type Server } from 'node:http';
import { createApp } from '../../server/app';
let server: Server; let port: number;
beforeAll(async () => { server = createApp(undefined, false).listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve)); port = (server.address() as { port: number }).port; });
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
function send(path: string, headers: Record<string, string>, body?: string) {
  return new Promise<number>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: body === undefined ? 'GET' : 'POST', headers }, res => { res.resume(); resolve(res.statusCode!); });
    req.on('error', reject); req.end(body);
  });
}
it('accepts local requests and rejects arbitrary origins and DNS rebinding hosts', async () => {
  expect(await send('/api/status', { host: '127.0.0.1:4317' })).toBe(200);
  expect(await send('/api/status', { host: 'evil.test' })).toBe(403);
  expect(await send('/api/status', { host: '127.0.0.1:4317', origin: 'https://evil.test' })).toBe(403);
});
it('rejects mutation without the custom header', async () => expect(await send('/api/prepare', { host: '127.0.0.1:4317', 'Content-Type': 'application/json' }, '{}')).toBe(403));
it('rejects empty, huge and unknown quiz fields before running inference', async () => {
  const headers = { host: '127.0.0.1:4317', origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json', 'X-NoteDrill': 'local' };
  expect(await send('/api/quizzes', headers, '{}')).toBe(400);
  expect(await send('/api/quizzes', headers, JSON.stringify({ text: 'x'.repeat(40000) }))).toBe(413);
});
