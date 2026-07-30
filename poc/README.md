# CodeLore POC

Minimal proof that the core loop works — **not** the full MVP.

## What it proves

1. Detect git repo from cwd  
2. Load tip pack from `.codelore/tips/*.json`  
3. Rank one tip (tier + unseen + path + diversity)  
4. Deliver to terminal and/or macOS Notification Center (`osascript`)  
5. Persist seen-state under `~/.codelore/state/`  
6. 30-minute cooldown (bypass with `--force`)  
7. Quiet-fail when `--reason session-start`

## Run

```bash
# from codelore repo
node poc/codelore.mjs tip --force

# terminal + Mac notification
node poc/codelore.mjs tip --channel both --force

# machine-readable
node poc/codelore.mjs tip --channel json --force

# from another repo that has .codelore/tips/
cd ~/code/acme && node ~/code/codelore/poc/codelore.mjs tip --force
```

## Intentionally missing (post-council full build)

YAML packs, harvest/approve, AGENTS.md extraction, full CLI surface, Zod schema, Claude Code hook installer, spaced multi-interval critical re-surface, secret lint, vitest suite.
