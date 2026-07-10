import { type AnnaAppStorageApi, type AnnaAppToolsApi } from '@anna-ai/app-runtime';

export interface Note {
  id: string;
  content: string;
  createdAt: number;
}

const STORAGE_KEY = 'mini-notes-data';

export class NotesService {
  private storage: AnnaAppStorageApi | null = null;
  private tools: AnnaAppToolsApi | null = null;

  setStorage(storage: AnnaAppStorageApi) {
    this.storage = storage;
  }

  setTools(tools: AnnaAppToolsApi) {
    this.tools = tools;
  }

  async getNotes(): Promise<Note[]> {
    if (!this.storage) {
      throw new Error('Storage not initialized');
    }
    
    try {
      const result = await this.storage.get(STORAGE_KEY);
      if (result.value === undefined || result.value === null) {
        return [];
      }
      return JSON.parse(result.value as string) as Note[];
    } catch (error) {
      console.error('Error reading notes from storage:', error);
      return [];
    }
  }

  async saveNotes(notes: Note[]): Promise<void> {
    if (!this.storage) {
      throw new Error('Storage not initialized');
    }
    
    await this.storage.set(STORAGE_KEY, JSON.stringify(notes));
  }

  async addNote(content: string): Promise<Note> {
    const notes = await this.getNotes();
    const newNote: Note = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content,
      createdAt: Date.now(),
    };
    notes.push(newNote);
    await this.saveNotes(notes);
    return newNote;
  }

  async deleteNote(noteId: string): Promise<void> {
    const notes = await this.getNotes();
    const filteredNotes = notes.filter(note => note.id !== noteId);
    await this.saveNotes(filteredNotes);
  }

  async summarizeNotes(): Promise<{ summary: string } | { error: string }> {
    if (!this.tools) {
      throw new Error('Tools not initialized');
    }

    const notes = await this.getNotes();
    
    if (notes.length === 0) {
      return { error: 'No notes to summarize' };
    }

    try {
      const result = await this.tools.invoke({
        tool_id: 'tool-dev-summarizer',
        name: 'summarize',
        arguments: {
          notes: notes.map(n => n.content),
        },
      });

      if ('error' in result) {
        return { error: result.error.message || 'Unknown error occurred' };
      }

      const summaryValue = (result.result as Record<string, unknown>).summary;
      return { summary: (summaryValue as string) || 'No summary generated' };
    } catch (error) {
      console.error('Error invoking summarizer tool:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }
}

export const notesService = new NotesService();
