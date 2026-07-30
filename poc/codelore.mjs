#!/usr/bin/env node
/**
 * CodeLore POC — prove the core loop only:
 *   resolve git repo → load tip pack → rank 1 tip → deliver (terminal / macos / both)
 *   + local seen-state + 30m cooldown
 *
 * Zero dependencies. Full MVP comes after council-approved specs.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOLDOWN_MS = 30 * 60 * 1000;
const TIER_WEIGHT = {
  critical: 100,
  gotcha: 70,
  convention: 50,
  changelog: 40,
  onboarding: 30,
};

function parseArgs(argv) {
  const out = {
    channel: "terminal", // terminal | macos | both | json
    force: false,
    reason: "manual",
    cwd: process.cwd(),
    plain: Boolean(process.env.NO_COLOR),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "tip") continue;
    if (a === "--force") out.force = true;
    else if (a === "--plain") out.plain = true;
    else if (a === "--channel" && argv[i + 1]) out.channel = argv[++i];
    else if (a === "--reason" && argv[i + 1]) out.reason = argv[++i];
    else if (a === "--cwd" && argv[i + 1]) out.cwd = resolve(argv[++i]);
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function resolveRepo(cwd) {
  const root = git(["rev-parse", "--show-toplevel"], cwd);
  if (!root) return null;
  const origin = git(["config", "--get", "remote.origin.url"], root) || root;
  const fingerprint = createHash("sha256")
    .update(origin)
    .digest("hex")
    .slice(0, 16);
  return {
    root,
    name: basename(root),
    relativeCwd: relative(root, cwd) || ".",
    fingerprint,
  };
}

function statePath(fingerprint) {
  const dir = join(process.env.CODELORE_HOME || join(homedir(), ".codelore"), "state");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${fingerprint}.json`);
}

function loadState(fingerprint) {
  const p = statePath(fingerprint);
  if (!existsSync(p)) {
    return { seen: {}, lastShownAt: null, lastShownId: null, lastTags: [] };
  }
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return { seen: {}, lastShownAt: null, lastShownId: null, lastTags: [] };
  }
}

function saveState(fingerprint, state) {
  writeFileSync(statePath(fingerprint), JSON.stringify(state, null, 2) + "\n");
}

function loadTips(repoRoot) {
  const tipsDir = join(repoRoot, ".codelore", "tips");
  if (!existsSync(tipsDir)) return [];
  const tips = [];
  for (const file of readdirSync(tipsDir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const doc = JSON.parse(readFileSync(join(tipsDir, file), "utf8"));
      for (const t of doc.tips || []) {
        if (t?.id && t?.title && t?.body && t?.tier) tips.push(t);
      }
    } catch (e) {
      console.error(`[codelore] warn: skip ${file}: ${e.message}`);
    }
  }
  return tips;
}

function stableHash(id) {
  return createHash("sha256").update(id).digest().readUInt32BE(0);
}

function scoreTip(tip, ctx) {
  let score = TIER_WEIGHT[tip.tier] ?? 20;

  // Unseen boost
  if (!ctx.state.seen[tip.id]) score += 40;
  else if (tip.tier === "critical") {
    // crude spaced re-surface: after 1 day
    const last = Date.parse(ctx.state.seen[tip.id].lastAt || 0);
    if (Date.now() - last > 24 * 60 * 60 * 1000) score += 25;
    else score -= 80; // suppress if seen recently
  } else {
    score -= 50; // prefer unseen non-critical
  }

  // Path relevance vs relative cwd
  const paths = tip.paths || [];
  if (paths.length && ctx.relativeCwd !== ".") {
    const hit = paths.some(
      (p) =>
        ctx.relativeCwd.startsWith(p.replace(/^\.\//, "")) ||
        p.startsWith(ctx.relativeCwd) ||
        ctx.relativeCwd.includes(p.split("/")[0]),
    );
    if (hit) score += 20;
  }

  // Diversity: penalize same primary tag as last
  const tag = (tip.tags || [])[0];
  if (tag && (ctx.state.lastTags || []).includes(tag)) score -= 15;

  // Deterministic tie-break salt (small)
  score += (stableHash(tip.id) % 7) / 10;

  return score;
}

function pickTip(tips, ctx) {
  if (!tips.length) return null;
  const ranked = tips
    .map((t) => ({ tip: t, score: scoreTip(t, ctx) }))
    .sort((a, b) => b.score - a.score || a.tip.id.localeCompare(b.tip.id));
  return ranked[0]?.tip ?? null;
}

function color(code, plain, s) {
  if (plain) return s;
  return `\x1b[${code}m${s}\x1b[0m`;
}

function deliverTerminal(tip, repo, plain) {
  const tier = tip.tier.toUpperCase();
  const bar = "─".repeat(48);
  const lines = [
    color("36", plain, `┌${bar}`),
    color("36", plain, `│ CodeLore · ${repo.name}`) +
      "  " +
      color(tip.tier === "critical" ? "31;1" : "33", plain, `[${tier}]`),
    color("36", plain, `├${bar}`),
    color("1", plain, `│ ${tip.title}`),
    ...tip.body.split("\n").map((l) => `│ ${l}`),
    color("36", plain, `│`),
    color("2", plain, `│ id: ${tip.id}`),
    color("36", plain, `└${bar}`),
  ];
  console.log(lines.join("\n"));
}

function deliverMacos(tip, repo) {
  const title = `CodeLore · ${repo.name}`.slice(0, 60);
  const message = tip.title.slice(0, 120);
  const subtitle = tip.tier;
  // Prefer terminal-notifier if present; else osascript
  try {
    execFileSync(
      "terminal-notifier",
      ["-title", title, "-subtitle", subtitle, "-message", message],
      { stdio: "ignore" },
    );
    return true;
  } catch {
    /* fall through */
  }
  try {
    const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)} subtitle ${JSON.stringify(subtitle)}`;
    execFileSync("osascript", ["-e", script], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function deliverJson(tip, repo) {
  console.log(
    JSON.stringify(
      {
        id: tip.id,
        title: tip.title,
        body: tip.body,
        tier: tip.tier,
        repo: repo.name,
        tags: tip.tags || [],
      },
      null,
      2,
    ),
  );
}

function usage() {
  console.log(`CodeLore POC

