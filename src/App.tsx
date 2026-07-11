import { useState, useEffect, useCallback } from "react";
import { connectAnna } from "./api/anna";
import { loadNotes, saveNotes, type Note } from "./api/storage";
import { summarizeNotes } from "./api/tools";

type AppStatus = "connecting" | "ready" | "error";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function App() {
  const [status, setStatus] = useState<AppStatus>("connecting");
  const [error, setError] = useState<string>("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [inputText, setInputText] = useState("");
  const [summary, setSummary] = useState<string>("");
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string>("");
  const [connError, setConnError] = useState<string>("");

  // Connect to Anna Runtime and load notes on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await connectAnna();
        if (cancelled) return;
        const existing = await loadNotes();
        if (cancelled) return;
        setNotes(existing);
        setStatus("ready");
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setConnError(msg);
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist notes to storage on every change.
  useEffect(() => {
    if (status === "ready") {
      saveNotes(notes).catch((err) => {
        console.error("Failed to save notes:", err);
      });
    }
  }, [notes, status]);

  const handleAdd = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    const note: Note = {
      id: generateId(),
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setNotes((prev) => [...prev, note]);
    setInputText("");
  }, [inputText]);

  const handleDelete = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const handleSummarize = useCallback(async () => {
    if (notes.length === 0) {
      setSummaryError("No notes to summarize.");
      return;
    }
    setSummarizing(true);
    setSummary("");
    setSummaryError("");
    try {
      const text = await summarizeNotes(notes);
      setSummary(text);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSummaryError(msg);
    } finally {
      setSummarizing(false);
    }
  }, [notes]);

  if (status === "connecting") {
    return (
      <div className="app-container">
        <div className="status-connecting">Connecting to Anna Runtime...</div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="app-container">
        <h1>Mini Notes</h1>
        <div className="error-banner">
          Failed to connect: {connError}
        </div>
        <p className="hint">
          This app must run inside an Anna App harness. Use{" "}
          <code>anna-app dev --no-llm</code> to start.
        </p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <h1>Mini Notes</h1>

      {/* Note input */}
      <div className="input-row">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Write a note..."
          className="note-input"
        />
        <button onClick={handleAdd} disabled={!inputText.trim()}>
          Add
        </button>
      </div>

      {/* Note list */}
      <div className="note-list">
        {notes.length === 0 && (
          <div className="empty-state">No notes yet. Write one above!</div>
        )}
        {notes.map((note, idx) => (
          <div key={note.id} className="note-item">
            <span className="note-index">#{idx + 1}</span>
            <span className="note-content">{note.content}</span>
            <button
              className="delete-btn"
              onClick={() => handleDelete(note.id)}
              title="Delete note"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {/* Summarize */}
      <div className="summary-section">
        <button
          onClick={handleSummarize}
          disabled={summarizing || notes.length === 0}
        >
          {summarizing ? "Summarizing..." : "Summarize"}
        </button>

        {summaryError && (
          <div className="summary-error">{summaryError}</div>
        )}

        {summary && (
          <div className="summary-result">
            <strong>Summary:</strong>
            <p>{summary}</p>
          </div>
        )}
      </div>

      {/* Storage hint */}
      <div className="storage-hint">
        Notes are persisted via <code>anna.storage.*</code> Host API.
      </div>
    </div>
  );
}
