// Unmocked production API check. Start the production app first.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const base = 'http://127.0.0.1:4317';
const source = await readFile(new URL('../sample-notes/urban-trees.md', import.meta.url), 'utf8');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function call(route, body) {
  const response = await fetch(base + '/api' + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-NoteDrill': 'local', Origin: base }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const value = await response.json(); if (!response.ok) throw new Error(value.error); return value;
}
console.log('Checking real production service. No mock responses.');
await call('/prepare', {});
let status;
for (let i = 0; i < 600; i++) {
  status = await call('/status');
  if (status.phase === 'failed') throw new Error(status.message);
  if (status.loaded && !status.busy) break;
  await delay(1000);
}
if (!status.loaded) throw new Error('Model preparation timed out.');
const job = await call('/quizzes', { count: 3, source: { id: 'production-sample', title: 'Urban trees · production test', text: source } });
for (let i = 0; i < 900; i++) {
  const value = await call('/jobs/' + job.id);
  if (value.state === 'complete') {
    if (value.quiz.questions.length !== 3) throw new Error('Wrong question count');
    await mkdir('.local', { recursive: true });
    await writeFile('.local/production-quiz.json', JSON.stringify(value.quiz, null, 2));
    console.log('Real production quiz passed. Evidence saved to .local/production-quiz.json');
    process.exit(0);
  }
  if (value.state !== 'running') throw new Error(value.error || value.state);
  await delay(1000);
}
await call('/cancel', {}); throw new Error('Generation timed out.');
