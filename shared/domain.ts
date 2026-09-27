import { z } from 'zod';

export const MAX_NOTE_BYTES = 100_000;
export const MAX_EXCERPT_BYTES = 4_000;
export const bytes = (text: string) => new TextEncoder().encode(text).length;
export const normalize = (text: string) => text.replace(/\s+/gu, ' ').trim();
const nonempty = (max: number) => z.string().trim().min(1).max(max);
export const questionSchema = z.object({
  question: nonempty(220),
  options: z.array(nonempty(180)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: nonempty(600),
  sourceId: nonempty(100),
  quote: z.string().trim().min(20).max(650),
}).strict();
export type Question = z.infer<typeof questionSchema>;
export const sourceSchema = z.object({ id: nonempty(100), title: nonempty(120), text: nonempty(100_000) }).strict();
export type Source = z.infer<typeof sourceSchema>;
export const requestSchema = z.object({ count: z.union([z.literal(3), z.literal(5)]), source: sourceSchema }).strict().superRefine((value, ctx) => {
  if (bytes(value.source.text) > MAX_EXCERPT_BYTES) ctx.addIssue({ code: 'custom', message: 'Select a smaller excerpt (at most 4,000 UTF-8 bytes).' });
  if (normalize(value.source.text).length < value.count * 90) ctx.addIssue({ code: 'custom', message: 'Add more factual notes for this quiz. Aim for at least a few detailed paragraphs.' });
});
export type QuizRequest = z.infer<typeof requestSchema>;
// Evidence comes first in the model response. The app assembles and shuffles choices,
// so the model cannot disagree with itself about which answer index is correct.
export const draftSchema = z.object({ questions: z.array(z.object({
  quote: z.string().trim().min(20).max(180), answer: nonempty(80),
  explanation: nonempty(600), distractors: z.array(nonempty(180)).length(3),
}).strict()).max(1) }).strict();
export const draftJsonSchema = {
  type: 'object', additionalProperties: false, properties: { questions: { type: 'array', minItems: 0, maxItems: 1, items: {
    type: 'object', additionalProperties: false, properties: {
      quote: { type: 'string', minLength: 20, maxLength: 180 }, answer: { type: 'string', minLength: 2, maxLength: 80 },
      explanation: { type: 'string', minLength: 10, maxLength: 600 },
      distractors: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string', minLength: 2, maxLength: 180 } },
    }, required: ['quote', 'answer', 'explanation', 'distractors'],
  } } }, required: ['questions'],
};
export function validateDraft(raw: string, source: Source, previous: Question[], correctIndex: number): Question {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new OutputError('The model did not return complete JSON.'); }
  const parsed = draftSchema.safeParse(data);
  if (!parsed.success) throw new OutputError('Return one question, one quote, one short answer, one explanation and three distinct distractors.');
  const draft = parsed.data.questions[0];
  if (!draft) throw new InsufficientMaterialError('The model could not find enough facts. Add more detailed notes or select another excerpt.');
  if (!normalize(source.text).includes(normalize(draft.explanation))) throw new OutputError('Copy the explanation exactly from the supplied passage; do not paraphrase or add claims.');
  const quote = normalize(draft.quote);
  const answer = normalize(draft.answer);
  const position = quote.toLowerCase().indexOf(answer.toLowerCase());
  if (position < 0) throw new OutputError('Use an exact phrase from the supporting quote as the correct answer.');
  const before = quote.slice(0, position).at(-1) || '';
  const after = quote.slice(position + answer.length, position + answer.length + 1);
  if ((/[\p{L}\p{N}]/u.test(before) && /^[\p{L}\p{N}]/u.test(answer)) || (/[\p{L}\p{N}]$/u.test(answer) && /[\p{L}\p{N}]/u.test(after))) throw new OutputError('Select whole words, not part of a word, for the answer.');
  if (quote.toLowerCase().indexOf(answer.toLowerCase(), position + answer.length) >= 0 || quote.length - answer.length < 15) throw new OutputError('Choose a short answer that appears once in a complete factual sentence.');
  const question = `Complete the statement: ${quote.slice(0, position)}_____${quote.slice(position + answer.length)}`;
  const options = [...draft.distractors]; options.splice(correctIndex, 0, draft.answer);
  return validateOutput(JSON.stringify({ questions: [{ question, options, correctIndex, explanation: draft.explanation, sourceId: source.id, quote: draft.quote }] }), source, previous);
}
export class OutputError extends Error {}
export class InsufficientMaterialError extends Error {}
export function validateOutput(raw: string, source: Source, previous: Question[] = []): Question {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new OutputError('The model did not return complete JSON.'); }
  const parsed = z.object({ questions: z.array(questionSchema).max(1) }).strict().safeParse(data);
  if (!parsed.success) throw new OutputError('Invalid question: ' + parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ').slice(0, 350));
  const q = parsed.data.questions[0];
  if (!q) throw new InsufficientMaterialError('The model could not find enough distinct facts. Add more notes or select another excerpt.');
  const canonical = (v: string) => normalize(v).toLocaleLowerCase().replace(/[\p{P}\p{S}]/gu, '');
  if (new Set(q.options.map(canonical)).size !== 4) throw new OutputError('Answer choices must be distinct.');
  if (q.sourceId !== source.id || !normalize(source.text).includes(normalize(q.quote))) throw new OutputError('The supporting quote was not found in the selected notes.');
  if (!normalize(q.quote).toLowerCase().includes(normalize(q.options[q.correctIndex]).toLowerCase())) throw new OutputError('Use an exact phrase from the supporting quote as the correct answer.');
  if (previous.some(p => canonical(p.question) === canonical(q.question) || normalize(p.quote) === normalize(q.quote))) throw new OutputError('The model repeated a question or its evidence.');
  return q;
}
export interface Quiz { id: string; title: string; createdAt: string; source: Source; questions: Question[]; model: string; }
export interface Note { id: string; title: string; text: string; updatedAt: string; }
export interface Attempt { id: string; quiz: Quiz; answers: number[]; createdAt: string; retryOf?: string; }
export function score(questions: Question[], answers: number[]) {
  const missed = questions.flatMap((q, i) => answers[i] !== q.correctIndex ? [i] : []);
  return { correct: questions.length - missed.length, total: questions.length, missed };
}
export interface Library { version: 1; notes: Note[]; quizzes: Quiz[]; attempts: Attempt[]; preferences: { count: 3 | 5 }; }
export const emptyLibrary = (): Library => ({ version: 1, notes: [], quizzes: [], attempts: [], preferences: { count: 3 } });
export type ModelPhase = 'not-prepared' | 'downloading' | 'loading' | 'ready' | 'generating' | 'cancelled' | 'failed';
export interface ModelStatus { phase: ModelPhase; model: string; size: number; message: string; loaded: boolean; busy: boolean; stopping: boolean; downloaded?: number; total?: number; completed: number; target: number; }
export interface Diagnostics { platform: string; node: string; availableMemory: number; cacheDirectory: string; vulkan?: string; blockers: string[]; warnings: string[]; }
export interface Job { id: string; state: 'running' | 'complete' | 'failed' | 'cancelled'; quiz?: Quiz; error?: string; }

