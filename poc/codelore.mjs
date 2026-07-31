#!/usr/bin/env node
/**
 * CodeLore POC v3
 *
 * - Tips: 1–2 lines max (never longer)
 * - Auto workspace + auto tips (no seed required)
 * - Multi-repo: user MUST select which directories to watch (all or subset)
 * - Log every shown tip to ~/.tips/tips-log.md
 *
 * Zero npm deps. Node 20+.
 */
import { execFileSync, spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOLDOWN_MS = 30 * 60 * 1000;
const SCAN_DEPTH = 2;
const MAX_CANDIDATE_REPOS = 50;
const MULTI_REPO_THRESHOLD = 2; // mandate selection when ≥ this many candidates
const TIPS_HOME = process.env.CODELORE_TIPS_HOME || join(homedir(), ".tips");
const TIER_WEIGHT = {
  critical: 100,
  gotcha: 70,
  convention: 50,
  changelog: 55,
  onboarding: 35,
  structure: 40,
  stack: 45,
};

// ─── paths under ~/.tips ─────────────────────────────────────────────────────

function ensureTipsHome() {
  mkdirSync(TIPS_HOME, { recursive: true });
  return TIPS_HOME;
}

function configPath() {
  return join(ensureTipsHome(), "config.json");
}

function logPath() {
  return join(ensureTipsHome(), "tips-log.md");
}

function loadConfig() {
  const p = configPath();
  if (!existsSync(p)) {
    return {
      version: 1,
      // mode: "unset" | "all" | "selected"
      watchMode: "unset",
      // absolute paths of allowed repos when watchMode === "selected"
      watched: [],
      // parents the user has configured (e.g. ~/code)
      configuredParents: [],
    };
  }
  try {
    return { watchMode: "unset", watched: [], configuredParents: [], ...JSON.parse(readFileSync(p, "utf8")) };
  } catch {
    return { version: 1, watchMode: "unset", watched: [], configuredParents: [] };
  }
}

function saveConfig(cfg) {
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + "\n");
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    cmd: "tip",
    // Default both on macOS so session tips actually notify
    channel: process.platform === "darwin" ? "both" : "terminal",
    // toast = non-activating floating panel with × (default)
    // banner = tiny NC toast; dialog = blocking center alert (avoid)
    notifyStyle: "toast",
    force: false,
    reason: "manual",
    cwd: process.cwd(),
    plain: Boolean(process.env.NO_COLOR),
    pick: null,
    selectAll: false,
    selectNone: false,
    nonInteractive: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (
      ["tip", "list", "detect", "select", "log", "watched", "notify-test"].includes(
        a,
      )
    ) {
      out.cmd = a;
      continue;
    }
    if (a === "--force") out.force = true;
    else if (a === "--plain") out.plain = true;
    else if (a === "--all") out.selectAll = true;
    else if (a === "--clear") out.selectNone = true;
    else if (a === "--yes" || a === "-y") out.nonInteractive = true;
    else if (a === "--channel" && argv[i + 1]) out.channel = argv[++i];
    else if (a === "--notify" && argv[i + 1]) out.notifyStyle = argv[++i]; // dialog|banner|both
    else if (a === "--reason" && argv[i + 1]) out.reason = argv[++i];
    else if (a === "--cwd" && argv[i + 1]) out.cwd = resolve(argv[++i]);
    else if (a === "--repo" && argv[i + 1]) out.pick = resolve(argv[++i]);
    else if (a === "--help" || a === "-h") out.help = true;
  }
  // Session hooks are never interactive
  if (out.reason === "session-start") out.nonInteractive = true;
  return out;
}

// ─── git helpers ─────────────────────────────────────────────────────────────

function git(args, cwd, { timeout = 4000 } = {}) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout,
    }).trim();
  } catch {
    return null;
  }
}

function isGitRoot(dir) {
  return existsSync(join(dir, ".git"));
}

function gitRootFrom(cwd) {
  return git(["rev-parse", "--show-toplevel"], cwd) || null;
}

function lastCommitUnix(repoPath) {
  const t = git(["log", "-1", "--format=%ct"], repoPath);
  return t ? Number(t) * 1000 : 0;
}

function headMtime(repoPath) {
  try {
    const gitDir = join(repoPath, ".git");
    if (existsSync(gitDir) && statSync(gitDir).isFile()) {
      return lastCommitUnix(repoPath);
    }
    const head = join(gitDir, "HEAD");
    if (existsSync(head)) return statSync(head).mtimeMs;
  } catch {
    /* ignore */
  }
  return lastCommitUnix(repoPath);
}

// ─── discover repos ──────────────────────────────────────────────────────────

function discoverRepos(parent, depth = SCAN_DEPTH) {
  const found = [];
  const seen = new Set();

  function walk(dir, d) {
    if (found.length >= MAX_CANDIDATE_REPOS) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (isGitRoot(dir) && dir !== parent) {
      if (!seen.has(dir)) {
        seen.add(dir);
        found.push({
          root: dir,
          name: basename(dir),
          lastActive: headMtime(dir),
          score: 0,
        });
      }
      return;
    }
    if (d <= 0) return;
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const name = ent.name;
      if (
        name.startsWith(".") ||
        ["node_modules", "dist", "build", "target", "vendor", "__pycache__"].includes(
          name,
        )
      )
        continue;
      walk(join(dir, name), d - 1);
    }
  }

  if (isGitRoot(parent)) {
    return [
      {
        root: parent,
        name: basename(parent),
        lastActive: headMtime(parent),
        score: 1,
      },
    ];
  }

  walk(parent, depth);
  const now = Date.now();
  for (const r of found) {
    const ageDays = Math.max(0, (now - r.lastActive) / 86400000);
    const recency = Math.exp(-ageDays / 14);
    let boost = 1;
    const path = r.root;
    if (/archive|backup|old|leaked|tmp|claude-code-leaked/i.test(r.name + path))
      boost *= 0.25;
    if (/worktree|worktrees|-val(?:\/|$)|-pr\d|\/copy|clone/i.test(path))
      boost *= 0.45;
    if (
      existsSync(join(r.root, "AGENTS.md")) ||
      existsSync(join(r.root, "CLAUDE.md"))
    )
      boost *= 1.2;
    const depthFromParent = relative(parent, r.root).split(/[/\\]/).length;
    if (depthFromParent === 1) boost *= 1.1;
    r.score = recency * boost;
  }
  found.sort((a, b) => b.score - a.score || b.lastActive - a.lastActive);
  return found;
}

