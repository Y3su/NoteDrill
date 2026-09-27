import express from 'express';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { requestSchema, type Job } from '../shared/domain.js';
import { Cancelled, explainError, QvacAdapter } from './qvac.js';
import { diagnostics } from './diagnostics.js';

export function createApp(adapter = new QvacAdapter(), production = true, port = 4317) {
  const app = express();
  const hosts = new Set([`127.0.0.1:${port}`, ...(!production ? ['127.0.0.1:5173'] : [])]);
  let job: Job | undefined;
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' });
    if (!hosts.has(req.headers.host || '')) return res.status(403).json({ error: 'Open NoteDrill using its 127.0.0.1 address.' });
    const origin = req.headers.origin;
    if (origin && ![...hosts].some(host => origin === `http://${host}`)) return res.status(403).json({ error: 'Request origin is not allowed.' });
    if (req.path.startsWith('/api')) {
      res.set('Cache-Control', 'no-store');
      if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site requests are not allowed.' });
      if (!['GET', 'HEAD'].includes(req.method) && (req.headers['x-notedrill'] !== 'local' || !req.is('application/json'))) return res.status(403).json({ error: 'A same-origin JSON request is required.' });
    }
    next();
  });
  app.use(express.json({ limit: '32kb', strict: true }));
  app.get('/api/status', (_req, res) => res.json(adapter.status));
  app.get('/api/diagnostics', async (_req, res) => res.json(await diagnostics()));
  app.post('/api/prepare', (_req, res) => {
    if (adapter.status.busy) return res.status(409).json({ error: 'An AI operation is already running.' });
    void adapter.prepare().catch(() => {});
    res.status(202).json({ accepted: true });
  });
  app.post('/api/cancel', async (_req, res) => { await adapter.cancel(); res.json({ accepted: true }); });
  app.post('/api/quizzes', (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join(' ') });
    if (adapter.status.busy || job?.state === 'running') return res.status(409).json({ error: 'A quiz or model operation is already running.' });
    if (!adapter.status.loaded) return res.status(409).json({ error: 'Prepare the local model first.' });
    const active: Job = { id: randomUUID(), state: 'running' }; job = active;
    void adapter.generate(parsed.data).then(quiz => { active.quiz = quiz; active.state = 'complete'; }).catch(error => { active.state = error instanceof Cancelled ? 'cancelled' : 'failed'; active.error = explainError(error); });
    res.status(202).json({ id: active.id });
  });
  app.get('/api/jobs/:id', (req, res) => job?.id === req.params.id ? res.json(job) : res.status(404).json({ error: 'This generation is no longer available. Please generate a new quiz.' }));
  app.post('/api/release', async (_req, res) => { if (adapter.status.busy) return res.status(409).json({ error: 'Stop the current operation first.' }); await adapter.shutdown(); res.json({ ok: true }); });
  app.post('/api/clear', async (_req, res) => { await adapter.shutdown(); job = undefined; res.json({ ok: true }); });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown local API route.' }));
  if (production) {
    app.use((_req, res, next) => { res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"); next(); });
    const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client');
    app.use(express.static(client));
    app.get('/', (_req, res) => res.sendFile(path.join(client, 'index.html')));
  }
  app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
    res.status(status).json({ error: status === 413 ? 'The request is too large. Select a smaller excerpt.' : status === 400 ? 'The request must contain valid JSON.' : 'The local service could not finish this operation. Retry or restart NoteDrill.' });
  });
  return app;
}