// Split on paragraph boundaries when possible; UTF-8 byte counts are a conservative token bound.
export function sections(text: string): string[] {
  const result: string[] = [];
  let chunk = '';
  for (const paragraph of text.split(/\n\s*\n/u)) {
    if (bytes(chunk + '\n\n' + paragraph) <= 1800) { chunk += (chunk ? '\n\n' : '') + paragraph; continue; }
    if (chunk) result.push(chunk);
    chunk = '';
    for (const character of paragraph) {
      if (bytes(chunk + character) > 1800) { result.push(chunk); chunk = ''; }
      chunk += character;
    }
  }
  if (chunk.trim()) result.push(chunk);
  return result;
}
export function focusPassages(text: string, count: number): string[] {
  let parts = text.split(/\n\s*\n/u).map(p => p.trim()).filter(p => p.length >= 90);
  if (parts.length < count) parts = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/gu)?.map(s => s.trim()).filter(Boolean) || [text];
  if (parts.length < count) return [text];
  return Array.from({ length: count }, (_, i) => parts[Math.floor(i * (parts.length - 1) / (count - 1))]);
}
export function quizMarkdown(quiz: Quiz) {
  const clean = (s: string) => s.replace(/[<>]/g, '').replace(/([\\`*_{}\[\]()#!|])/g, '\\$1');
  return `# ${clean(quiz.title)}\n\nCoverage: ${clean(quiz.source.title)}\nModel: ${quiz.model}\n\n` + quiz.questions.map((q, i) => `## ${i + 1}. ${clean(q.question)}\n\n${q.options.map((o, j) => `${String.fromCharCode(65 + j)}. ${clean(o)}`).join('\n')}\n`).join('\n') + '\n# Answer key\n\n' + quiz.questions.map((q, i) => `${i + 1}. **${String.fromCharCode(65 + q.correctIndex)}** — ${clean(q.explanation)}\n\n> ${clean(normalize(q.quote))}\n`).join('\n');
}
