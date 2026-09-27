import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, Cpu, FileText, History, Leaf, LoaderCircle, Plus, RotateCcw, ShieldCheck, Square, Trash2, Upload, X } from 'lucide-react';
import { api } from './api';
import { clearLibrary, readLibrary, writeLibrary } from './storage';
import { bytes, emptyLibrary, MAX_EXCERPT_BYTES, MAX_NOTE_BYTES, quizMarkdown, score, sections, type Attempt, type Diagnostics, type Job, type Library, type ModelStatus, type Note, type Quiz } from '../shared/domain';
import { sampleText, sampleTitle } from '../shared/sample';

type View = 'notes' | 'attempts' | 'quiz' | 'results';
const wordCount = (s: string) => s.trim() ? s.trim().split(/\s+/u).length : 0;
const date = (s: string) => new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const label: Record<ModelStatus['phase'], string> = { 'not-prepared': 'Not prepared', downloading: 'Downloading', loading: 'Loading model', ready: 'Ready to study', generating: 'Making your quiz', cancelled: 'Stopped', failed: 'Needs attention' };

export function App() {
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const libraryRef = useRef(library);
  const saveQueue = useRef(Promise.resolve());
  const revision = useRef(0);
  const [saved, setSaved] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [view, setView] = useState<View>('notes');
  const [status, setStatus] = useState<ModelStatus>();
  const [backend, setBackend] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [jobId, setJobId] = useState<string | null>(() => sessionStorage.getItem('notedrill-job'));
  const [selectedSections, setSelectedSections] = useState<number[]>([0]);
  const [quiz, setQuiz] = useState<Quiz>();
  const [answers, setAnswers] = useState<number[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [attempt, setAttempt] = useState<Attempt>();
  const [retryOf, setRetryOf] = useState<string>();
  const [diagnostic, setDiagnostic] = useState<Diagnostics>();
  const [pendingAction, setPendingAction] = useState(false);
  const [dialogKind, setDialogKind] = useState<'note' | 'data' | 'leave'>('data');
  const dialog = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const exportDialog = useRef<HTMLDialogElement>(null);
  const [exportData, setExportData] = useState<{ content: string; filename: string; url: string }>();
  const [copyMessage, setCopyMessage] = useState('');
  const note = library.notes.find(n => n.id === selected);
  const chunks = sections(note?.text || '');
  const longNote = bytes(note?.text || '') > MAX_EXCERPT_BYTES;
  const excerpt = longNote ? chunks.filter((_, i) => selectedSections.includes(i)).join('\n\n') : note?.text || '';
  const count = library.preferences.count;
  const busy = status?.busy || !!jobId || pendingAction;

  function download(content: string, filename: string, type: string) {
    setCopyMessage('');
    setExportData({ content, filename, url: URL.createObjectURL(new Blob([content], { type })) });
  }
  async function copyExport() {
    if (!exportData) return;
    try { await navigator.clipboard.writeText(exportData.content); setCopyMessage('Copied to clipboard.'); }
    catch {
      const field = exportDialog.current?.querySelector('textarea');
      field?.focus(); field?.select();
      setCopyMessage(document.execCommand('copy') ? 'Copied to clipboard.' : 'Text selected. Press Ctrl+C (Command+C on Mac) to copy.');
    }
  }
  useEffect(() => {
    if (!exportData) return;
    exportDialog.current?.showModal();
    return () => URL.revokeObjectURL(exportData.url);
  }, [exportData]);

  function update(next: Library) {
    libraryRef.current = next; setLibrary(next); setSaved(false);
    const current = ++revision.current;
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => writeLibrary(next)).then(() => { if (current === revision.current) setSaved(true); }).catch(() => { setError('Your changes could not be saved. Browser storage may be full. Export your library before closing this page.'); });
  }
  useEffect(() => {
    let alive = true;
    readLibrary().then(value => { if (alive) { libraryRef.current = value; setLibrary(value); setSelected(value.notes[0]?.id); setHydrated(true); } }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const onUnload = (event: BeforeUnloadEvent) => { if (!saved) event.preventDefault(); };
    window.addEventListener('beforeunload', onUnload); return () => window.removeEventListener('beforeunload', onUnload);
  }, [saved]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const value = await api<ModelStatus>('/status'); if (alive) { setStatus(value); setBackend(true); } }
      catch { if (alive) setBackend(false); }
      if (alive) timer = setTimeout(poll, 1200);
    };
    void poll(); return () => { alive = false; clearTimeout(timer); };
  }, []);
  useEffect(() => {
    if (!jobId || !hydrated) return;
    let alive = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const job = await api<Job>(`/jobs/${jobId}`);
        if (!alive) return;
        if (job.state === 'complete' && job.quiz) {
          const value = job.quiz;
          update({ ...libraryRef.current, quizzes: [value, ...libraryRef.current.quizzes.filter(q => q.id !== value.id)] });
          startQuiz(value); setJobId(null); sessionStorage.removeItem('notedrill-job'); return;
        }
        if (job.state === 'failed' || job.state === 'cancelled') { setError(job.error || 'Generation stopped.'); setJobId(null); sessionStorage.removeItem('notedrill-job'); return; }
      } catch (e) {
        if (alive) { setError((e as Error).message); setJobId(null); sessionStorage.removeItem('notedrill-job'); } return;
      }
      if (alive) timer = setTimeout(poll, 1000);
    };
    void poll(); return () => { alive = false; clearTimeout(timer); };
  }, [jobId, hydrated]);
  useEffect(() => { setSelectedSections([0]); }, [selected]);
  useEffect(() => { if (view === 'quiz') questionHeading.current?.focus(); }, [view, questionIndex]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); } }, [notice]);

  function addNote(text = '', title = 'Untitled notes') {
    const value: Note = { id: crypto.randomUUID(), text, title, updatedAt: new Date().toISOString() };
    update({ ...libraryRef.current, notes: [value, ...libraryRef.current.notes] }); setSelected(value.id); setView('notes');
    setTimeout(() => titleInput.current?.focus(), 0);
  }
  function editNote(patch: Partial<Note>) {
    if (!note) return;
    if (patch.text !== undefined && bytes(patch.text) > MAX_NOTE_BYTES) { setError('Notes can contain up to 100 KB of UTF-8 text. Split this material into smaller notes.'); return; }
    if (patch.text !== undefined) setSelectedSections([0]);
    update({ ...libraryRef.current, notes: libraryRef.current.notes.map(n => n.id === note.id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n) });
  }
  async function importFile(value?: File) {
    if (!value) return;
    try {
      if (!/\.(txt|md)$/i.test(value.name)) throw new Error('Choose a UTF-8 .txt or .md file.');
      if (value.size > MAX_NOTE_BYTES) throw new Error('This file is larger than 100 KB. Split it into smaller notes first.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await value.arrayBuffer());
      if (!text.trim()) throw new Error('This file is empty. Add some notes before importing it.');
      if (text.includes('\0')) throw new Error('This file appears to contain binary data. Choose a plain text file.');
      addNote(text, value.name.replace(/\.(txt|md)$/i, '').slice(0, 120)); setNotice('Notes imported and saved locally.');
    } catch (e) { setError(e instanceof TypeError ? 'This file is not valid UTF-8 text. Save it as UTF-8 and try again.' : (e as Error).message); }
    if (file.current) file.current.value = '';
  }
  async function action(run: () => Promise<void>) {
    setPendingAction(true); setError('');
    try { await run(); } catch (e) { setError((e as Error).message); } finally { setPendingAction(false); }
  }
  async function prepare() { await action(async () => { setDiagnostic(await api('/diagnostics')); await api('/prepare', {}); setStatus(await api('/status')); }); }
  async function generate() {
    if (!note) return;
    await action(async () => {
      if (!note.title.trim()) throw new Error('Give these notes a title first.');
      if (!excerpt.trim()) throw new Error('Add some notes or select a section first.');
      const result = await api<{ id: string }>('/quizzes', { count, source: { id: note.id, title: (note.title.trim() + (longNote ? ` · sections ${selectedSections.map(i => i + 1).join(', ')}` : '')).slice(0, 120), text: excerpt } });
      sessionStorage.setItem('notedrill-job', result.id); setJobId(result.id);
    });
  }
  function startQuiz(value: Quiz, parent?: string) { setQuiz(value); setAnswers(Array(value.questions.length).fill(-1)); setQuestionIndex(0); setRetryOf(parent); setView('quiz'); setError(''); }
  function submitQuiz() {
    if (!quiz || answers.some(a => a < 0)) return;
    const value: Attempt = { id: crypto.randomUUID(), quiz, answers, createdAt: new Date().toISOString(), ...(retryOf ? { retryOf } : {}) };
    update({ ...libraryRef.current, attempts: [value, ...libraryRef.current.attempts] }); setAttempt(value); setView('results');
  }
  function confirm(kind: typeof dialogKind) { setDialogKind(kind); dialog.current?.showModal(); }
  async function deleteConfirmed() {
    if (dialogKind === 'note') {
      update({ ...libraryRef.current, notes: libraryRef.current.notes.filter(n => n.id !== selected) }); setSelected(libraryRef.current.notes[0]?.id); setNotice('Note deleted.');
    } else if (dialogKind === 'leave') { setView('notes'); }
    else {
      await action(async () => {
        let remoteError = '';
        try { await api('/clear', {}); } catch { remoteError = 'Browser data was deleted. Restart the local service to discard any quiz still held in its memory.'; }
        await saveQueue.current; await clearLibrary();
        const value = emptyLibrary(); libraryRef.current = value; setLibrary(value); setHydrated(true); setSelected(undefined); setAttempt(undefined); setQuiz(undefined); setAnswers([]); setJobId(null); sessionStorage.removeItem('notedrill-job'); setView('notes'); setSaved(true);
        if (remoteError) setError(remoteError); else setNotice('Your notes, quizzes, attempts and preferences were deleted.');
      });
    }
    dialog.current?.close();
  }
  async function localData() { confirm('data'); try { setDiagnostic(await api<Diagnostics>('/diagnostics')); } catch { setDiagnostic(undefined); } }
  function exportQuiz(value: Quiz, format: 'md' | 'json') { download(format === 'md' ? quizMarkdown(value) : JSON.stringify(value, null, 2), `notedrill-quiz.${format}`, format === 'md' ? 'text/markdown;charset=utf-8' : 'application/json'); }
  const openNotes = () => view === 'quiz' ? confirm('leave') : setView('notes');
  const q = quiz?.questions[questionIndex];

  return <div className="app-shell">
    <aside className="sidebar" aria-label="Study library">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); openNotes(); }}><span className="brand-mark"><BookOpen size={21}/></span>NoteDrill<span className="brand-dot">.</span></a>
      <div className="workspace-label">YOUR STUDY SPACE</div>
      <nav className="nav-tabs" aria-label="Workspace"><button className={view === 'notes' ? 'active' : ''} onClick={openNotes}><FileText size={17}/> Notes <span>{library.notes.length}</span></button><button className={view === 'attempts' || view === 'results' ? 'active' : ''} onClick={() => view === 'quiz' ? confirm('leave') : setView('attempts')}><History size={17}/> Practice history <span>{library.attempts.length}</span></button></nav>
      <div className="sidebar-heading"><span>MY NOTES</span><button className="icon-button" aria-label="Add notes" disabled={!hydrated || view === 'quiz'} onClick={() => addNote()}><Plus size={18}/></button></div>
      <div className="note-list">{library.notes.length ? library.notes.map(n => <button key={n.id} className={`note-item ${n.id === selected && view === 'notes' ? 'selected' : ''}`} disabled={view === 'quiz'} onClick={() => { setSelected(n.id); setView('notes'); }}><FileText size={17}/><span><strong>{n.title || 'Untitled notes'}</strong><small>{wordCount(n.text)} words · {date(n.updatedAt)}</small></span></button>) : <p className="sidebar-empty">A home for the things<br/>you want to remember.</p>}</div>
      <button className="import-sidebar" onClick={() => file.current?.click()} disabled={!hydrated || view === 'quiz'}><Upload size={16}/> Import a file <span>.txt / .md</span></button>
      <div className="sidebar-bottom"><div className="privacy"><ShieldCheck size={17}/><span>Your notes stay yours.<small>Stored on this device</small></span></div><button className="text-button" onClick={() => void localData()}>Local data & settings <ChevronRight size={14}/></button></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span>WORKSPACE <ChevronRight size={13}/> {view === 'notes' ? 'Notes' : view === 'quiz' ? 'Practice' : 'Practice history'}</span><div className="header-controls"><button className="icon-button" aria-label="Create a note" disabled={!hydrated || view === 'quiz'} onClick={() => addNote()}><Plus size={17}/></button><button className="icon-button" aria-label="Local data and settings" onClick={() => void localData()}><ShieldCheck size={17}/></button><span className={`status-pill ${!backend ? 'unavailable' : ''}`}><i/>{backend ? 'Local AI · QVAC' : 'Service disconnected'}</span></div></header>
      <div className="notification-space">
        {!backend && <div className="banner warning" role="status">The local service is unavailable. Run <code>npm start</code> in your terminal. Saved notes and attempts remain available.<button onClick={() => void action(async () => { setStatus(await api('/status')); setBackend(true); })}>Reconnect</button></div>}
        {error && <div className="banner warning" role="alert"><span>{error}</span><button aria-label="Dismiss error" className="icon-button" onClick={() => setError('')}><X size={17}/></button></div>}
        {notice && <div className="banner success" role="status"><Check size={16}/>{notice}</div>}
      </div>
      {!hydrated && !error ? <main className="empty"><LoaderCircle className="spin"/><p>Opening your local library…</p></main> : view === 'notes' && !note ? <main className="empty">
        <div className="paper-scene" aria-hidden="true"><div className="paper-back"/><div className="paper-front"><Leaf size={25}/><span/><span/><span/><div className="paper-check"><Check size={19}/></div></div></div>
        <span className="eyebrow">FROM YOUR NOTES TO WHAT YOU KNOW</span><h1>A little practice.<br/><em>A lot more remembered.</em></h1><p>Turn your own notes into a thoughtful little quiz.<br/>Made by AI on your computer. Kept here, too.</p>
        <div className="button-row"><button className="primary" disabled={!hydrated} onClick={() => addNote()}><Plus size={17}/> Add your notes</button><button className="secondary" disabled={!hydrated} onClick={() => addNote(sampleText, sampleTitle)}>Try a sample <ArrowRight size={17}/></button></div>
        <div className="empty-steps"><span><b>01</b> Bring your notes</span><span><b>02</b> Make a quiz</span><span><b>03</b> Make it stick</span></div>
        <p className="fine-print">No account. No API key. Just you and your next small win.</p>
      </main> : view === 'notes' && note ? <main className="study-layout">
        <section className="editor-area" aria-label="Note editor"><div className="section-top"><span className="eyebrow">YOUR SOURCE MATERIAL</span><span className="save-label" role="status">{saved ? <Check size={13}/> : <LoaderCircle size={13}/>} {saved ? 'Saved locally' : 'Saving…'}</span></div>
          <input ref={titleInput} className="note-title" aria-label="Note title" maxLength={120} value={note.title} onChange={e => editNote({ title: e.target.value })}/>
          <div className="note-meta"><span><FileText size={14}/> {wordCount(note.text)} words</span><span>Edited {date(note.updatedAt)}</span><button className="icon-button" aria-label="Delete note" onClick={() => confirm('note')}><Trash2 size={15}/></button></div>
          <div className="editor-paper"><textarea aria-label="Note content" placeholder="Paste your notes here. A few detailed paragraphs work best.\n\nDefinitions, processes, and comparisons make good practice material." value={note.text} spellCheck onChange={e => editNote({ text: e.target.value })}/></div>
          <div className="editor-footer"><span>Plain text keeps your focus on the material.</span><button className="text-button" onClick={() => file.current?.click()}><Upload size={14}/> Import notes</button></div>
        </section>
        <aside className="practice-panel" aria-label="Quiz setup"><div className="quiz-card"><span className="panel-icon"><BookOpen size={22}/></span><h2>Make it stick.</h2><p>A short quiz, drawn from<br/>the notes in front of you.</p><label className="control-label">QUESTIONS</label><div className="segmented" role="group" aria-label="Number of questions">{([3, 5] as const).map(n => <button aria-pressed={count === n} disabled={!!busy} className={count === n ? 'chosen' : ''} key={n} onClick={() => update({ ...libraryRef.current, preferences: { count: n } })}>{n} questions</button>)}</div>
          <div className="coverage"><span className="control-label">QUIZ COVERAGE</span>{longNote ? <><p>Select sections to fit the model’s context. Only selected material is covered.</p><div className="section-options">{chunks.map((chunk, i) => <label key={i}><input type="checkbox" checked={selectedSections.includes(i)} disabled={!!busy} onChange={e => setSelectedSections(old => e.target.checked ? [...old, i].sort((a, b) => a - b) : old.filter(n => n !== i))}/><span>Section {i + 1}<small>{chunk.slice(0, 65)}…</small></span></label>)}</div><details><summary>Read selected excerpt</summary><p className="excerpt-preview">{excerpt || 'No sections selected.'}</p></details></> : <p><CheckCircle2 size={14}/> All of these notes</p>}<small>{bytes(excerpt).toLocaleString()} / 4,000 bytes {longNote ? 'selected' : 'of context'}</small></div>
          <button className="primary full" disabled={!!busy || !backend || !status?.loaded || !excerpt.trim() || bytes(excerpt) > MAX_EXCERPT_BYTES} onClick={() => void generate()}>Generate quiz <ArrowRight size={17}/></button>
          {!status?.loaded && <small className="setup-hint">Prepare the model below to begin.</small>}
          {(status?.phase === 'generating' || jobId) && <div className="generation" role="status"><progress max={status?.target || count} value={status?.completed || 0}/><p>{status?.completed || 0} of {status?.target || count} questions validated</p></div>}
        </div><section className="model-card"><div className="model-heading"><Cpu size={18}/><h3>On-device intelligence</h3></div><div className="model-state"><i className={status?.loaded ? 'ready-dot' : ''}/>{status ? label[status.phase] : 'Connecting…'}</div><p className="model-name">Qwen3 · 4B Instruct <span>Q4_K_M</span></p><p className="model-message" aria-live="polite">{status?.message || 'Connecting to the local service.'}</p>{status?.phase === 'downloading' && <><progress max={status.total || undefined} value={status.total ? status.downloaded || 0 : undefined}/>{status.total && <small>{((status.downloaded || 0) / 1e6).toFixed(0)} / {(status.total / 1e6).toFixed(0)} MB · {Math.floor((status.downloaded || 0) / status.total * 100)}%</small>}</>}{status?.phase === 'loading' && <progress/>}
          {!status?.loaded && !status?.busy && <><p className="setup-copy">First setup downloads 2.50 GB and needs internet. Quiz inference runs on your computer.</p><button className="secondary full" disabled={!backend || pendingAction} onClick={() => void prepare()}>{status?.phase === 'failed' || status?.phase === 'cancelled' ? 'Retry preparation' : 'Prepare local model'} <ArrowDownToLine size={15}/></button></>}
          {status?.busy && <button className="secondary full" disabled={status.stopping} onClick={() => void action(async () => { await api('/cancel', {}); })}><Square size={13}/>{status.stopping ? 'Stopping…' : 'Stop'}</button>}
          {status?.loaded && !status.busy && <button className="text-button" disabled={pendingAction} onClick={() => void action(async () => { await api('/release', {}); setStatus(await api('/status')); })}>Release model memory</button>}
          <button className="text-button diagnostics-link" onClick={() => void action(async () => { const value = await api<Diagnostics>('/diagnostics'); setDiagnostic(value); setNotice([...value.blockers, ...value.warnings].join(' ') || 'Platform checks passed.'); })}>Check this computer <ChevronRight size={13}/></button>
          {diagnostic && [...diagnostic.blockers, ...diagnostic.warnings].map(text => <p className="diagnostic-warning" key={text}>{text}</p>)}
        </section><div className="local-note"><ShieldCheck size={16}/><span>Your notes and quizzes stay<br/>on this computer.</span></div></aside>
      </main> : view === 'quiz' && quiz && q ? <main className="quiz-workspace"><button className="text-button" onClick={() => confirm('leave')}><ArrowLeft size={16}/> Back to notes</button><div className="quiz-heading"><span className="eyebrow">A LITTLE RETRIEVAL PRACTICE</span><span>Question {questionIndex + 1} of {quiz.questions.length}</span></div><progress value={questionIndex + 1} max={quiz.questions.length}/><div className="question-card"><span className="source-tag">{quiz.source.title}</span><h1 ref={questionHeading} tabIndex={-1}>{q.question}</h1><p>Choose the phrase used in the original notes.</p><fieldset className="answers"><legend className="sr-only">Answer choices</legend>{q.options.map((option, i) => <label key={i} className={answers[questionIndex] === i ? 'selected' : ''}><input type="radio" name={`answer-${questionIndex}`} value={i} checked={answers[questionIndex] === i} onChange={() => setAnswers(old => old.map((a, index) => index === questionIndex ? i : a))}/><span className="option-letter">{String.fromCharCode(65 + i)}</span><span>{option}</span>{answers[questionIndex] === i && <Check size={18}/>}</label>)}</fieldset><div className="quiz-controls"><button className="secondary" disabled={questionIndex === 0} onClick={() => setQuestionIndex(i => i - 1)}><ArrowLeft size={16}/> Previous</button>{questionIndex < quiz.questions.length - 1 ? <button className="primary" disabled={answers[questionIndex] < 0} onClick={() => setQuestionIndex(i => i + 1)}>Next question <ArrowRight size={16}/></button> : <button className="primary" disabled={answers.some(a => a < 0)} onClick={submitQuiz}>Submit quiz <Check size={17}/></button>}</div></div><p className="quiet centered">Answers and explanations appear after you submit.</p></main>
      : view === 'results' && attempt ? <main className="results-workspace"><button className="text-button" onClick={() => setView('attempts')}><ArrowLeft size={16}/> All practice</button><div className="results-header"><div><span className="eyebrow">A LITTLE MORE REMEMBERED</span><h1>Practice, reflected.</h1><p>{attempt.quiz.title} · {date(attempt.createdAt)}</p></div><div className="score"><strong>{score(attempt.quiz.questions, attempt.answers).correct}<span> / {attempt.quiz.questions.length}</span></strong><small>answered correctly</small></div></div><div className="results-actions"><button className="primary" disabled={!score(attempt.quiz.questions, attempt.answers).missed.length} onClick={() => { const missed = score(attempt.quiz.questions, attempt.answers).missed; startQuiz({ ...attempt.quiz, id: crypto.randomUUID(), title: `${attempt.quiz.title} · revisit`, questions: missed.map(i => attempt.quiz.questions[i]), createdAt: new Date().toISOString() }, attempt.id); }}><RotateCcw size={16}/> Retry missed questions</button><button className="secondary" onClick={() => exportQuiz(attempt.quiz, 'md')}><ArrowDownToLine size={16}/> Markdown</button><button className="secondary" onClick={() => exportQuiz(attempt.quiz, 'json')}>JSON</button></div><p className="review-note">AI can make mistakes. Use the source excerpts to check the reasoning.</p>{attempt.quiz.questions.map((question, i) => <article className="review-card" key={i}><div className="review-heading"><span className={attempt.answers[i] === question.correctIndex ? 'correct-tag' : 'missed-tag'}>{attempt.answers[i] === question.correctIndex ? <Check size={14}/> : <RotateCcw size={14}/>} {attempt.answers[i] === question.correctIndex ? 'Correct' : 'Revisit'}</span><span className="quiet">{String(i + 1).padStart(2, '0')}</span></div><h2>{question.question}</h2>{attempt.answers[i] !== question.correctIndex && <p className="your-answer">Your answer: {question.options[attempt.answers[i]] || 'No answer'}</p>}<p className="correct-answer"><CheckCircle2 size={17}/>{question.options[question.correctIndex]}</p><p>{question.explanation}</p><details><summary>See source excerpt <ChevronRight size={14}/></summary><blockquote>{question.quote}</blockquote><small>{attempt.quiz.source.title}</small></details></article>)}</main>
      : <main className="history-workspace"><span className="eyebrow">BUILD ON WHAT YOU KNOW</span><h1>Your practice, kept.</h1><p className="quiet">A record of your small steps forward.</p>{!library.attempts.length && <div className="history-empty"><History size={32}/><h2>Your first session starts with notes.</h2><p>Completed quizzes appear here, with their explanations and source material.</p><button className="primary" onClick={() => setView('notes')}>Go to notes <ArrowRight size={16}/></button></div>}<div className="attempt-list">{library.attempts.map(a => { const result = score(a.quiz.questions, a.answers); return <button className="attempt-row" key={a.id} onClick={() => { setAttempt(a); setView('results'); }}><span className="attempt-icon"><BookOpen size={20}/></span><span><strong>{a.quiz.title}</strong><small>{date(a.createdAt)} · {a.quiz.questions.length} questions{a.retryOf ? ' · Retry' : ''}</small></span><b>{result.correct}<small> / {result.total}</small></b><ChevronRight size={19}/></button>; })}</div>{library.quizzes.length > 0 && <section className="saved-quizzes"><h2>Saved quizzes</h2><p className="quiet">Practice again, or pick up a quiz you haven’t answered yet.</p>{library.quizzes.map(value => <div key={value.id}><span>{value.title}<small>{value.questions.length} questions · {date(value.createdAt)}</small></span><button className="secondary" onClick={() => startQuiz(value)}>Practice <ArrowRight size={15}/></button><button className="icon-button" aria-label={`Export ${value.title}`} onClick={() => exportQuiz(value, 'md')}><ArrowDownToLine size={17}/></button></div>)}</section>}</main>}
      <footer className="app-footer"><span>Small sessions. Lasting knowledge.</span><span>Made local with QVAC</span></footer>
    </div>
    <dialog ref={exportDialog} className="dialog export-dialog" aria-labelledby="export-title" onClose={() => setExportData(undefined)}>
      <div className="dialog-header"><h2 id="export-title">Your export is ready</h2><button className="icon-button" aria-label="Close export" onClick={() => exportDialog.current?.close()}><X size={20}/></button></div>
      {exportData && <><p>{exportData.filename} · Saved locally when you download it.</p><textarea aria-label="Export content" readOnly value={exportData.content}/><p role="status">{copyMessage}</p><div className="dialog-actions"><button className="secondary" onClick={() => void copyExport()}>Copy text</button><a className="primary" href={exportData.url} download={exportData.filename}>Download file <ArrowDownToLine size={16}/></a></div></>}
    </dialog>
    <input className="sr-only" ref={file} type="file" accept=".txt,.md,text/plain,text/markdown" aria-label="Import notes file" onChange={e => void importFile(e.target.files?.[0])}/>
    <dialog ref={dialog} className="dialog" aria-labelledby="dialog-title"><div className="dialog-header"><h2 id="dialog-title">{dialogKind === 'note' ? 'Delete these notes?' : dialogKind === 'leave' ? 'Leave this quiz?' : 'Your local data'}</h2><button className="icon-button" aria-label="Close dialog" onClick={() => dialog.current?.close()}><X size={20}/></button></div>{dialogKind === 'note' ? <p>This removes “{note?.title}”. Saved attempts keep their own copy of the source material.</p> : dialogKind === 'leave' ? <p>Your answers in this session will be discarded. The generated quiz is saved in Practice history.</p> : <><p>Your library lives in this browser, for this local address. Keep using the same address and browser to find it again.</p><div className="data-summary"><span>{library.notes.length} notes</span><span>{library.quizzes.length} quizzes</span><span>{library.attempts.length} attempts</span></div><button className="secondary" onClick={() => download(JSON.stringify(library, null, 2), 'notedrill-library.json', 'application/json')}><ArrowDownToLine size={16}/> Export entire library</button><p>Delete removes all notes, quizzes, attempts and preferences from this browser, and clears the service’s current session.</p><p className="quiet">Model weights are kept so you do not need another download. To remove them, stop the app and delete this dedicated cache folder:</p><code className="cache-path">{diagnostic?.cacheDirectory || '%LOCALAPPDATA%/NoteDrill/models (Windows) · ~/.cache/notedrill/models (Linux/macOS)'}</code></>}<div className="dialog-actions"><button className="secondary" onClick={() => dialog.current?.close()}>Keep {dialogKind === 'note' ? 'notes' : dialogKind === 'leave' ? 'practicing' : 'my data'}</button><button className="danger" disabled={pendingAction} onClick={() => void deleteConfirmed()}>{dialogKind === 'leave' ? 'Leave quiz' : dialogKind === 'note' ? 'Delete note' : pendingAction ? 'Deleting…' : 'Delete all local data'}</button></div></dialog>
  </div>;
}