Usage:
  node poc/codelore.mjs tip [options]

Options:
  --channel terminal|macos|both|json   default: terminal
  --force                              ignore 30m cooldown
  --reason session-start|manual
  --cwd <path>
  --plain

Examples:
  node poc/codelore.mjs tip --force
  node poc/codelore.mjs tip --channel both --force
  node poc/codelore.mjs tip --channel json --force
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const quietFail = args.reason === "session-start";

  try {
    if (args.help || process.argv.slice(2).length === 0) {
      usage();
      process.exit(0);
    }

    const repo = resolveRepo(args.cwd);
    if (!repo) {
      console.error("[codelore] not a git repository");
      process.exit(quietFail ? 0 : 1);
    }

    const state = loadState(repo.fingerprint);

    // Cooldown
    if (
      !args.force &&
      state.lastShownAt &&
      Date.now() - Date.parse(state.lastShownAt) < COOLDOWN_MS
    ) {
      if (args.channel !== "json") {
        // silent skip for hooks
      }
      process.exit(0);
    }

    const tips = loadTips(repo.root);
    // If pack is missing in target repo, fall back to codelore project's pack (POC dogfood)
    const pack =
      tips.length > 0
        ? tips
        : loadTips(resolve(__dirname, ".."));

    if (!pack.length) {
      console.error("[codelore] no tips found in .codelore/tips/");
      process.exit(quietFail ? 0 : 1);
    }

    const tip = pickTip(pack, { state, relativeCwd: repo.relativeCwd });
    if (!tip) {
      process.exit(0);
    }

    const ch = args.channel;
    if (ch === "json") {
      deliverJson(tip, repo);
    } else {
      if (ch === "terminal" || ch === "both") {
        deliverTerminal(tip, repo, args.plain);
      }
      if (ch === "macos" || ch === "both") {
        const ok = deliverMacos(tip, repo);
        if (!ok && ch === "macos") {
          console.error("[codelore] macOS notification failed; falling back to terminal");
          deliverTerminal(tip, repo, args.plain);
        }
      }
    }

    // Record impression
    const prev = state.seen[tip.id] || { count: 0 };
    state.seen[tip.id] = {
      count: prev.count + 1,
      lastAt: new Date().toISOString(),
    };
    state.lastShownAt = new Date().toISOString();
    state.lastShownId = tip.id;
    state.lastTags = tip.tags || [];
    saveState(repo.fingerprint, state);
  } catch (err) {
    console.error(`[codelore] ${err.message || err}`);
    process.exit(quietFail ? 0 : 1);
  }
}

main();