// ─── watch list (mandated multi-dir selection) ───────────────────────────────

function isWatched(repoRoot, cfg) {
  if (cfg.watchMode === "all") return true;
  if (cfg.watchMode === "unset") return false;
  const norm = resolve(repoRoot);
  return (cfg.watched || []).some((w) => resolve(w) === norm);
}

function filterCandidatesByWatch(candidates, cfg) {
  if (cfg.watchMode === "all") return candidates;
  if (cfg.watchMode === "unset") return [];
  return candidates.filter((c) => isWatched(c.root, cfg));
}

function needsSelection(candidates, cfg, parent) {
  if (candidates.length < MULTI_REPO_THRESHOLD) return false;
  // Single repo cwd never needs parent selection
  if (candidates.length === 1 && isGitRoot(parent)) return false;
  if (cfg.watchMode === "unset") return true;
  // Re-prompt if parent never configured and mode is selected with empty overlap
  if (cfg.watchMode === "selected") {
    const any = candidates.some((c) => isWatched(c.root, cfg));
    return !any;
  }
  return false;
}

async function promptSelect(candidates, { selectAll = false } = {}) {
  if (selectAll) {
    return { watchMode: "all", watched: candidates.map((c) => c.root) };
  }

  if (!process.stdin.isTTY) {
    return null; // caller handles
  }

  console.log("");
  console.log("CodeLore — which codebases should show tips?");
  console.log("  (many directories found; selection is required)");
  console.log("");
  candidates.slice(0, 30).forEach((c, i) => {
    const day = c.lastActive
      ? new Date(c.lastActive).toISOString().slice(0, 10)
      : "?";
    console.log(
      `  ${String(i + 1).padStart(2)}. ${c.name.padEnd(28)} last=${day}`,
    );
  });
  console.log("");
  console.log("  a     = all directories listed");
  console.log("  1,3,5 = only those numbers");
  console.log("  q     = cancel");
  console.log("");

  const rl = createInterface({ input, output });
  const answer = await new Promise((res) => {
    rl.question("Select [a / numbers]: ", (ans) => {
      rl.close();
      res((ans || "").trim().toLowerCase());
    });
  });

  if (!answer || answer === "q") return null;
  if (answer === "a" || answer === "all" || answer === "*") {
    return { watchMode: "all", watched: candidates.map((c) => c.root) };
  }

  const idxs = answer
    .split(/[\s,]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => n >= 1 && n <= candidates.length);
  if (!idxs.length) return null;
  const watched = [...new Set(idxs.map((n) => candidates[n - 1].root))];
  return { watchMode: "selected", watched };
}

async function cmdSelect(args) {
  const parent = args.cwd;
  const inside = gitRootFrom(parent);
  const candidates = inside
    ? [
        {
          root: inside,
          name: basename(inside),
          lastActive: headMtime(inside),
          score: 1,
        },
      ]
    : discoverRepos(parent);

  if (!candidates.length) {
    console.error("[codelore] no codebases found under", parent);
    process.exit(1);
  }

  let result;
  if (args.selectNone) {
    result = { watchMode: "selected", watched: [] };
  } else if (args.selectAll || args.nonInteractive) {
    // --all or -y with select: watch all discovered under this parent
    result = {
      watchMode: args.selectAll || candidates.length >= MULTI_REPO_THRESHOLD ? "all" : "selected",
      watched: candidates.map((c) => c.root),
    };
    if (!args.selectAll && candidates.length === 1) {
      result = { watchMode: "selected", watched: [candidates[0].root] };
    }
    if (args.selectAll) result.watchMode = "all";
  } else {
    result = await promptSelect(candidates, { selectAll: args.selectAll });
  }

  if (!result) {
    console.error("[codelore] selection cancelled");
    process.exit(1);
  }

  const cfg = loadConfig();
  cfg.watchMode = result.watchMode;
  // Merge watched paths (union) when selected; replace when all/clear
  if (result.watchMode === "all") {
    cfg.watchMode = "all";
    cfg.watched = [];
  } else if (args.selectNone) {
    cfg.watchMode = "selected";
    cfg.watched = [];
  } else {
    cfg.watchMode = "selected";
    const set = new Set([...(cfg.watched || []), ...result.watched].map(resolve));
    // If user re-ran select for this parent, replace only this parent's children
    const parentNorm = resolve(parent);
    const kept = [...set].filter((w) => {
      // drop old entries that are under this parent and not in new selection
      try {
        const rel = relative(parentNorm, w);
        const under = rel && !rel.startsWith("..") && !rel.startsWith("/");
        if (!under) return true;
        return result.watched.some((r) => resolve(r) === w);
      } catch {
        return true;
      }
    });
    for (const r of result.watched) kept.push(resolve(r));
    cfg.watched = [...new Set(kept.map(resolve))];
  }
  const parents = new Set(cfg.configuredParents || []);
  parents.add(resolve(parent));
  cfg.configuredParents = [...parents];
  cfg.updatedAt = new Date().toISOString();
  saveConfig(cfg);

  console.log(`[codelore] saved → ${configPath()}`);
  console.log(`[codelore] watchMode=${cfg.watchMode}`);
  if (cfg.watchMode === "all") {
    console.log("[codelore] tips enabled for ALL discovered repos under parents");
  } else if (!cfg.watched.length) {
    console.log("[codelore] no directories selected (tips disabled until you select)");
  } else {
    console.log(`[codelore] watching ${cfg.watched.length} directories:`);
    for (const w of cfg.watched) console.log(`  · ${w}`);
  }
}

// ─── workspace resolution ────────────────────────────────────────────────────

function finalizeWorkspace(root, cwd, how) {
  const origin = git(["config", "--get", "remote.origin.url"], root) || root;
  const fingerprint = createHash("sha256")
    .update(origin)
    .digest("hex")
    .slice(0, 16);
  const relativeCwd = relative(root, cwd) || ".";
  const packageHint = detectPackageHint(root, relativeCwd);
  return {
    root,
    name: basename(root),
    relativeCwd,
    packageHint,
    fingerprint,
    how,
    origin: origin === root ? null : origin,
    autoPicked: false,
    candidates: [],
    needsSelect: false,
  };
}

