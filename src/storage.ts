import { openDB } from 'idb';
import { emptyLibrary, type Library } from '../shared/domain';
const database = () => openDB('notedrill', 1, { upgrade(db) { db.createObjectStore('library'); } });
export async function readLibrary(): Promise<Library> {
  const db = await database();
  try {
    const saved = await db.get('library', 'current') as Library | undefined;
    if (!saved) return emptyLibrary();
    if (saved.version !== 1 || !Array.isArray(saved.notes) || !Array.isArray(saved.attempts) || !Array.isArray(saved.quizzes)) throw new Error('Your saved library could not be read. Export or clear local data before continuing.');
    return saved;
  } finally { db.close(); }
}
export async function writeLibrary(library: Library) { const db = await database(); try { await db.put('library', library, 'current'); } finally { db.close(); } }
export async function clearLibrary() { const db = await database(); try { await db.clear('library'); } finally { db.close(); } }
