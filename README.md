# Mini Notes with LLM Summary

A local Anna App that demonstrates the full Anna platform model: notes are persisted through `anna.storage.*` Host API, LLM summarization goes through a bundled Executa Tool that borrows the host LLM via reverse RPC `sampling/createMessage`.

## Project Structure

```
mini-notes-anna-app/
├── manifest.json              # App-level manifest (UI, storage, tools permissions)
├── app.json                   # App metadata (slug, name, bundled executa reference)
├── package.json               # Frontend dependencies (React + Vite)
├── vite.config.ts             # Vite build configuration
├── tsconfig.json              # TypeScript config
├── index.html                 # HTML entry point
├── src/                       # Frontend source (React + TypeScript)
│   ├── main.tsx               # Entry: renders React into DOM
│   ├── App.tsx                # Main component: notes CRUD + summarize
│   ├── App.css                # Styles
│   └── api/
│       ├── global.d.ts        # Type declarations for Anna Host API
│       ├── anna.ts            # AnnaAppRuntime.connect() wrapper
│       ├── storage.ts         # anna.storage.* CRUD wrapper (Note type)
│       └── tools.ts           # anna.tools.invoke wrapper (summarize)
├── executa/                   # Backend Executa Tool (Node.js)
│   ├── package.json
│   ├── index.js               # JSON-RPC 2.0 over stdio handler
│   ├── manifest.json          # Tool manifest (host_capabilities: ["llm.sample"])
│   ├── build-binary.js        # Binary packaging script (pkg)
│   └── sdk/
│       └── sampling.js        # SamplingClient for reverse RPC
├── tests/
│   ├── mock-sampling.jsonl    # Mock fixture for sampling testing
│   └── test-protocol.sh       # Manual JSON-RPC protocol test script
├── .github/workflows/
│   └── release.yml            # GitHub Actions: build & release 3-platform binaries
└── README.md
```

## Architecture Overview

```
Anna App iframe
  -> AnnaAppRuntime.connect()
  -> anna.storage.get / anna.storage.set  (notes CRUD)
  -> anna.tools.invoke(...)               (summarize)
  -> local Executa Tool (stdio)
  -> reverse JSON-RPC sampling/createMessage
  -> host LLM (or mock fixture)
  -> summary returned to UI
```

**Key design constraints:**
- Notes are **never** stored in `localStorage`, IndexedDB, or React state alone. All reads/writes go through `anna.storage.*`.
- The frontend **never** directly calls an LLM API. All summarization is delegated through `anna.tools.invoke` to the Executa Tool, which uses reverse RPC `sampling/createMessage`.
- The Executa Tool communicates over **JSON-RPC 2.0 over stdio**. `stdout` outputs only JSON-RPC responses. All logs go to `stderr`.

## Prerequisites

