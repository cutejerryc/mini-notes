import { useState, useEffect } from 'react';
import { AnnaAppRuntime } from '@anna-ai/app-runtime';
import { notesService } from './notesService';
import { useNotes } from './useNotes';

function App() {
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const { notes, loading, error, addNote, deleteNote } = useNotes();

  useEffect(() => {
    const initRuntime = async () => {
      try {
        const runtime = await AnnaAppRuntime.connect();
        
        if (runtime.storage) {
          notesService.setStorage(runtime.storage);
        }
        
        if (runtime.tools) {
          notesService.setTools(runtime.tools);
        }
        
        setRuntimeReady(true);
        console.log('Anna App Runtime connected successfully');
      } catch (err) {
        console.error('Failed to connect to Anna App Runtime:', err);
        // In dev mode without proper harness, we may not have runtime
        // But we still want the UI to be usable for testing
        setRuntimeReady(true);
      }
    };

    initRuntime();
  }, []);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim()) return;
    
    await addNote(newNoteContent);
    setNewNoteContent('');
    setSummaryResult(null);
    setSummaryError(null);
  };

  const handleDeleteNote = async (noteId: string) => {
    await deleteNote(noteId);
    setSummaryResult(null);
    setSummaryError(null);
  };

  const handleSummarize = async () => {
    setSummarizing(true);
    setSummaryResult(null);
    setSummaryError(null);

    try {
      const result = await notesService.summarizeNotes();
      
      if ('error' in result) {
        setSummaryError(result.error);
      } else {
        setSummaryResult(result.summary);
      }
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Failed to summarize');
    } finally {
      setSummarizing(false);
    }
  };

  if (!runtimeReady) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <h1>Mini Notes with LLM Summary</h1>
      
      <form className="input-section" onSubmit={handleAddNote}>
        <input
          type="text"
          value={newNoteContent}
          onChange={(e) => setNewNoteContent(e.target.value)}
          placeholder="Enter a note..."
          disabled={!runtimeReady}
        />
        <button type="submit" disabled={!newNoteContent.trim() || !runtimeReady}>
          Add Note
        </button>
      </form>

      {loading && <p>Loading notes...</p>}
      {error && <div className="error-message">{error}</div>}

      {!loading && notes.length === 0 ? (
        <div className="empty-state">
          <p>No notes yet. Add your first note above!</p>
        </div>
      ) : (
        <ul className="notes-list">
          {notes.map((note, index) => (
            <li key={note.id} className="note-item">
              <div className="note-content">
                <span className="note-index">#{index + 1}</span>
                {note.content}
              </div>
              <button 
                className="delete-btn" 
                onClick={() => handleDeleteNote(note.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="summarize-section">
        <button 
          className="summarize-btn" 
          onClick={handleSummarize}
          disabled={notes.length === 0 || summarizing}
        >
          {summarizing ? 'Summarizing...' : 'Summarize Notes'}
        </button>

        {summaryResult && (
          <div className="summary-result">
            <h3>Summary</h3>
            <p>{summaryResult}</p>
          </div>
        )}

        {summaryError && (
          <div className="error-message">
            <h3>Error</h3>
            <p>{summaryError}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
