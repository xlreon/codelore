# CodeLore POC v3

## Rules

1. **Tips are 1–2 lines max** (never longer).
2. **Every tip shown** is appended to `~/.tips/tips-log.md`.
3. **Multi-repo parents mandate selection** — pick all or specific directories before tips run.

## Setup (once)

```bash
POC=~/code/codelore/poc/codelore.mjs

# Interactive: choose directories under ~/code
node $POC select --cwd ~/code

# Or watch everything discovered under ~/code
node $POC select --cwd ~/code --all

# See what's watched
node $POC watched
```

Config: `~/.tips/config.json`  
Log: `~/.tips/tips-log.md`

## Daily / SessionStart

```bash
node $POC tip --cwd "$PWD" --force
node $POC tip --cwd "$PWD" --channel both --reason session-start
node $POC log          # tail the tip history
node $POC list --cwd ~/code   # * = watched
```

### Claude Code hook

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "node /Users/sidharthsatapathy/code/codelore/poc/codelore.mjs tip --reason session-start --channel both --cwd \"$PWD\""
      }]
    }]
  }
}
```

Run `select` once first. Hooks are non-interactive; if selection is missing they exit quietly with a stderr hint.

## Tip shape

```
CodeLore · frontend [CRITICAL]
NEVER rename symbols with find-and-replace — use gitnexus_rename…
(optional second line of detail)
```

## Files

| Path | Purpose |
|------|---------|
| `~/.tips/config.json` | `watchMode`: `all` \| `selected`, `watched[]` paths |
| `~/.tips/tips-log.md` | Append-only log of every tip shown |
| `~/.codelore/state/` | Per-repo seen/cooldown (not the log) |