- [Anna CLI](https://staging.anna.partners/developers) (`anna-app` command)
- Node.js >= 18
- npm or pnpm

## Quick Start

### 1. Install dependencies

```bash
# Frontend
npm install

# Executa tool (only needed for binary packaging)
cd executa && npm install && cd ..
```

### 2. Build the frontend bundle

```bash
npm run build
```

This produces `bundle/index.html` and associated assets.

### 3. Validate the manifest

```bash
npm run validate
# Equivalent to: anna-app validate --strict
```

### 4. Run the App UI harness (no LLM)

```bash
anna-app dev --no-llm
```

This starts a local Anna App harness. Open the Mini Notes window in the Anna dashboard.

### 5. Test the Executa Tool JSON-RPC protocol

```bash
# Test initialize
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2.0"},"id":1}' | node executa/index.js 2>/dev/null

# Test describe
echo '{"jsonrpc":"2.0","method":"describe","id":1}' | node executa/index.js 2>/dev/null

# Test invoke (will fail on sampling since no host is connected)
echo '{"jsonrpc":"2.0","method":"invoke","params":{"tool":"summarize","arguments":{"notes":[]}},"id":1}' | node executa/index.js 2>/dev/null

# Run the full test suite
bash tests/test-protocol.sh
# Or cross-platform:
node tests/test-protocol.mjs
```

## Testing Summarization

### Path A: UI harness (`anna-app dev --no-llm`)

In `--no-llm` mode, the harness disables LLM/sampling. When you click **Summarize** in the UI:

1. The frontend calls `anna.tools.invoke(...)` for the summarizer tool.
2. The harness routes the invoke to the local Executa Tool.
3. The Executa Tool issues a `sampling/createMessage` reverse RPC to the host.
4. Since the harness started with `--no-llm`, the host responds with an error like `[-32603] harness started with --no-llm`.
5. The UI displays this error.

**This is the expected behavior** in `--no-llm` mode. It proves:
- The frontend correctly calls `anna.tools.invoke`.
- The harness routes the invoke to the Executa Tool.
- The Tool attempted sampling (which the harness rejected).

This does **not** test the sampling path itself — Path B covers that.

### Path B: Backend sampling with mock fixture

```bash
anna-app executa dev --mock-sampling tests/mock-sampling.jsonl
```

This starts the Executa Tool with a mock fixture that simulates the host LLM response. The fixture (`tests/mock-sampling.jsonl`) contains a pre-recorded sampling response:

```json
{"id":"mock-001","result":{"content":{"type":"text","text":"Mocked Summary: ..."}}}
```

**To confirm sampling was initiated:** Check the harness logs for `sampling/createMessage` requests from the tool. The Executa Tool logs all reverse-RPC activity to stderr.

### Protocol test scripts

Two scripts are provided:

```bash
# Bash version (Unix/macOS)
bash tests/test-protocol.sh

# Node.js version (cross-platform: Windows, macOS, Linux)
node tests/test-protocol.mjs
```

Alternatively, use the `test-protocol.sh` script to manually verify the protocol:

```bash
bash tests/test-protocol.sh
```

This script tests:
- `initialize` returns protocol v2 with sampling capabilities
- `describe` returns the expected manifest with `host_capabilities: ["llm.sample"]`
- `invoke` handles both empty and populated note arrays
- `health` returns healthy status
- Unknown tools return proper error codes

## Confirming `anna.storage.*` is Used

1. Open the Anna App harness developer tools.
2. Filter network/rpc logs for `anna.storage.get` and `anna.storage.set`.
3. Each note create/delete triggers `anna.storage.set`; each app load triggers `anna.storage.get`.
4. Review `src/api/storage.ts` — all CRUD goes through `getAnna().storage.get()` / `.set()`.

## Confirming the Summarization Path

1. In the UI harness with LLM enabled (not `--no-llm`), click Summarize.
2. Check the harness RPC logs for two sequential calls:
   - `anna.tools.invoke` (from the UI to the host)
   - `sampling/createMessage` (from the Executa Tool back to the host)
3. Review `src/api/tools.ts` — the frontend only calls `anna.tools.invoke`.
4. Review `executa/index.js` — the tool issues `sampling.createMessage()` in `handleSummarize`.

## Binary Packaging

### One-command build

```bash
cd executa && node build-binary.js
```

This builds a binary for your current platform using `pkg`.

### Build for all platforms

```bash
cd executa && node build-binary.js --all
```

### Build with smoke test

```bash
cd executa && node build-binary.js --test
```

### Archive structure

Each archive contains:

```
mini-notes-summarizer-<platform>/
├── manifest.json         # Binary distribution manifest
└── mini-notes-summarizer  # Standalone executable (or .exe on Windows)
```

**Output files:**
| Platform | Archive |
|----------|---------|
| macOS ARM64 | `mini-notes-summarizer-darwin-arm64.tar.gz` |
| macOS x86_64 | `mini-notes-summarizer-darwin-x86_64.tar.gz` |
| Windows x86_64 | `mini-notes-summarizer-windows-x86_64.zip` |

The archive root `manifest.json` declares the binary entrypoint:

```json
{
  "display_name": "Mini Notes Summarizer",
  "host_capabilities": ["llm.sample"],
  "runtime": {
    "binary": {
      "entrypoint": "mini-notes-summarizer"
    }
  }
}
```

## GitHub Actions Release Workflow

**File:** `.github/workflows/release.yml`

### Trigger methods

1. **`workflow_dispatch`**: Manually trigger from the Actions tab.
   - Optionally provide a `tag` input (e.g., `v0.1.0`) to create a git tag.
2. **`release`**: Automatically triggered when a GitHub Release is published.

### What it does

1. Runs on three build matrix entries (macOS ARM64, macOS x86_64, Windows x86_64).
2. For each platform:
   - Compiles the Node.js Executa Tool with `pkg`.
   - Packages into the required archive format (`.tar.gz` or `.zip`).
   - Includes the binary distribution `manifest.json`.
   - Runs a smoke test: sends a `describe` JSON-RPC request and validates the response.
3. Uploads archives as GitHub Release assets.
4. Also uploads as workflow artifacts for retention.

### Expected release assets

- `mini-notes-summarizer-darwin-arm64.tar.gz`
- `mini-notes-summarizer-darwin-x86_64.tar.gz`
- `mini-notes-summarizer-windows-x86_64.zip`

## Key Concepts

### Manifest (`manifest.json`)

The app-level manifest declares:
- `schema: 2` — Anna App schema version
- `required_executas` — which Executa tools the app needs
- `ui.host_api.storage` — declares storage read/write permissions
- `ui.host_api.tools` — declares tool invocation permissions

### Bundle

The frontend is built as a `static-spa` bundle. `npm run build` outputs to `bundle/`. The `manifest.json`'s `ui.bundle.entry` points to `bundle/index.html`.

### Executa Tool

A long-running process that communicates via JSON-RPC 2.0 over stdio. It implements:
- `initialize` — capability negotiation (v2 + sampling)
- `describe` — returns manifest with `host_capabilities: ["llm.sample"]`
- `invoke` — runs the `summarize` tool
- `health` / `shutdown` — lifecycle management

### Anna Storage / APS KV

Anna provides a key-value storage abstraction (`anna.storage.*`). In local dev mode without login, it uses an in-memory `runtime_state`. Notes are stored under a single key (`mini-notes`) as a JSON array.

### Sampling

Sampling allows an Executa Tool to "borrow" the host LLM without holding an API key. The tool sends a `sampling/createMessage` JSON-RPC request to the host (reverse RPC). The host handles model selection, billing, and execution. The tool must negotiate protocol v2 and declare `client_capabilities.sampling = {}` during `initialize`.

### Binary Archive

Anna requires Executa tools to be distributed as standalone binaries (not "source + interpreter"). The archive follows a spec: platform-keyed directory name, binary + `manifest.json` inside.
