# Mini Notes with LLM Summary

A minimal notes app built as an Anna App, demonstrating:
- Anna App local development model
- Anna Host API (storage, tools)
- Executa Tool with JSON-RPC over stdio
- LLM sampling via reverse JSON-RPC

## Project Structure

```
/workspace
├── manifest.json              # Anna App manifest
├── package.json               # Root package.json with build scripts
├── vite.config.ts             # Vite configuration for frontend bundle
├── tsconfig.json              # TypeScript configuration
├── src/                       # Frontend source code
│   ├── main.tsx               # React entry point
│   ├── App.tsx                # Main React component
│   ├── useNotes.ts            # Notes state management hook
│   ├── notesService.ts        # Anna storage/tools API wrapper
│   └── index.css              # Styles
├── executas/
│   └── summarizer/            # Executa Tool source
│       ├── manifest.json      # Executa Tool manifest
│       ├── index.ts           # JSON-RPC over stdio implementation
│       ├── package.json       # Tool dependencies
│       └── tsconfig.json      # Tool TypeScript config
├── fixtures/
│   └── sampling.jsonl         # Mock sampling responses for testing
├── scripts/
│   └── build-executa.sh       # Binary packaging script
├── .github/workflows/
│   └── release.yml            # GitHub Actions release workflow
└── README.md                  # This file
```

## Installation

```bash
# Install root dependencies (frontend)
npm install

# Install Executa Tool dependencies
cd executas/summarizer && npm install && cd ../..
```

## Building Frontend Bundle

```bash
npm run build
```

This generates the bundled UI in `bundle/` directory, referenced by `manifest.json`'s `ui.bundle.entry`.

## Validating Anna App Manifest

```bash
anna-app validate --strict
```

This validates the app manifest against Anna App schema requirements.

## Running UI Harness (Local Development)

```bash
npm run anna:dev
# or equivalently:
anna-app dev --no-llm
```

### Why `--no-llm`?

The `--no-llm` flag starts the Anna App harness without connecting to a real LLM backend. This is useful for:
- Testing UI rendering and interactions
- Verifying `anna.storage.get` / `anna.storage.set` calls work correctly
- Confirming `anna.tools.invoke` wiring is correct

**Expected behavior when clicking Summarize in `--no-llm` mode:**

You will see an error like:
```
[-32603] harness started with --no-llm
```

This is **expected**. The error indicates:
1. ✅ Frontend correctly called `anna.tools.invoke(...)`
2. ✅ The request reached the harness
3. ❌ The harness cannot perform sampling because LLM is disabled

This confirms the App-to-Tool wiring is correct. To test actual sampling, see below.

## Testing Executa Tool Sampling

To test the backend Executa Tool's sampling path with mock responses:

```bash
anna-app executa dev --mock-sampling fixtures/sampling.jsonl
```

This runs the Executa Tool with pre-recorded sampling responses from the fixture file.

### Verifying `sampling/createMessage` was called

When running with `--mock-sampling`, you can verify the Tool initiated sampling by:

1. **Check stderr output**: The Tool logs `Sending sampling request:` before sending the reverse RPC
2. **Examine fixture matching**: If the Tool's sampling request matches a fixture entry, the mock response is returned
3. **Use verbose logging**: Add `ANNA_DEBUG=1` environment variable for detailed protocol logs

Example manual test:
```bash
# In one terminal, run the executa dev server
anna-app executa dev --mock-sampling fixtures/sampling.jsonl

# In another terminal, send JSON-RPC requests manually
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocol_version":"2.0"}}' | \
  anna-app executa dev --mock-sampling fixtures/sampling.jsonl
```

## Manual JSON-RPC Testing

Test the Executa Tool directly via stdin/stdout:

### Initialize
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocol_version":"2.0"}}' | \
  node executas/summarizer/dist/index.js
```

Expected response:
```json
{"jsonrpc":"2.0","id":1,"result":{"protocol_version":"2.0","capabilities":{"sampling":{}},"server_info":{"name":"tool-dev-summarizer","version":"0.1.0"}}}
```

### Describe
```bash
echo '{"jsonrpc":"2.0","id":2,"method":"describe"}' | \
  node executas/summarizer/dist/index.js
```

Expected response includes tool manifest with `host_capabilities: ["llm.sample"]`.

### Invoke (without mock - will timeout waiting for sampling)
```bash
echo '{"jsonrpc":"2.0","id":3,"method":"invoke","params":{"name":"summarize","arguments":{"notes":["Note 1","Note 2"]},"invoke_id":"test-1"}}' | \
  node executas/summarizer/dist/index.js
