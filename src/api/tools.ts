/**
 * Tools wrapper — invokes the bundled Executa summarizer via anna.tools.invoke.
 *
 * The frontend never calls a local HTTP API or an LLM SDK directly.
 * All summarization goes through anna.tools.invoke → local Executa Tool
 * → sampling/createMessage → host LLM.
 */

import { getAnna } from "./anna";
import type { Note } from "./storage";

const TOOL_ID = "bundled:mini-notes-summarizer";

export interface SummaryResult {
  summary: string;
  model?: string;
  stopReason?: string;
}

export async function summarizeNotes(notes: Note[]): Promise<string> {
  const anna = getAnna();

  const result = await anna.tools.invoke({
    tool_id: TOOL_ID,
    method: "summarize",
    args: { notes },
  });

  if (!result.success) {
    throw new Error(result.error || "Summarization failed");
  }

  const data = result.data as SummaryResult;
  return data.summary;
}
