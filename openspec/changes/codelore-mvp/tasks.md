## 1. Project scaffold

- [ ] 1.1 Initialize npm package (`codelore`) with TypeScript, ESM, Node 20+, `bin` entry for `codelore`
- [ ] 1.2 Add deps: `commander` (or `citty`), `yaml`, `chalk`, `zod`; dev: `vitest`, `tsx`, `typescript`
- [ ] 1.3 Create src layout: `cli/`, `core/` (repo, tips, rank, state), `channels/` (terminal, macos, json), `hooks/`
- [ ] 1.4 Add README with problem statement, install, Claude Code hook snippet, tip schema overview
- [ ] 1.5 Add MIT LICENSE and `.gitignore`

## 2. Tip schema & loading (tip-authoring + repo-context)

- [ ] 2.1 Define Zod schema for tip document (`version`, `tips[]` with id/title/body/tier/tags/paths/source/created/expires/links)
- [ ] 2.2 Implement pack loader for `.codelore/tips/**/*.{yaml,yml}` with partial-failure warnings
- [ ] 2.3 Implement repo root resolution (`git rev-parse --show-toplevel`) + relative cwd + fingerprint
- [ ] 2.4 Implement layered config: defaults → `~/.codelore/config.yaml` → `.codelore/config.yaml` → CLI flags
- [ ] 2.5 Implement `codelore init` scaffolding (config, tips dir, example tip)
- [ ] 2.6 Implement `codelore validate` (schema + secret lint + optional path existence warnings)

## 3. Seen-state & ranking (seen-state + tip-engine)

- [ ] 3.1 Implement local state store at `~/.codelore/state/<fingerprint>.json` (seen, snoozed, lastShown, cooldown)
- [ ] 3.2 Implement ranking: tier weights, unseen boost, recency boost, diversity penalty, snooze filter, expiry filter
- [ ] 3.3 Implement spaced re-surface for `critical` tips (1d/3d/7d/14d, max 4)
- [ ] 3.4 Implement cooldown throttle (default 30m) with `--force` bypass and quiet hours
- [ ] 3.5 Unit tests for ranking determinism, path-awareness, and critical re-surface windows

## 4. Ephemeral sources (repo-context)

- [ ] 4.1 Extract ephemeral candidates from AGENTS.md / CLAUDE.md gotcha-like sections
- [ ] 4.2 Generate ephemeral changelog candidates from last N git commits (subject + paths)
- [ ] 4.3 Ensure ephemeral tips never write to live pack automatically; optional ids prefixed `ephemeral:`

## 5. Delivery channels

- [ ] 5.1 Terminal renderer (styled + `--plain` / `NO_COLOR`)
- [ ] 5.2 JSON payload emitter (`--format json`) matching TipPayload schema
- [ ] 5.3 macOS notifier via `terminal-notifier` with `osascript` fallback
- [ ] 5.4 Channel router: `terminal` | `macos` | `both` | `json` with graceful degradation
- [ ] 5.5 Integration test: mock notifier; assert terminal output snapshot

## 6. CLI commands

- [ ] 6.1 `codelore tip` — full pipeline: resolve → load → rank → deliver → record impression
- [ ] 6.2 `codelore add` — flags + optional prompts; write to `.codelore/tips/`
- [ ] 6.3 `codelore snooze <id> --for 7d` and `codelore history`
- [ ] 6.4 `codelore approve <id>` — move from `.codelore/candidates/` to tips
- [ ] 6.5 `codelore harvest --from git|agents` — write candidates only
- [ ] 6.6 `codelore init hooks` — print Claude Code SessionStart snippet; document merge steps
- [ ] 6.7 Quiet-fail behavior for `--reason session-start` so hooks never block sessions

## 7. Session integration & dogfood

- [ ] 7.1 Document Claude Code `settings.json` hook; optional project-level `.claude/settings.json` example in repo
- [ ] 7.2 Wire Sid's global Claude Code hook (with confirmation) pointing at installed `codelore`
- [ ] 7.3 Seed first real pack: consumer `.codelore/tips/` with ≥15 high-value tips (security/privacy, monorepo layout, AI agent gotchas, migration norms)
- [ ] 7.4 Smoke-test: `cd my-app && codelore tip --force --channel both` shows tip + notification
- [ ] 7.5 Add optional zsh `chpwd` snippet (throttled) to docs for non-Claude terminal use

## 8. Quality bar

- [ ] 8.1 Vitest coverage for core rank/load/state (no network)
- [ ] 8.2 `codelore tip` cold path budget check script (<200ms on warm pack; document measured number)
- [ ] 8.3 OpenSpec validate change `codelore-mvp`
- [ ] 8.4 Tag `v0.1.0` and local `npm link` install path for daily use
