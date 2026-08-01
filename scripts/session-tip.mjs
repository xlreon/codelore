#!/usr/bin/env node
/**
 * SessionStart helper for Grok / Claude / Cursor on Windows and macOS.
 *
 * - Resolves GROK_WORKSPACE_ROOT (or --cwd)
 * - Runs CodeLore tip with --channel both (terminal + desktop toast)
 * - Always quiet-exits so a broken tip never blocks a session
 *
 * Usage:
 *   node scripts/session-tip.mjs
 *   node scripts/session-tip.mjs --force
 *   node scripts/session-tip.mjs --cwd C:\path\to\repo
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODELORE = resolve(__dirname, "..", "poc", "codelore.mjs");
const TIPS_HOME = process.env.CODELORE_TIPS_HOME || join(homedir(), ".tips");
const CONFIG_PATH = join(TIPS_HOME, "config.json");

function parseArgs(argv) {
  const out = { force: false, cwd: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--force") out.force = true;
    else if (argv[i] === "--cwd" && argv[i + 1]) out.cwd = resolve(argv[++i]);
  }
  return out;
}

function resolveCwd(cliCwd) {
  if (cliCwd) return cliCwd;
  const envCwd =
    process.env.GROK_WORKSPACE_ROOT ||
    process.env.CLAUDE_PROJECT_DIR ||
    process.env.PWD ||
    process.cwd();
  return resolve(envCwd);
}

function loadWatchList() {
  try {
    if (!existsSync(CONFIG_PATH)) return [];
    const raw = readFileSync(CONFIG_PATH, "utf8").replace(/^\uFEFF/, "");
    const cfg = JSON.parse(raw);
    if (cfg.watchMode === "selected" && Array.isArray(cfg.watched)) {
      return cfg.watched.map((w) => resolve(w)).filter((w) => existsSync(w));
    }
  } catch {
    /* ignore */
  }
  return [];
}

function runTip(cwd, { force = false } = {}) {
  const nodeArgs = [
    CODELORE,
    "tip",
    "--cwd",
    cwd,
    "--reason",
    "session-start",
    "--channel",
    "both",
    "--notify",
    "toast",
  ];
  if (force) nodeArgs.push("--force");

  return spawnSync(process.execPath, nodeArgs, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20_000,
    env: process.env,
  });
}

function tipSucceeded(result) {
  // Tip writes session-tip.md; success is exit 0 and no "no high-signal" alone without file
  if (result.status !== 0) return false;
  const sessionFile = join(TIPS_HOME, "session-tip.md");
  if (!existsSync(sessionFile)) return false;
  try {
    const text = readFileSync(sessionFile, "utf8");
    return text.includes("## Tip") && !text.includes("No tip this session");
  } catch {
    return false;
  }
}

function main() {
  try {
    if (!existsSync(CODELORE)) process.exit(0);

    const args = parseArgs(process.argv.slice(2));
    const cwd = resolveCwd(args.cwd);

    let result = runTip(cwd, { force: args.force });
    if (!tipSucceeded(result) && !args.force) {
      result = runTip(cwd, { force: true });
    }
    if (!tipSucceeded(result)) {
      for (const repo of loadWatchList().slice(0, 8)) {
        result = runTip(repo, { force: true });
        if (tipSucceeded(result)) break;
      }
    }

    if (result.stderr) {
      const err = String(result.stderr).trim();
      if (err) console.error(err.split(/\r?\n/).slice(-3).join("\n"));
    }
    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main();
