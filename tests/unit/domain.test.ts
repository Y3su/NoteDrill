import { describe, expect, it } from 'vitest';
import { bytes, requestSchema, score, sections, validateOutput, validateDraft, focusPassages } from '../../shared/domain';
const source = { id: 's', title: 'Soil', text: 'Loose soil allows water to soak into the ground. Compacted soil contains fewer open spaces.' };
const question = { question: 'What allows water into the ground?', options: ['Loose soil', 'Dense plastic', 'Solid glass', 'Steel'], correctIndex: 0, explanation: 'The notes identify loose soil as allowing water to soak into the ground.', sourceId: 's', quote: 'Loose soil allows water to soak into the ground.' };
const raw = (q: unknown) => JSON.stringify({ questions: [q] });
describe('question validation', () => {
  it('accepts evidence with controlled whitespace differences', () => expect(validateOutput(raw({ ...question, quote: 'Loose soil\n allows water to soak into the ground.' }), source)).toMatchObject({ correctIndex: 0 }));
  it.each([
    { options: ['Same', 'same', 'Other', 'Last'] }, { options: ['Only one'] }, { correctIndex: 4 }, { correctIndex: -1 },
    { question: '' }, { explanation: '' }, { sourceId: 'wrong' }, { quote: 'Loose soil prevents water from entering the ground.' },
    { quote: 'soil' }, { extra: 'unexpected' },
  ])('rejects invalid schema or evidence %j', patch => expect(() => validateOutput(raw({ ...question, ...patch }), source)).toThrow());
  it('rejects malformed and truncated output', () => expect(() => validateOutput('{"questions":[', source)).toThrow());
  it('rejects duplicate questions', () => expect(() => validateOutput(raw(question), source, [question])).toThrow(/repeated/));
  it('allows the model to decline insufficient material', () => expect(() => validateOutput('{"questions":[]}', source)).toThrow(/enough distinct facts/));
  it('derives the answer position from evidence-first output', () => {
    const draft = { questions: [{ quote: question.quote, answer: 'Loose soil', explanation: question.quote, distractors: ['Dense plastic', 'Solid glass', 'Steel'] }] };
    const q = validateDraft(JSON.stringify(draft), source, [], 2);
    expect(q.correctIndex).toBe(2); expect(q.options[2]).toBe('Loose soil');
    expect(q.question).toBe('Complete the statement: _____ allows water to soak into the ground.');
    expect(() => validateDraft(JSON.stringify({ questions: [{ ...draft.questions[0], answer: 'Sand dunes' }] }), source, [], 0)).toThrow(/exact phrase/);
  });
  it('rejects a blank that would leave the answer visible elsewhere', () => {
    const duplicate = { quote: 'Loose soil holds water, and loose soil permits infiltration.', answer: 'loose soil', explanation: 'Loose soil holds water, and loose soil permits infiltration.', distractors: ['Plastic', 'Glass', 'Steel'] };
    expect(() => validateDraft(JSON.stringify({ questions: [duplicate] }), { ...source, text: duplicate.quote }, [], 0)).toThrow(/appears once/);
  });
  it('rejects an answer taken from the middle of a word', () => {
    const draft = { quote: source.text.split('. ')[1], answer: 'space', explanation: source.text.split('. ')[1], distractors: ['room', 'air', 'water'] };
    expect(() => validateDraft(JSON.stringify({ questions: [draft] }), source, [], 0)).toThrow(/whole words/);
  });
  it('rejects an explanation that adds text outside the notes', () => {
    const draft = { quote: question.quote, answer: 'Loose soil', explanation: 'Loose soil always prevents floods.', distractors: ['Plastic', 'Glass', 'Steel'] };
    expect(() => validateDraft(JSON.stringify({ questions: [draft] }), source, [], 0)).toThrow(/explanation exactly/);
  });
  it('uses separate factual passages across a five-question quiz', () => { const text = Array.from({ length: 5 }, (_, i) => `Paragraph ${i}: ${'Detail. '.repeat(15)}`).join('\n\n'); expect(new Set(focusPassages(text, 5)).size).toBe(5); });
});
describe('input, coverage and scoring', () => {
  it('rejects empty and oversized input and arbitrary filesystem fields', () => {
    expect(requestSchema.safeParse({ count: 3, source: { ...source, text: '' } }).success).toBe(false);
    expect(requestSchema.safeParse({ count: 3, source: { ...source, text: 'x'.repeat(4001) } }).success).toBe(false);
    expect(requestSchema.safeParse({ count: 3, source, path: 'C:/private' }).success).toBe(false);
  });
  it('splits Unicode notes without cutting a character or dropping source text', () => {
    const text = '🌳树 '.repeat(2000); const parts = sections(text);
    expect(parts.join('')).toBe(text); expect(parts.every(p => bytes(p) <= 1800)).toBe(true);
  });
  it('scores deterministically, including missing answers', () => expect(score([question, { ...question, correctIndex: 2 }, question], [0, 1])).toEqual({ correct: 1, total: 3, missed: [1, 2] }));
});
