import { useState, useEffect, useCallback } from 'react';
import { notesService, type Note } from './notesService';

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const loadedNotes = await notesService.getNotes();
      setNotes(loadedNotes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const addNote = async (content: string) => {
    if (!content.trim()) {
      return;
    }
    try {
      await notesService.addNote(content.trim());
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add note');
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      await notesService.deleteNote(noteId);
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note');
    }
  };

  return { notes, loading, error, addNote, deleteNote, refreshNotes: loadNotes };
}
