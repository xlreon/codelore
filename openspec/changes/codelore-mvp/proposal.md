## Why

AI-assisted developers (Claude Code, Grok, Cursor agents) push large volumes of code faster than humans can absorb the resulting context. Tribal knowledge — gotchas, critical invariants, "why we did it this way," recent breaking changes — stays in chat transcripts, PR descriptions, and a few people's heads. Static docs (`AGENTS.md`, `CLAUDE.md`, READMEs) exist but are never re-read; new joiners and veterans both miss what matters until something breaks. **CodeLore** is ambient, codebase-aware tips that find the developer during terminal LLM sessions — countering context decay from AI-speed development and multiplying shared team knowledge without another docs wiki nobody opens.

## What Changes

- **New product:** CodeLore — a local-first CLI + daemon that shows one high-signal tip about the *current* codebase when you enter an AI coding session (or on demand / schedule).
- **Repo detection:** Resolve the active workspace from `$PWD`, git root, or Claude Code / Grok session cwd; load that repo's tip pack and recent change signals.
- **Dual delivery channels:**
  - **Terminal:** styled inline tip (non-blocking, copy-paste friendly, optional TUI panel).
  - **macOS Notification Center:** native banner via `terminal-notifier` / `osascript`, with click-to-expand deep link back to tip detail.
- **Tip sources (layered):**
  1. Curated repo pack: `.codelore/tips.yaml` (checked into git — team-shared).
  2. Agent context files: distilled from `AGENTS.md` / `CLAUDE.md` / `openspec/` critical rules.
  3. Recent change signals: last N merges / high-churn paths / "breaking" commit markers.
  4. Optional AI harvest: generate tip candidates from git log + diffs (human-approved before publish).
- **Session hooks:** Claude Code `SessionStart` / `Notification` hooks; Grok/shell `cd` / pre-prompt hooks; manual `codelore tip`.
- **Personalization:** per-user seen-state, spaced re-surface of critical tips, suppress spam, severity tiers (`gotcha` | `convention` | `changelog` | `onboarding` | `critical`).
- **Team loop:** `codelore add` / `codelore approve` so AI-generated or human-written tips become durable team lore without ceremony.
- **Research baseline (inspirations, not clones):** CodeTour (guided steps), `tldr` (scannable tips), `terminal-notifier` + Claude Code hooks (delivery), AGENTS.md (agent rules), continuous-onboarding research (knowledge decay). Gap we fill: **ambient, terminal-native, AI-session-coupled, multi-source lore drip** — not IDE tours, not static docs, not "task done" pings.

## Capabilities

### New Capabilities

- `tip-engine`: Select, rank, and de-duplicate tips for a given repo + user + moment (session start, idle, demand, post-merge).
- `repo-context`: Detect active codebase, map tip packs, parse git signals and agent instruction files.
- `delivery-channels`: Terminal rendering and macOS native notifications with consistent payload schema.
- `session-hooks`: Integrate with Claude Code hooks, shell, and optional Grok/CLI session entry points.
- `tip-authoring`: Human + AI tip creation, validation, storage format (`.codelore/`), approval workflow.
- `seen-state`: Local per-user history, spaced repetition for critical tips, mute/snooze controls.

### Modified Capabilities

- *(none — greenfield project)*

## Impact

- **New repo:** `/Users/sidharthsatapathy/code/codelore` (this project). Runtime language: TypeScript or Go CLI (design will pick; lean TS for hook portability + easy npm install).
- **Consumer integration:** Claude Code `~/.claude/settings.json` hooks; optional global shell function; per-repo `.codelore/` committed for teams.
- **Dependencies:** git, optional `terminal-notifier` (macOS), Node 20+ (or single static binary if Go).
- **Privacy:** local-first; no tip content leaves the machine unless user opts into remote tip packs later (out of MVP).
- **Dogfood use case:** first tip pack lives only in a private consumer monorepo (not this package) to prove the knowledge-multiplier loop.
- **Out of scope for MVP:** full IDE extension, Slack/Discord push, multi-tenant SaaS, auto-publishing unreviewed AI tips, Windows toast (macOS + terminal first).
