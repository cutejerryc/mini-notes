#!/usr/bin/env node
/**
 * test-protocol.mjs — Cross-platform JSON-RPC protocol test
 *
 * Tests: initialize, describe, invoke (summarize), health, unknown tool
 *
 * Usage:
 *   node tests/test-protocol.mjs
 */

import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOL_PATH = resolve(__dirname, "..", "executa", "index.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`  PASS: ${name}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL: ${name} — ${err.message}`);
      failed++;
    }
  };
}

function rpcCall(method, params = {}, id = 1) {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [TOOL_PATH], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => (stdout += chunk));
    proc.stderr.on("data", (chunk) => (stderr += chunk));

    const request = JSON.stringify({ jsonrpc: "2.0", method, params, id }) + "\n";
    proc.stdin.write(request);
    proc.stdin.end();

    proc.on("close", (code) => {
      if (stdout.trim()) {
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}\nstdout: ${stdout}\nstderr: ${stderr}`));
        }
      } else {
        reject(new Error(`No stdout output\nstderr: ${stderr}`));
      }
    });
    proc.on("error", reject);
  });
}

const tests = [
  test("initialize v2", async () => {
    const res = await rpcCall("initialize", { protocolVersion: "2.0" }, 1);
    assert.equal(res.result.protocolVersion, "2.0");
    assert.ok(res.result.client_capabilities);
    assert.ok(res.result.client_capabilities.sampling);
  }),

  test("describe returns manifest", async () => {
    const res = await rpcCall("describe", {}, 2);
    const m = res.result;
    assert.equal(m.display_name, "Mini Notes Summarizer");
    assert.ok(m.host_capabilities.includes("llm.sample"));
    assert.ok(Array.isArray(m.tools));
    assert.ok(m.tools.length > 0);
    assert.equal(m.tools[0].name, "summarize");
  }),

  test("invoke summarize (empty notes)", async () => {
    const res = await rpcCall("invoke", { tool: "summarize", arguments: { notes: [] } }, 3);
    assert.ok(res.result.success);
    assert.equal(res.result.tool, "summarize");
    assert.ok(res.result.data);
  }),

  test("health returns healthy", async () => {
    const res = await rpcCall("health", {}, 5);
    assert.equal(res.result.status, "healthy");
  }),

  test("unknown tool returns error", async () => {
    const res = await rpcCall("invoke", { tool: "nonexistent", arguments: {} }, 6);
    assert.equal(res.error.code, -32601);
  }),
];

console.log("Executa JSON-RPC Protocol Tests");
console.log("========================================\n");

const results = await Promise.allSettled(tests.map((t) => t()));

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
