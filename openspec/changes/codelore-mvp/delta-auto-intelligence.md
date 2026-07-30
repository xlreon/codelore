# Delta: Auto workspace + auto tips (user direction 2026-07-30)

Supersedes the “seed tips first / curated-only MVP” constraint for **product intent**. Council still gates **full platform build**; this delta is the POC-proven direction.

## New product requirements

### R1 — Session-open workspace intelligence
When a session starts, CodeLore SHALL resolve the active codebase without user configuration:

| Situation | Behavior |
|-----------|----------|
| `cwd` inside a git worktree | Use that repo; if monorepo subdir has package markers, set `packageHint` |
| `cwd` is a multi-project parent (e.g. `~/code`) | Scan child git repos (shallow), rank by **frecency** (HEAD/commit recency, demote archive-like names), **auto-pick top** |
| Explicit `--repo` | Force that path |

### R2 — Tips without seeding
CodeLore SHALL generate tip candidates automatically from the resolved repo:

1. **Agent/docs** — AGENTS.md, CLAUDE.md, package CLAUDE.md: bullets under gotcha/critical/never/warning-like headings + short overview
2. **Git** — recent non-merge commits + high-churn paths
3. **Stack/structure** — package.json / pyproject signals + monorepo package map
4. **Curated** `.codelore/tips/*` — optional boost when present; **never required**

### R3 — Intelligent ranking
Prefer: package-local paths, unseen, critical/gotcha docs, fresher commits, curated boost. Diversity still applies.

## Spec impact (to apply when full MVP unlocks)

- `repo-context`: add multi-repo discovery + frecency + packageHint
- `tip-engine`: auto sources as first-class candidates; curated optional
- `tip-authoring`: demote seed-first; authoring becomes *curation of auto* + capture later
- Non-goal change: “empty pack = dead product” becomes “empty auto sources = rare; show structure tip or empty one-liner”

## POC

`poc/codelore.mjs` v3 implements R1–R3 plus:

### R4 — Tip length
Every tip is **1–2 lines maximum** (header + content). No multi-paragraph dumps.

### R5 — Tip log
Every shown tip is appended to `~/.tips/tips-log.md` (home `Dot tips` folder).

### R6 — Mandated directory selection
When a parent has many codebases, user **must** run `select` (all or specific) before multi-repo tips. Config: `~/.tips/config.json`. Direct work inside a single repo always tips without selection.