function detectPackageHint(root, relativeCwd) {
  if (relativeCwd === ".") return null;
  const first = relativeCwd.split(/[/\\]/)[0];
  if (!first || first === "..") return null;
  const pkgPath = join(root, first);
  if (!existsSync(pkgPath) || !statSync(pkgPath).isDirectory()) return null;
  const markers = [
    "package.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
    "CLAUDE.md",
    "README.md",
  ];
  if (markers.some((m) => existsSync(join(pkgPath, m)))) return first;
  return null;
}

function resolveWorkspace(cwd, pick = null) {
  if (pick) {
    const root = gitRootFrom(pick) || (isGitRoot(pick) ? pick : null);
    if (!root) return { error: `not a git repo: ${pick}` };
    return finalizeWorkspace(root, pick, "explicit");
  }

  const inside = gitRootFrom(cwd);
  if (inside) {
    return finalizeWorkspace(inside, cwd, "cwd-in-repo");
  }

  const candidates = discoverRepos(cwd);
  if (!candidates.length) {
    return { error: "no git repository found here or in child folders", candidates: [] };
  }

  const cfg = loadConfig();
  if (needsSelection(candidates, cfg, cwd)) {
    return {
      error: "directory selection required",
      needsSelect: true,
      parent: cwd,
      candidates: candidates.slice(0, 20).map(briefCandidate),
    };
  }

  const allowed = filterCandidatesByWatch(candidates, cfg);
  if (!allowed.length) {
    return {
      error: "no watched codebases match this folder",
      needsSelect: true,
      parent: cwd,
      candidates: candidates.slice(0, 20).map(briefCandidate),
    };
  }

  const top = allowed[0];
  const ws = finalizeWorkspace(top.root, top.root, "frecency");
  ws.candidates = allowed.slice(0, 8).map(briefCandidate);
  ws.autoPicked = true;
  return ws;
}

function briefCandidate(c) {
  return {
    name: c.name,
    root: c.root,
    score: Number((c.score ?? 0).toFixed?.(3) ?? c.score),
    lastActive: c.lastActive
      ? new Date(c.lastActive).toISOString().slice(0, 10)
      : null,
  };
}

// ─── 2-line tip formatting ───────────────────────────────────────────────────

/**
 * Every tip is forced to 1–2 display lines (never more).
 * line1 = short title/fact, line2 = optional detail (may be empty → 1 line)
 */