```

Note: Without `--mock-sampling`, this will timeout waiting for the host to respond to the `sampling/createMessage` request.

## Verifying Storage Uses `anna.storage.*`

The notes are persisted via Anna Host API, not localStorage:

1. **Code inspection**: `src/notesService.ts` uses `AnnaAppStorageApi`:
   ```typescript
   const result = await this.storage.get(STORAGE_KEY);
   await this.storage.set(STORAGE_KEY, JSON.stringify(notes));
   ```

2. **Runtime verification**: In the browser console during `anna-app dev`:
   ```javascript
   // Check that window.anna exists
   console.log(window.anna?.storage);
   
   // Verify storage calls are made
   // (Add console.log in notesService.ts getNotes/saveNotes methods)
   ```

3. **No localStorage usage**: Search the codebase for `localStorage` - none should exist in production code.

## Verifying Summary Flow

The summary flow follows:
```
UI -> anna.tools.invoke -> Executa Tool -> sampling/createMessage -> Host LLM -> Response
```

Evidence chain:

1. **Frontend calls `anna.tools.invoke`**: See `src/notesService.ts` line 78
2. **Tool receives invoke**: Tool logs `Handling invoke request` to stderr
3. **Tool sends sampling request**: Tool logs `Sending sampling request:` with the JSON-RPC payload
4. **Host responds to sampling**: With `--mock-sampling`, fixture provides the response
5. **Tool returns summary**: Response contains `summary` field from sampling result

## Building Executa Binary Archive

Run the packaging script on your local machine:

```bash
./scripts/build-executa.sh
```

This creates a platform-specific archive in `dist/archives/`:
- macOS: `tool-dev-summarizer-darwin-arm64.tar.gz` or `tool-dev-summarizer-darwin-x86_64.tar.gz`
- Linux: `tool-dev-summarizer-linux-x86_64.tar.gz`
- Windows: `tool-dev-summarizer-windows-x86_64.zip`

### Archive Structure

Each archive contains:
```
archive-root/
├── index.js           # Compiled JavaScript entry point
├── manifest.json      # Executa Tool manifest
├── run.sh             # Runner script (entrypoint)
└── archive-manifest.json  # Archive metadata for Anna binary distribution
```

## GitHub Actions Release Workflow

The workflow at `.github/workflows/release.yml` supports:

### Trigger Methods
1. **Manual trigger**: Go to Actions > "Release Executa Tool" > "Run workflow"
2. **Release published**: Automatically triggers when a GitHub Release is published

### Expected Release Assets

After successful run, the GitHub Release will contain:
- `tool-dev-summarizer-darwin-arm64.tar.gz`
- `tool-dev-summarizer-darwin-x86_64.tar.gz`
- `tool-dev-summarizer-windows-x86_64.zip`

### Smoke Tests in CI

The workflow includes:
1. Archive creation verification
2. Archive extraction and manifest validation
3. Artifact upload for debugging

## Key Concepts Explained

### manifest.json (Anna App)
Defines the app's identity, permissions, required executables, and UI bundle location. The harness reads this to set up the runtime environment.

### bundle/
The built static assets (HTML, CSS, JS) that run inside the Anna App iframe. Generated by Vite from `src/` sources.

### executas/
Native tools that run outside the browser sandbox, communicating via JSON-RPC over stdio. They can request LLM sampling from the host.

### Anna Storage / APS KV
Key-value storage provided by the Anna platform. Apps call `anna.storage.get/set` which the harness routes to the appropriate backend (in-memory for local dev, APS KV in production).

### sampling/createMessage
Reverse JSON-RPC method where the Executa Tool requests the host to generate LLM completions. This keeps LLM access controlled by the platform while allowing tools to leverage AI capabilities.

### Binary Archive
Platform-specific compressed package containing the compiled Executa Tool, its manifest, and runner script. Anna downloads and extracts these based on the user's platform.

## Troubleshooting

### "Storage not initialized" error
Ensure you're running via `anna-app dev`, not opening the bundle directly in a browser.

### Summarize always times out
- In `--no-llm` mode, this is expected
- For testing, use `anna-app executa dev --mock-sampling fixtures/sampling.jsonl`

### Build fails
```bash
# Clean and rebuild
rm -rf bundle/ dist/ node_modules/
npm install
npm run build
```

### Executa Tool won't start
```bash
# Check TypeScript compilation
cd executas/summarizer && npx tsc

# Verify manifest.json is valid JSON
cat manifest.json | jq .
```
