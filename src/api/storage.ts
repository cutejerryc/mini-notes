/**
 * Storage wrapper — reads/writes notes via anna.storage.* Host API.
 *
 * All notes CRUD goes through anna.storage.get / anna.storage.set.
 * Nothing is stored in localStorage, IndexedDB, or React state alone.
 */

import { getAnna } from "./anna";

export interface Note {
  id: string;
  content: string;
  createdAt: string;
}

const NOTES_KEY = "mini-notes";

export async function loadNotes(): Promise<Note[]> {
  const anna = getAnna();
  const result = await anna.storage.get<Note[]>({ key: NOTES_KEY });
  return result.exists ? result.value : [];
}

export async function saveNotes(notes: Note[]): Promise<void> {
  const anna = getAnna();
  await anna.storage.set({ key: NOTES_KEY, value: notes });
}