function toTwoLines(tip) {
  const rawTitle = stripMd(String(tip.title || "").replace(/\s+/g, " ").trim());
  let rawBody = stripMd(
    String(tip.body || "")
      .replace(/\s*\n+\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

  // Strip section prefixes like "Never Do: " that just echo the title
  rawBody = rawBody.replace(/^[A-Za-z0-9 /&+_-]{2,40}:\s+/i, (m) => {
    // keep if body after prefix adds new info; drop if rest ≈ title
    return m;
  });

  // Allow enough text for two full terminal rows; display wraps to width.
  const MAX = 220;
  let line1 = clip(rawTitle || rawBody, MAX);
  let line2 = "";

  if (rawBody && rawTitle) {
    let detail = rawBody;
    // Remove leading "Section: " if rest matches title
    const sec = /^([^:]{2,40}):\s+(.+)$/.exec(rawBody);
    if (sec && fuzzySame(sec[2], rawTitle)) {
      detail = ""; // pure echo — single line tip
    } else if (sec && fuzzySame(sec[1], rawTitle)) {
      detail = sec[2];
    } else if (rawBody.startsWith(rawTitle)) {
      detail = rawBody.slice(rawTitle.length).replace(/^[\s—–\-:]+/, "");
    } else if (fuzzySame(rawBody, rawTitle)) {
      detail = "";
    }
    // Also drop if detail is title with minor prefix
    if (detail && fuzzySame(detail, line1)) detail = "";
    if (detail) line2 = clip(detail, MAX);
  } else if (!rawTitle && rawBody) {
    const parts = splitTwo(rawBody, Math.floor(MAX / 2), MAX);
    line1 = parts[0];
    line2 = parts[1] || "";
  }

  // Final dedupe: if line2 contains almost all of line1, keep one line only
  if (line2 && fuzzySame(line1, line2)) line2 = "";
  if (line2 && line2.toLowerCase().includes(line1.toLowerCase().slice(0, 50))) {
    // line2 is superset — use only line2 as single line (more complete)
    line1 = clip(line2, MAX);
    line2 = "";
  }

  const lines = [line1, line2].filter(Boolean).slice(0, 2);
  return {
    ...tip,
    line1: lines[0] || "Tip",
    line2: lines[1] || "",
    displayLines: lines,
  };
}

function splitTwo(text, max1, max2) {
  if (text.length <= max1) return [text, ""];
  // break at word near max1
  let cut = text.lastIndexOf(" ", max1);
  if (cut < max1 * 0.5) cut = max1;
  const a = text.slice(0, cut).trim();
  const b = clip(text.slice(cut).trim(), max2);
  return [a, b];
}

function fuzzySame(a, b) {
  const na = a.toLowerCase().slice(0, 40);
  const nb = b.toLowerCase().slice(0, 40);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function clip(s, n) {
  s = String(s).replace(/\s+/g, " ").trim();
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

function stripMd(s) {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── auto tip generation ─────────────────────────────────────────────────────

function readText(path, max = 80_000) {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf8").slice(0, max);
  } catch {
    return null;
  }
}

/** Walk repo root + parents for .codelore/tips (nested package git repos inherit monorepo pack). */
function findCodeloreTipsDirs(repoRoot) {
  const dirs = [];
  let cur = resolve(repoRoot);
  for (let i = 0; i < 5; i++) {
    const tipsDir = join(cur, ".codelore", "tips");
    if (existsSync(tipsDir)) dirs.push(tipsDir);
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return dirs;
}

function loadCuratedTips(repoRoot) {
  const tips = [];
  const seenIds = new Set();
  for (const tipsDir of findCodeloreTipsDirs(repoRoot)) {
    for (const file of readdirSync(tipsDir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const doc = JSON.parse(readFileSync(join(tipsDir, file), "utf8"));
        for (const t of doc.tips || []) {
          if (!t?.id || !(t?.title || t?.body)) continue;
          if (seenIds.has(t.id)) continue;
          seenIds.add(t.id);
          tips.push({
            ...t,
            source: t.source || "curated",
            _curated: true,
            _quality: 100,
          });
        }
      } catch {
        /* skip */
      }
    }
  }
  return tips;
}

/** Drop marketing / low-signal auto text (README feature lists, emoji checkmarks). */
function isLowQualityTipText(text) {
  const t = String(text || "");
  if (/^[✅✓✔]|✅/.test(t)) return true;
  if (/\b(feature|features|powered by|seamless|delight|beautiful)\b/i.test(t) && t.length < 80)
    return true;
  if (/^[-*]\s*[A-Z][\w\s]{3,40}$/.test(t)) return true; // bare feature noun
  if (/key security features|what (we|you) (get|built)/i.test(t)) return true;
  return false;
}

function isHighSignalBullet(text) {
  return /\b(never|must|do not|don't|only|always|forbid|required|shall|pii|dpdpa|encrypted|consent|ownership|tenant)\b/i.test(
    text,
  );
}

function tipsFromAgentDocs(repoRoot, packageHint) {
  const tips = [];
  // Prefer CLAUDE/AGENTS over README (README is marketing-heavy)
  const files = ["AGENTS.md", "CLAUDE.md", "Claude.md", ".claude/CLAUDE.md"];
  if (packageHint) {
    files.push(
      `${packageHint}/CLAUDE.md`,
      `${packageHint}/AGENTS.md`,
      `${packageHint}/Claude.md`,
    );
  }
  // README only if no curated pack and we need fallback — still filtered
  const interesting =
    /never do|always do|gotcha|compliance|security|dpdpa|critical|warning|pitfall|constraint|rule/i;

  for (const rel of files) {
    const text = readText(join(repoRoot, rel));
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    let section = "";
    let inInteresting = false;
    let bullets = [];

    const flush = () => {
      if (!inInteresting || !bullets.length) return;
      for (const b of bullets.slice(0, 6)) {
        const body = b
          .replace(/^[-*+]\s+/, "")
          .replace(/^\d+\.\s+/, "")
          .replace(/^\*\*/, "")
          .replace(/\*\*$/, "")
          .trim();
        if (body.length < 20) continue;
        if (isLowQualityTipText(body)) continue;
        // Prefer imperative landmines
        if (!isHighSignalBullet(body) && !/never|must/i.test(section)) continue;
        const clean = stripMd(body);
        tips.push({
          id: `auto-doc-${hash(rel + section + clean).slice(0, 10)}`,
          title: clip(clean, 100),
          body: clean,
          tier: /critical|security|never|must|dpdpa|pii|encrypted/i.test(
            section + " " + clean,
          )
            ? "critical"
            : "gotcha",
          tags: ["auto", "docs"],
          paths: [rel],
          source: "auto-docs",
          _quality: isHighSignalBullet(clean) ? 70 : 40,
        });
      }
    };

    for (const line of lines) {
      const hm = /^(#{1,3})\s+(.+)$/.exec(line);
      if (hm) {
        flush();
        section = hm[2].trim();
        inInteresting = interesting.test(section);
        bullets = [];
        continue;
      }
      if (inInteresting && /^\s*[-*+]\s+\S/.test(line)) bullets.push(line.trim());
    }
    flush();
  }
  return tips;
}

function tipsFromGit(repoRoot) {
  const tips = [];
  const log = git(["log", "-12", "--pretty=format:%h|%s|%ct", "--no-merges"], repoRoot);
  if (log) {
    let n = 0;
    for (const line of log.split("\n").filter(Boolean)) {
      const [hashPart, subject, ct] = line.split("|");
      if (!subject) continue;
      // Prefer feat/fix/security; skip docs/chore noise early
      if (/^(chore|ci|docs|style|test|merge)(\(.+\))?:/i.test(subject)) continue;
      if (!/^(feat|fix|security|perf|refactor)(\(|:)/i.test(subject) && n > 1)
        continue;
      n++;
      if (n > 3) break;
      const files =
        git(["show", "--name-only", "--pretty=format:", hashPart], repoRoot) || "";
      const paths = files
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean)
        .slice(0, 4);
      tips.push({
        id: `auto-git-${hashPart}`,
        title: clip(subject, 100),
        body: paths.length
          ? `${subject} · touched: ${paths.slice(0, 3).join(", ")}`
          : subject,
        tier: "changelog",
        tags: ["auto", "git"],
        paths,
        source: "auto-git",
        _ts: Number(ct) * 1000 || 0,
        _quality: 45,
      });
    }
  }

  const churn = git(["log", "-30", "--name-only", "--pretty=format:"], repoRoot);
  if (churn) {
    const counts = new Map();
    for (const f of churn.split("\n")) {
      const p = f.trim();
      if (!p || p.endsWith(".lock") || p.includes("node_modules")) continue;
      counts.set(p, (counts.get(p) || 0) + 1);
    }
    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .filter(([, c]) => c >= 3);
    if (top.length) {
      tips.push({
        id: `auto-churn-${hash(top.map((x) => x[0]).join()).slice(0, 10)}`,
        title: "High-churn files — read before big agent edits",
        body: top.map(([p, c]) => `${p} (${c}×)`).join(" · "),
        tier: "gotcha",
        tags: ["auto", "churn"],
        paths: top.map(([p]) => p),
        source: "auto-git",
      });
    }
  }
  return tips;
}

function tipsFromStack(repoRoot, packageHint) {
  const tips = [];
  const base = packageHint ? join(repoRoot, packageHint) : repoRoot;
  const label = packageHint || basename(repoRoot);
  const pkg = readText(join(base, "package.json"), 20_000);
  if (pkg) {
    try {
      const j = JSON.parse(pkg);
      const scripts = Object.keys(j.scripts || {}).slice(0, 5);
      const deps = { ...j.dependencies, ...j.devDependencies };
      const stack = [];
      if (deps.next) stack.push("Next.js");
      if (deps.react) stack.push("React");
      if (deps.typescript) stack.push("TS");
      tips.push({
        id: `auto-stack-node-${hash(label).slice(0, 8)}`,
        title: `${label}: ${stack.join("/") || "Node"} package`,
        body: scripts.length ? `scripts: ${scripts.join(", ")}` : j.description || "",
        tier: "stack",
        tags: ["auto", "stack"],
        paths: [packageHint ? `${packageHint}/package.json` : "package.json"],
        source: "auto-stack",
      });
    } catch {
      /* ignore */
    }
  }
  const py = readText(join(base, "pyproject.toml"), 12_000);
  if (py) {
    const notable = [];
    if (/fastapi/i.test(py)) notable.push("FastAPI");
    if (/sqlalchemy/i.test(py)) notable.push("SQLAlchemy");
    if (/pydantic/i.test(py)) notable.push("Pydantic");
    tips.push({
      id: `auto-stack-py-${hash(label).slice(0, 8)}`,
      title: `${label}: Python (${notable.join(", ") || "project"})`,
      body: "Check pyproject.toml before inventing stack choices.",
      tier: "stack",
      tags: ["auto", "stack"],
      paths: [packageHint ? `${packageHint}/pyproject.toml` : "pyproject.toml"],
      source: "auto-stack",
    });
  }
  return tips;
}

function generateTips(ws) {
  const curated = loadCuratedTips(ws.root);
  // When a solid curated pack exists, auto sources are backup only (lower quality)
  const auto =
    curated.length >= 8
      ? [
          ...tipsFromAgentDocs(ws.root, ws.packageHint).slice(0, 6),
          ...tipsFromGit(ws.root).slice(0, 2),
        ]
      : [
          ...tipsFromAgentDocs(ws.root, ws.packageHint),
          ...tipsFromGit(ws.root),
          ...tipsFromStack(ws.root, ws.packageHint),
        ];
  return [...curated, ...auto]
    .filter((t) => !isLowQualityTipText(t.title) && !isLowQualityTipText(t.body))
    .map(toTwoLines);
}

// ─── ranking + seen ──────────────────────────────────────────────────────────

function statePath(fingerprint) {
  const dir = join(
    process.env.CODELORE_HOME || join(homedir(), ".codelore"),
    "state",
  );
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

function scoreTip(tip, ctx) {
  let score = TIER_WEIGHT[tip.tier] ?? 25;
  // Human curated packs dominate auto-scraped fluff
  if (tip._curated) score += 55;
  if (typeof tip._quality === "number") score += tip._quality * 0.15;
  if (tip.source === "auto-docs") score += 5;
  if (tip.source === "auto-git") score += 3;
  if (tip.source === "auto-stack") score -= 10;
  if (tip._ts) {
    const ageDays = (Date.now() - tip._ts) / 86400000;
    score += Math.max(0, 12 - ageDays);
  }
  if (!ctx.state.seen[tip.id]) score += 35;
  else {
    const last = Date.parse(ctx.state.seen[tip.id].lastAt || 0);
    const days = (Date.now() - last) / 86400000;
    if (tip.tier === "critical" && days > 1) score += 20;
    else score -= 55;
  }
  const paths = tip.paths || [];
  if (ctx.packageHint && paths.some((p) => String(p).includes(ctx.packageHint)))
    score += 25;
  // Nested package repo (e.g. frontend as own git root): match tip paths to package name
  if (ctx.repoName && paths.some((p) => String(p).includes(ctx.repoName)))
    score += 22;
  const tag = (tip.tags || [])[0];
  if (tag && (ctx.state.lastTags || []).includes(tag)) score -= 12;
  score += (parseInt(hash(tip.id).slice(0, 6), 16) % 7) / 10;
  return score;
}

function pickTip(tips, ctx) {
  if (!tips.length) return null;
  return tips
    .map((t) => ({ tip: t, score: scoreTip(t, ctx) }))
    .sort((a, b) => b.score - a.score || a.tip.id.localeCompare(b.tip.id))[0]
    .tip;
}

// ─── tip log (~/.tips/tips-log.md) ───────────────────────────────────────────

function appendTipLog(tip, ws) {
  ensureTipsHome();
  const p = logPath();
  if (!existsSync(p)) {
    writeFileSync(
      p,
      `# CodeLore tip log\n\nEvery tip shown is appended here (newest at bottom).\n\n---\n`,
    );
  }
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const where = ws.packageHint ? `${ws.name}/${ws.packageHint}` : ws.name;
  const lines = [
    "",
    `## ${ts} · ${where}`,
    "",
    `- **tier:** ${tip.tier || "tip"}`,
    `- **source:** ${tip.source || "unknown"}`,
    `- **id:** \`${tip.id}\``,
    `- **repo:** \`${ws.root}\``,
    "",
    tip.line1,
  ];
  if (tip.line2) lines.push(tip.line2);
  lines.push("", "---", "");
  appendFileSync(p, lines.join("\n"));
}

// ─── delivery ────────────────────────────────────────────────────────────────

function color(code, plain, s) {
  if (plain) return s;
  return `\x1b[${code}m${s}\x1b[0m`;
}

/** Visible width of a string (strips ANSI for length). */
function visibleLen(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, "").length;
}

function padVisible(s, width) {
  const n = visibleLen(s);
  if (n >= width) return s;
  return s + " ".repeat(width - n);
}

function termWidth() {
  const fromEnv = Number(process.env.COLUMNS) || 0;
  const fromStdout = process.stdout.columns || 0;
  let w = fromStdout || fromEnv;
  if (!w) {
    try {
      w = Number(
        execFileSync("tput", ["cols"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(),
      );
    } catch {
      w = 80;
    }
  }
  // Use almost full width; clamp so it doesn't explode on huge windows
  return Math.max(60, Math.min(w || 80, 160));
}

/** Word-wrap to at most maxLines lines of width `inner`. */
function wrapLines(text, inner, maxLines = 2) {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= inner) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    // hard-break overlong words
    if (word.length > inner) {
      let rest = word;
      while (rest.length > inner && lines.length < maxLines) {
        lines.push(rest.slice(0, inner - 1) + "…");
        rest = rest.slice(inner - 1);
      }
      cur = rest;
    } else {
      cur = word;
    }
    if (lines.length >= maxLines) {
      cur = "";
      break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  // If we overflowed, mark last line
  if (lines.length > maxLines) return lines.slice(0, maxLines);
  return lines.length ? lines : [""];
}

/**
 * Full-width terminal banner.
 * Tip content stays ≤2 lines; the *frame* uses the whole terminal width.
 */
function deliverTerminal(tip, ws, plain) {
  const width = termWidth();
  const inner = width - 4; // "│ " + content + " │"
  const tier = String(tip.tier || "tip").toUpperCase();
  const where = ws.packageHint ? `${ws.name}/${ws.packageHint}` : ws.name;
  const source = tip.source || "auto";
  const isCritical = tip.tier === "critical";

  // Colors
  const border = isCritical ? "31" : "36"; // red / cyan
  const accent = isCritical ? "31;1" : "33;1";
  const dim = "2";
  const bold = "1";
  const invert = isCritical ? "41;97;1" : "46;30;1"; // red/cyan bar for tip text

  const top = "╔" + "═".repeat(width - 2) + "╗";
  const mid = "╠" + "═".repeat(width - 2) + "╣";
  const bot = "╚" + "═".repeat(width - 2) + "╝";
  const row = (content, style = null) => {
    // Do NOT collapse spaces (clip would squash full-width padding)
    let text = String(content);
    if (visibleLen(text) > inner) {
      text = text.slice(0, inner - 1) + "…";
    }
    const body = padVisible(text, inner);
    const left = color(border, plain, "║ ");
    const right = color(border, plain, " ║");
    const midC = style ? color(style, plain, body) : body;
    return left + midC + right;
  };

  // Combine line1+line2 into up to 2 wrapped display lines (full width)
  const blob = [tip.line1, tip.line2].filter(Boolean).join(" ");
  const tipLines = wrapLines(blob, inner, 2);

  const headerL = `CodeLore  ·  ${where}`;
  const headerR = `[${tier}]`;
  const gap = Math.max(1, inner - headerL.length - headerR.length);
  const headerLine = headerL + " ".repeat(gap) + headerR;

  const out = [];
  out.push("");
  out.push(color(border, plain, top));
  out.push(row(headerLine, bold));
  out.push(
    row(
      `source: ${source}${ws.autoPicked ? "  ·  auto-picked repo" : ""}`,
      dim,
    ),
  );
  out.push(color(border, plain, mid));

  // Full-width highlighted tip body (the part you actually read)
  for (const line of tipLines) {
    const body = padVisible(line, inner);
    if (plain) {
      // NO_COLOR / --plain: full-width frame still present; prefix for scanability
      out.push("║ » " + padVisible(line, inner - 2) + "║");
    } else {
      out.push(
        color(border, plain, "║ ") +
          color(invert, plain, body) +
          color(border, plain, " ║"),
      );
    }
  }

  out.push(color(border, plain, mid));
  out.push(row(`id: ${tip.id}    log: ~/.tips/tips-log.md`, dim));
  out.push(color(border, plain, bot));
  out.push("");

  console.log(out.join("\n"));
}

/** Resolve terminal-notifier binary (Homebrew paths first). */
function findTerminalNotifier() {
  const candidates = [
    process.env.TERMINAL_NOTIFIER,
    "/opt/homebrew/bin/terminal-notifier",
    "/usr/local/bin/terminal-notifier",
    "terminal-notifier",
  ].filter(Boolean);
  for (const bin of candidates) {
    try {
      if (bin.includes("/")) {
        if (existsSync(bin)) return bin;
      } else {
        execFileSync("which", [bin], { stdio: "ignore" });
        return bin;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * macOS delivery.
 *
 * Styles:
 *   toast   — floating non-activating panel + × close (DEFAULT). Never steals focus.
 *   banner  — tiny Notification Center toast (Apple-capped size)
 *   dialog  — center alert (can interrupt — not recommended)
 */
function deliverMacos(tip, ws, style = "toast") {
  const s = style || "toast";
  if (s === "banner") return deliverMacosBanner(tip, ws);
  if (s === "dialog") return deliverMacosDialog(tip, ws);
  // toast (default) with fallbacks
  const toast = deliverMacosToast(tip, ws);
  if (toast.ok) return toast;
  const banner = deliverMacosBanner(tip, ws);
  if (banner.ok) {
    return {
      ...banner,
      hint:
        (toast.hint || toast.error || "toast binary missing") +
        " — fell back to small banner. Rebuild: swiftc -parse-as-library -O -o poc/bin/codelore-toast poc/macos/CodeloreToast.swift",
    };
  }
  return toast.ok ? toast : banner;
}

function findCodeloreToast() {
  const candidates = [
    process.env.CODELORE_TOAST,
    join(__dirname, "bin", "codelore-toast"),
    join(__dirname, "codelore-toast"),
    "/Users/sidharthsatapathy/code/codelore/poc/bin/codelore-toast",
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** Static floating toast with × — does not steal focus or block work. */
function deliverMacosToast(tip, ws) {
  const bin = findCodeloreToast();
  if (!bin) {
    return {
      ok: false,
      backend: null,
      error: "codelore-toast binary not found",
      hint: "Build: swiftc -parse-as-library -O -o poc/bin/codelore-toast poc/macos/CodeloreToast.swift",
    };
  }
  // Council: no tier word in title — accent edge carries severity
  // Pass FULL tip text to toast (no ellipsis). Prefer original body over clipped lines.
  const title = `CodeLore · ${ws.name}`;
  const fullBody = String(tip.body || "")
    .replace(/\s+/g, " ")
    .trim();
  const fullTitle = String(tip.title || "")
    .replace(/\s+/g, " ")
    .trim();
  // Message = primary readable tip; subtitle only if it adds non-duplicate detail
  let message = fullTitle || tip.line1 || "tip";
  let subtitle = "";
  if (fullBody && !fuzzySame(fullBody, message)) {
    if (fullBody.startsWith(message)) {
      const rest = fullBody.slice(message.length).replace(/^[\s—–\-:]+/, "");
      subtitle = rest;
      // If title was short headline and body is the full sentence, show full body as message
      if (message.length < 40 && fullBody.length > message.length + 10) {
        message = fullBody;
        subtitle = "";
      }
    } else {
      // Prefer full body as the main message so nothing is cut mid-sentence
      message = fullBody;
      subtitle = "";
    }
  } else if (tip.line2 && !fuzzySame(tip.line2, message)) {
    subtitle = tip.line2;
  }
  try {
    const child = spawn(
      bin,
      [
        "--title",
        title,
        "--message",
        message,
        ...(subtitle ? ["--subtitle", subtitle] : []),
        "--tier",
        String(tip.tier || "tip"),
      ],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
    return { ok: true, backend: "toast" };
  } catch (e) {
    return {
      ok: false,
      backend: null,
      error: e.message || String(e),
    };
  }
}

/** Large center alert — actually readable. Non-blocking so SessionStart isn't stuck. */
function deliverMacosDialog(tip, ws) {
  const title = `CodeLore · ${ws.name} · ${String(tip.tier || "tip").toUpperCase()}`;
  const body = [tip.line1, tip.line2].filter(Boolean).join("\n\n") || "tip";
  // display alert is larger/more prominent than display notification
  const script = `
set theTitle to ${JSON.stringify(title)}
set theBody to ${JSON.stringify(body)}
try
  display alert theTitle message theBody as informational buttons {"Got it"} default button "Got it" giving up after 10
on error
  display dialog theBody with title theTitle buttons {"Got it"} default button "Got it" giving up after 10 with icon note
end try
`;
  try {
    const child = spawn("osascript", ["-e", script], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return { ok: true, backend: "dialog" };
  } catch (e) {
    try {
      // fallback sync (blocks up to ~10s)
      execFileSync("osascript", ["-e", script], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 12000,
      });
      return { ok: true, backend: "dialog-sync" };
    } catch (e2) {
      return {
        ok: false,
        backend: null,
        error: e2.message || String(e2),
        hint: "macOS blocked the dialog — allow Automation for your terminal app if prompted",
      };
    }
  }
}

/** Tiny top-right Notification Center toast (Apple-limited size). */
function deliverMacosBanner(tip, ws) {
  const title = `CodeLore · ${ws.name}`.slice(0, 60);
  const message = (tip.line1 || "tip").slice(0, 120);
  const subtitle = (tip.line2 || String(tip.tier || "tip")).slice(0, 80);

  const tn = findTerminalNotifier();
  if (tn) {
    try {
      execFileSync(
        tn,
        [
          "-title",
          title,
          "-subtitle",
          subtitle,
          "-message",
          message,
          "-sound",
          "default",
          "-group",
          "codelore",
        ],
        { stdio: ["ignore", "pipe", "pipe"], timeout: 5000 },
      );
      return { ok: true, backend: "banner", weak: true };
    } catch {
      /* fallthrough */
    }
  }
  try {
    const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)} subtitle ${JSON.stringify(subtitle)} sound name "default"`;
    execFileSync("osascript", ["-e", script], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    });
    return {
      ok: true,
      backend: "banner-osascript",
      weak: true,
      hint: "Banners are always small (Apple). Use --notify dialog for a large center alert.",
    };
  } catch (e) {
    return { ok: false, backend: null, error: e.message || String(e) };
  }
}

function reportNotifyResult(result, quiet) {
  if (result.ok && result.backend === "toast") {
    if (!quiet)
      console.error(
        `[codelore] toast shown (top-right, × / click to dismiss, hover pauses)`,
      );
    return;
  }
  if (result.ok && !result.weak) {
    if (!quiet)
      console.error(`[codelore] notification sent via ${result.backend}`);
    return;
  }
  if (result.ok && result.weak) {
    console.error(
      `[codelore] small banner via ${result.backend} — prefer toast: rebuild poc/bin/codelore-toast`,
    );
    if (result.hint) console.error(`[codelore] ${result.hint}`);
    return;
  }
  console.error(`[codelore] notification FAILED: ${result.error || "unknown"}`);
  if (result.hint) console.error(`[codelore] ${result.hint}`);
}

function deliverJson(tip, ws) {
  console.log(
    JSON.stringify(
      {
        id: tip.id,
        line1: tip.line1,
        line2: tip.line2 || null,
        lines: tip.displayLines,
        tier: tip.tier,
        source: tip.source || null,
        repo: ws.name,
        repoRoot: ws.root,
        packageHint: ws.packageHint,
        how: ws.how,
        autoPicked: ws.autoPicked,
        logFile: logPath(),
      },
      null,
      2,
    ),
  );
}

// ─── utils ───────────────────────────────────────────────────────────────────

function hash(s) {
  return createHash("sha256").update(s).digest("hex");
}

function usage() {
  console.log(`CodeLore POC v3 — 1–2 line tips · ~/.tips log · mandated dir select

Usage:
  node poc/codelore.mjs select [--cwd ~/code] [--all]
      Interactive (or --all): choose which codebases get tips. REQUIRED when many dirs.

  node poc/codelore.mjs tip [--cwd DIR] [--channel terminal|macos|both|json]
  node poc/codelore.mjs list|detect|watched|log

Tips:
  Always 1 line, max 2 lines. Logged to ~/.tips/tips-log.md

Config:
  ~/.tips/config.json   watchMode all|selected + watched paths
  ~/.tips/tips-log.md   append-only history of every tip shown

SessionStart:
  node .../codelore.mjs tip --reason session-start --channel both --cwd "$PWD"
  (non-interactive; run "select" once first if under a multi-repo parent)
`);
}

function printSelectRequired(ws, quietFail) {
  const parent = ws.parent || process.cwd();
  console.error("[codelore] Many codebases found — pick which ones get tips:");
  console.error(
    `  node ${join(__dirname, "codelore.mjs")} select --cwd ${parent}`,
  );
  console.error(`  node ${join(__dirname, "codelore.mjs")} select --cwd ${parent} --all`);
  if (ws.candidates?.length) {
    console.error("[codelore] discovered:");
    for (const c of ws.candidates.slice(0, 8)) {
      console.error(`  · ${c.name}`);
    }
  }
  process.exit(quietFail ? 0 : 2);
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const quietFail = args.reason === "session-start";

  try {
    if (args.help || process.argv.slice(2).length === 0) {
      usage();
      process.exit(0);
    }

    if (args.cmd === "notify-test") {
      const fake = toTwoLines({
        id: "notify-test",
        title: "CodeLore toast test",
        body: "Static toast — click × to dismiss. Does not steal focus or block your work.",
        tier: "gotcha",
        source: "test",
      });
      const style = args.notifyStyle || "toast";
      const result = deliverMacos(fake, { name: "test" }, style);
      reportNotifyResult(result, false);
      if (!result.ok) process.exit(1);
      console.log(
        `[codelore] look top-right for a floating toast (style=${style}). × or click dismisses; hover pauses timer.`,
      );
      process.exit(0);
    }

    if (args.cmd === "select") {
      await cmdSelect(args);
      process.exit(0);
    }

    if (args.cmd === "watched") {
      const cfg = loadConfig();
      console.log(`config: ${configPath()}`);
      console.log(`watchMode: ${cfg.watchMode}`);
      if (cfg.watchMode === "all") console.log("watching: ALL discovered repos");
      else if (!cfg.watched?.length) console.log("watching: (none — run select)");
      else cfg.watched.forEach((w) => console.log(`  · ${w}`));
      process.exit(0);
    }

    if (args.cmd === "log") {
      const p = logPath();
      if (!existsSync(p)) {
        console.log("[codelore] no log yet — tips appear after first show");
        console.log(`[codelore] will write to ${p}`);
        process.exit(0);
      }
      // show last ~40 lines
      const text = readFileSync(p, "utf8");
      const lines = text.split("\n");
      console.log(lines.slice(-50).join("\n"));
      console.log(`\n[codelore] full log: ${p}`);
      process.exit(0);
    }

    if (args.cmd === "list") {
      const cwd = args.cwd;
      const inside = gitRootFrom(cwd);
      const list = inside
        ? [
            {
              root: inside,
              name: basename(inside),
              score: 1,
              lastActive: headMtime(inside),
            },
          ]
        : discoverRepos(cwd);
      const cfg = loadConfig();
      for (const [i, c] of list.slice(0, 20).entries()) {
        const day = c.lastActive
          ? new Date(c.lastActive).toISOString().slice(0, 10)
          : "?";
        const mark =
          cfg.watchMode === "all"
            ? "*"
            : isWatched(c.root, cfg)
              ? "*"
              : " ";
        console.log(
          `${mark}${String(i + 1).padStart(2)}. ${c.name.padEnd(28)} last=${day}  ${c.root}`,
        );
      }
      console.log("(* = watched for tips)");
      if (cfg.watchMode === "unset") {
        console.log(`\nRun: node ${join(__dirname, "codelore.mjs")} select --cwd ${cwd}`);
      }
      process.exit(0);
    }

    if (args.cmd === "detect") {
      const ws = resolveWorkspace(args.cwd, args.pick);
      console.log(JSON.stringify(ws, null, 2));
      process.exit(ws.error && !ws.needsSelect ? (quietFail ? 0 : 1) : 0);
    }

    // ── tip ──
    // Single-repo: always allowed even if watch unset (user is clearly in that project)
    let ws = resolveWorkspace(args.cwd, args.pick);

    if (ws.needsSelect) {
      // Interactive tip path can offer select once
      if (!args.nonInteractive && process.stdin.isTTY) {
        console.log("[codelore] First-time setup: choose directories for tips.\n");
        await cmdSelect({ ...args, cwd: ws.parent || args.cwd });
        ws = resolveWorkspace(args.cwd, args.pick);
      }
      if (ws.needsSelect || ws.error === "directory selection required") {
        printSelectRequired(ws, quietFail);
      }
    }

    if (ws.error) {
      // If inside a single repo, watch filter shouldn't block
      const inside = gitRootFrom(args.cwd);
      if (inside && !args.pick) {
        ws = finalizeWorkspace(inside, args.cwd, "cwd-in-repo");
      } else {
        console.error(`[codelore] ${ws.error}`);
        if (ws.needsSelect) printSelectRequired(ws, quietFail);
        process.exit(quietFail ? 0 : 1);
      }
    }

    // Enforce watch list when auto-picking from parent
    const cfg = loadConfig();
    if (ws.how === "frecency" || ws.autoPicked) {
      if (cfg.watchMode === "unset") {
        printSelectRequired(
          { parent: args.cwd, candidates: ws.candidates, needsSelect: true },
          quietFail,
        );
      }
      if (cfg.watchMode === "selected" && !isWatched(ws.root, cfg)) {
        console.error(
          `[codelore] ${ws.name} is not in your watch list. Run select to add it.`,
        );
        process.exit(quietFail ? 0 : 2);
      }
    }

    // When cwd is inside a repo that's not watched, still allow if user is directly in it
    // (opt-in mandate applies to multi-repo parents; direct work is always ok)
    // Exception: if watchMode selected and user only wants certain dirs, respect when
    // they're in a multi-configured parent... For simplicity: direct cwd-in-repo always tips.

    const state = loadState(ws.fingerprint);
    if (
      !args.force &&
      state.lastShownAt &&
      Date.now() - Date.parse(state.lastShownAt) < COOLDOWN_MS
    ) {
      process.exit(0);
    }

    const tips = generateTips(ws);
    if (!tips.length) {
      console.error(`[codelore] no tips for ${ws.name}`);
      process.exit(quietFail ? 0 : 1);
    }

    const tip = pickTip(tips, {
      state,
      relativeCwd: ws.relativeCwd,
      packageHint: ws.packageHint,
      repoName: ws.name,
    });
    if (!tip) process.exit(0);

    // Guarantee 2-line shape
    const shaped = toTwoLines(tip);

    const ch = args.channel;
    if (ch === "json") deliverJson(shaped, ws);
    else {
      if (ch === "terminal" || ch === "both")
        deliverTerminal(shaped, ws, args.plain);
      if (ch === "macos" || ch === "both") {
        const result = deliverMacos(shaped, ws, args.notifyStyle || "dialog");
        reportNotifyResult(result, quietFail);
        if (!result.ok && ch === "macos") {
          deliverTerminal(shaped, ws, args.plain);
        }
      }
    }

    appendTipLog(shaped, ws);

    const prev = state.seen[shaped.id] || { count: 0 };
    state.seen[shaped.id] = {
      count: prev.count + 1,
      lastAt: new Date().toISOString(),
    };
    state.lastShownAt = new Date().toISOString();
    state.lastShownId = shaped.id;
    state.lastTags = shaped.tags || [];
    saveState(ws.fingerprint, state);
  } catch (err) {
    console.error(`[codelore] ${err.message || err}`);
    process.exit(quietFail ? 0 : 1);
  }
}

main();
