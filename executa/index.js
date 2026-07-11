#!/usr/bin/env node
/**
 * mini-notes-summarizer — Executa Tool (Node.js)
 *
 * JSON-RPC 2.0 over stdio.
 *
 * Methods:
 *   - initialize   — v2 capability negotiation, declares sampling capability
 *   - describe     — returns tool manifest
 *   - invoke       — handles "summarize" tool via sampling/createMessage
 *   - health       — returns health status
 *   - shutdown     — graceful exit
 *
 * Protocol:
 *   - stdin:  one JSON-RPC request per line
 *   - stdout: one JSON-RPC response per line (ONLY protocol output)
 *   - stderr: all logging/debug output
 *
 * Reverse RPC (sampling):
 *   - The tool issues sampling/createMessage to borrow the host LLM.
 *   - Responses to sampling requests arrive on stdin interleaved with
 *     new requests.  A pendingRequests Map (keyed by JSON-RPC id)
 *     distinguishes them.
 */

"use strict";

const path = require("node:path");
const readline = require("node:readline");

// Bundled SDK
const { SamplingClient, SamplingError, PROTOCOL_VERSION_V2 } = require(
  path.resolve(__dirname, "sdk", "sampling.js")
);

// ─── Manifest ──────────────────────────────────────────────────────────

const MANIFEST = {
  display_name: "Mini Notes Summarizer",
  version: "0.1.0",
  description: "Summarizes notes by asking the host to sample an LLM.",
  host_capabilities: ["llm.sample"],
  tools: [
    {
      name: "summarize",
      description: "Summarize all current notes into a concise summary.",
      parameters: [
        {
          name: "notes",
          type: "array",
          items: { type: "object" },
          description: "Array of note objects with id, content, createdAt",
          required: true,
        },
      ],
    },
  ],
  runtime: { type: "node", min_version: "18.0.0" },
};

// ─── JSON-RPC helpers ──────────────────────────────────────────────────

function writeFrame(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function makeResponse(id, { result, error } = {}) {
  const out = { jsonrpc: "2.0", id };
  if (error) out.error = error;
  else out.result = result;
  return out;
}

const sampling = new SamplingClient({ writeFrame });

// ─── Handler: initialize ──────────────────────────────────────────────

function handleInitialize(reqId, params) {
  const proto = (params && params.protocolVersion) || "1.1";
  if (proto !== PROTOCOL_VERSION_V2) {
    sampling.disable(
      `host did not negotiate v2 (offered protocolVersion=${proto}); ` +
        "sampling/createMessage requires Executa protocol 2.0"
    );
  }
  return makeResponse(reqId, {
    result: {
      protocolVersion: proto === PROTOCOL_VERSION_V2 ? "2.0" : "1.1",
      serverInfo: { name: MANIFEST.display_name, version: MANIFEST.version },
      client_capabilities: proto === PROTOCOL_VERSION_V2 ? { sampling: {} } : {},
      capabilities: {},
    },
  });
}

// ─── Handler: invoke → summarize → sampling ───────────────────────────

async function handleSummarize(args, invokeId) {
  const notes = (args && args.notes) || [];

  if (!Array.isArray(notes) || notes.length === 0) {
    return { summary: "(no notes to summarize)" };
  }

  // Build a readable list of notes for the prompt.
  const noteLines = notes
    .map((n, i) => `${i + 1}. ${n.content}`)
    .join("\n");

  const result = await sampling.createMessage({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            "Summarize the following notes into a concise paragraph. " +
            "Group related ideas together. Return only the summary, no preamble.\n\n" +
            "---\n" +
            noteLines,
        },
      },
    ],
    maxTokens: 500,
    systemPrompt: "You are a concise summarization assistant.",
    metadata: { executa_invoke_id: invokeId, tool: "summarize" },
    timeoutMs: 60_000,
  });

  const content = result && result.content;
  return {
    summary: content && content.type === "text" ? content.text : "",
    model: result.model,
    stopReason: result.stopReason,
  };
}

async function handleInvoke(reqId, params) {
  const tool = params && params.tool;
  const args = (params && params.arguments) || {};
  const invokeId = (params && params.invoke_id) || "";

  if (tool !== "summarize") {
    return makeResponse(reqId, {
      error: { code: -32601, message: `Unknown tool: ${tool}` },
    });
  }

  try {
    const data = await handleSummarize(args, invokeId);
    return makeResponse(reqId, { result: { success: true, tool, data } });
  } catch (err) {
    if (err instanceof SamplingError) {
      return makeResponse(reqId, {
        error: { code: err.code, message: err.message, data: err.data },
      });
    }
    return makeResponse(reqId, {
      error: {
        code: -32603,
        message: `Tool execution failed: ${err.message}`,
      },
    });
  }
}

// ─── Main message dispatcher ──────────────────────────────────────────

async function handleMessage(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    writeFrame(
      makeResponse(null, { error: { code: -32700, message: "Parse error" } })
    );
    return;
  }

  // Reverse-RPC response from host → resolve pending sampling promise.
  if (!("method" in msg)) {
    if (!sampling.dispatchResponse(msg)) {
      process.stderr.write(
        `[mini-notes-summarizer] unmatched response id=${JSON.stringify(msg.id)}\n`
      );
    }
    return;
  }

  const { method, id: reqId } = msg;
  const params = msg.params || {};
  let resp;

  switch (method) {
    case "initialize":
      resp = handleInitialize(reqId, params);
      break;
    case "describe":
      resp = makeResponse(reqId, { result: MANIFEST });
      break;
    case "invoke":
      resp = await handleInvoke(reqId, params);
      break;
    case "health":
      resp = makeResponse(reqId, {
        result: { status: "healthy", version: MANIFEST.version },
      });
      break;
    case "shutdown":
      resp = makeResponse(reqId, { result: { ok: true } });
      writeFrame(resp);
      process.exit(0);
      return;
    default:
      resp = makeResponse(reqId, {
        error: { code: -32601, message: `Method not found: ${method}` },
      });
  }

  if (reqId != null) writeFrame(resp);
}

// ─── Main loop ─────────────────────────────────────────────────────────

function main() {
  process.stderr.write("[mini-notes-summarizer] started\n");

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    handleMessage(trimmed).catch((err) => {
      process.stderr.write(
        `[mini-notes-summarizer] handler error: ${err.stack || err}\n`
      );
    });
  });
  rl.on("close", () => {
    process.stderr.write("[mini-notes-summarizer] stdin closed, exiting\n");
    process.exit(0);
  });
}

main();
