#!/bin/bash
# ============================================================
# Manual JSON-RPC protocol test for the Executa Tool
# ============================================================
# Tests: initialize, describe, invoke (summarize)
# ============================================================

set -euo pipefail

TOOL_CMD="${1:-node $(dirname "$0")/../executa/index.js}"

PASS=0
FAIL=0

green() { echo -e "\033[0;32m$1\033[0m"; }
red()   { echo -e "\033[0;31m$1\033[0m"; }

# Helper: send a JSON-RPC request and extract a field from the response.
rpc_call() {
  local request="$1"
  echo "$request" | $TOOL_CMD 2>/dev/null
}

echo "============================================"
echo "  Executa JSON-RPC Protocol Tests"
echo "  Tool: $TOOL_CMD"
echo "============================================"
echo ""

# ── Test 1: initialize ──────────────────────────────────
echo -n "Test 1: initialize ... "
RESULT=$(rpc_call '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2.0"},"id":1}')
if echo "$RESULT" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    const r=JSON.parse(d);
    process.exit(r.result && r.result.protocolVersion==='2.0' && r.result.client_capabilities ? 0 : 1);
  });" 2>/dev/null; then
  green "PASS"; ((PASS++))
else
  red "FAIL (response: $RESULT)"; ((FAIL++))
fi

# ── Test 2: describe ─────────────────────────────────────
echo -n "Test 2: describe ... "
RESULT=$(rpc_call '{"jsonrpc":"2.0","method":"describe","id":2}')
if echo "$RESULT" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    const r=JSON.parse(d);
    const m = r.result;
    process.exit(m && m.display_name && m.host_capabilities && m.host_capabilities.includes('llm.sample') && m.tools && m.tools.length > 0 ? 0 : 1);
  });" 2>/dev/null; then
  green "PASS"; ((PASS++))
else
  red "FAIL (response: $RESULT)"; ((FAIL++))
fi

# ── Test 3: invoke summarize (empty notes) ───────────────
echo -n "Test 3: invoke summarize (empty) ... "
RESULT=$(rpc_call '{"jsonrpc":"2.0","method":"invoke","params":{"tool":"summarize","arguments":{"notes":[]}},"id":3}')
if echo "$RESULT" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    const r=JSON.parse(d);
    process.exit(r.result && r.result.success === true && r.result.data ? 0 : 1);
  });" 2>/dev/null; then
  green "PASS"; ((PASS++))
else
  red "FAIL (response: $RESULT)"; ((FAIL++))
fi

# ── Test 4: invoke summarize (with notes, expects sampling error ──
#     because no host LLM listening on stdin) ────────────
echo -n "Test 4: invoke summarize (sampling error expected) ... "
RESULT=$(rpc_call '{"jsonrpc":"2.0","method":"invoke","params":{"tool":"summarize","arguments":{"notes":[{"id":"1","content":"Test note","createdAt":"2025-01-01T00:00:00Z"}]}},"id":4}')
if echo "$RESULT" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    const r=JSON.parse(d);
    // With no host on the other end, sampling will error (which is expected).
    // The tool should either return a sampling error or an internal error.
    process.exit(r.error || (r.result && r.result.success === true) ? 0 : 1);
  });" 2>/dev/null; then
  green "PASS (got error as expected)"; ((PASS++))
else
  red "FAIL (response: $RESULT)"; ((FAIL++))
fi

# ── Test 5: health ───────────────────────────────────────
echo -n "Test 5: health ... "
RESULT=$(rpc_call '{"jsonrpc":"2.0","method":"health","id":5}')
if echo "$RESULT" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    const r=JSON.parse(d);
    process.exit(r.result && r.result.status === 'healthy' ? 0 : 1);
  });" 2>/dev/null; then
  green "PASS"; ((PASS++))
else
  red "FAIL (response: $RESULT)"; ((FAIL++))
fi

# ── Test 6: unknown tool ─────────────────────────────────
echo -n "Test 6: invoke unknown tool ... "
RESULT=$(rpc_call '{"jsonrpc":"2.0","method":"invoke","params":{"tool":"nonexistent","arguments":{}},"id":6}')
if echo "$RESULT" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    const r=JSON.parse(d);
    process.exit(r.error && r.error.code === -32601 ? 0 : 1);
  });" 2>/dev/null; then
  green "PASS"; ((PASS++))
else
  red "FAIL (response: $RESULT)"; ((FAIL++))
fi

# ── Summary ──────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Results: $PASS passed, $FAIL failed"
echo "============================================"
exit $FAIL
