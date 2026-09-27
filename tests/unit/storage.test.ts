import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { clearLibrary, readLibrary, writeLibrary } from '../../src/storage';
import { emptyLibrary } from '../../shared/domain';
beforeEach(clearLibrary);
it('persists notes and preferences across newly opened connections', async () => {
  const value = emptyLibrary(); value.notes.push({ id: '1', title: 'My note', text: 'Persisted locally.', updatedAt: new Date().toISOString() }); value.preferences.count = 5;
  await writeLibrary(value); expect(await readLibrary()).toEqual(value);
});
it('deletes the entire library and resets preferences', async () => { const value = emptyLibrary(); value.preferences.count = 5; await writeLibrary(value); await clearLibrary(); expect(await readLibrary()).toEqual(emptyLibrary()); });
