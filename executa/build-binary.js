#!/usr/bin/env node
/**
 * build-binary.js — Executa Tool binary packager
 *
 * Uses `pkg` to compile the Node.js Executa tool into standalone binaries
 * for darwin-arm64, darwin-x86_64, and windows-x86_64, then packages each
 * into the required archive format (.tar.gz for macOS, .zip for Windows).
 *
 * Archive structure (per Anna binary distribution spec):
 *   mini-notes-summarizer-<platform>/
 *   ├── manifest.json         # Binary distribution manifest
 *   ├── mini-notes-summarizer  # or .exe on Windows
 *
 * Usage:
 *   node build-binary.js              # Build for current platform only
 *   node build-binary.js --all        # Build for all three platforms
 *   node build-binary.js --test       # Build + smoke test
 */

"use strict";

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const PLUGIN_NAME = "mini-notes-summarizer";
const ENTRY_POINT = "index.js";
const BUILD_ALL = process.argv.includes("--all");
const RUN_TEST = process.argv.includes("--test");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");

// Platform targets (pkg format)
const TARGETS = BUILD_ALL
  ? [
      { pkg: "node18-macos-arm64", plat: "darwin-arm64", ext: "" },
      { pkg: "node18-macos-x64", plat: "darwin-x86_64", ext: "" },
      { pkg: "node18-win-x64", plat: "windows-x86_64", ext: ".exe" },
    ]
  : [
      // Detect current platform
      (() => {
        const arch = os.arch() === "arm64" ? "arm64" : "x64";
        const plat = os.platform() === "win32" ? "win" : "macos";
        const pkgTarget = `node18-${plat === "win" ? "win" : "macos"}-${arch === "arm64" ? "arm64" : "x64"}`;
        const platKey = `${plat === "win" ? "windows" : "darwin"}-${arch === "arm64" ? "arm64" : "x86_64"}`;
        const ext = plat === "win" ? ".exe" : "";
        return { pkg: pkgTarget, plat: platKey, ext };
      })(),
    ];

function log(msg) {
  console.error(`[build] ${msg}`);
}

function rimraf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function mkdir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function createArchiveManifest(binaryName) {
  return JSON.stringify(
    {
      display_name: "Mini Notes Summarizer",
      version: "0.1.0",
      description: "Summarizes notes by asking the host to sample an LLM.",
      host_capabilities: ["llm.sample"],
      runtime: {
        binary: {
          entrypoint: binaryName,
        },
      },
    },
    null,
    2
  );
}

async function build() {
  log(`Cleaning ${DIST}...`);
  rimraf(DIST);
  mkdir(DIST);

  // Ensure pkg is available
  try {
    execSync("npx pkg --version", { stdio: "ignore" });
  } catch {
    log("Installing pkg...");
    execSync("npm install --no-save pkg", { cwd: ROOT, stdio: "inherit" });
  }

  for (const target of TARGETS) {
    log(`Building for ${target.plat}...`);

    const binaryName = `${PLUGIN_NAME}${target.ext}`;
    const pkgBin = path.join(DIST, "pkg-bin", target.plat, binaryName);

    // Compile with pkg
    mkdir(path.dirname(pkgBin));
    execSync(
      `npx pkg "${ENTRY_POINT}" --target ${target.pkg} --output "${pkgBin}"`,
      { cwd: ROOT, stdio: "inherit" }
    );

    // Create archive directory
    const archiveDirName = `${PLUGIN_NAME}-${target.plat}`;
    const archiveDir = path.join(DIST, archiveDirName);
    mkdir(archiveDir);

    // Copy binary
    fs.copyFileSync(pkgBin, path.join(archiveDir, binaryName));
    fs.chmodSync(path.join(archiveDir, binaryName), 0o755);

    // Write archive manifest.json
    fs.writeFileSync(
      path.join(archiveDir, "manifest.json"),
      createArchiveManifest(binaryName),
      "utf-8"
    );

    // Package archive
    const cwd = process.cwd();
    process.chdir(DIST);
    if (target.plat.startsWith("windows")) {
      // .zip
      const zipName = `${archiveDirName}.zip`;
      // Use 7z or zip if available, otherwise fall back to PowerShell
      try {
        execSync(`tar -a -cf "${zipName}" "${archiveDirName}"`, {
          stdio: "inherit",
        });
      } catch {
        execSync(
          `powershell -NoProfile -Command "Compress-Archive -Path '${archiveDirName}' -DestinationPath '${zipName}'"`,
          { stdio: "inherit", shell: "powershell" }
        );
      }
      log(`Created ${zipName}`);
    } else {
      // .tar.gz
      const tarball = `${archiveDirName}.tar.gz`;
      execSync(`tar -czf "${tarball}" "${archiveDirName}"`, {
        stdio: "inherit",
      });
      log(`Created ${tarball}`);
    }
    process.chdir(cwd);
  }

  // Clean up pkg intermediate binaries
  rimraf(path.join(DIST, "pkg-bin"));

  // List final artifacts
  log("\nBuild artifacts:");
  for (const f of fs.readdirSync(DIST)) {
    const stat = fs.statSync(path.join(DIST, f));
    if (stat.isFile()) {
      const size = (stat.size / 1024 / 1024).toFixed(1);
      log(`  ${f} (${size} MB)`);
    } else {
      log(`  ${f}/`);
    }
  }

  // Smoke test
  if (RUN_TEST) {
    const currentTarget = TARGETS[0];
    const binaryName = `${PLUGIN_NAME}${currentTarget.ext}`;
    const archiveDirName = `${PLUGIN_NAME}-${currentTarget.plat}`;
    const binaryPath = path.join(DIST, archiveDirName, binaryName);

    if (fs.existsSync(binaryPath)) {
      log("\nRunning smoke test...");
      try {
        const result = execSync(
          `echo '{"jsonrpc":"2.0","method":"describe","id":1}' | "${binaryPath}"`,
          { encoding: "utf-8", timeout: 10000 }
        );
        const parsed = JSON.parse(result.trim());
        const ok =
          parsed.result &&
          parsed.result.display_name === "Mini Notes Summarizer" &&
          parsed.result.host_capabilities.includes("llm.sample");
        log(ok ? "Smoke test PASSED" : "Smoke test FAILED: unexpected response");
      } catch (err) {
        log(`Smoke test FAILED: ${err.message}`);
        process.exit(1);
      }
    } else {
      log(`Smoke test skipped: binary not found at ${binaryPath}`);
    }
  }
}

build().catch((err) => {
  console.error("[build] Fatal error:", err);
  process.exit(1);
});
