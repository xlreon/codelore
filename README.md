# CodeLore

**Ambient codebase tips for AI-assisted developers** (Claude Code, Grok, terminal agents).

When a session opens, CodeLore:

1. Detects which codebase you’re in (or the most active one under a multi-repo parent)
2. Generates a **1–2 line** tip from git, CLAUDE/AGENTS docs, and stack signals — **no hand-seeding required**
3. Logs every tip to `~/.tips/tips-log.md`
4. Lets you **select** which directories get tips when you live under a folder like `~/code`

> Private POC. Zero npm dependencies for the script.

## Quick start

```bash
# One-time: choose which codebases under ~/code get tips
node poc/codelore.mjs select --cwd ~/code --all

# Show a tip for the current directory
node poc/codelore.mjs tip --cwd "$PWD" --force

# Terminal + macOS notification
node poc/codelore.mjs tip --cwd "$PWD" --channel both --force

# History of tips shown
node poc/codelore.mjs log
```

### Files written on your machine

| Path | Purpose |
|------|---------|
| `~/.tips/config.json` | Watch list (`all` or selected dirs) |
| `~/.tips/tips-log.md` | Append-only log of every tip shown |
| `~/.codelore/state/` | Per-repo seen / cooldown |

## Claude Code SessionStart

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "node /ABSOLUTE/PATH/TO/codelore/poc/codelore.mjs tip --reason session-start --channel both --cwd \"$PWD\""
      }]
    }]
  }
}
```

Run `select` once first. Hooks are non-interactive and quiet-fail so a missing install never blocks a session.

## Commands

| Command | What it does |
|---------|----------------|
| `select --cwd DIR [--all]` | **Required** for multi-repo parents — pick all or specific dirs |
| `tip` | Resolve workspace → auto tip → deliver → log |
| `list` | Ranked codebases (`*` = watched) |
| `detect` | JSON workspace resolution |
| `watched` | Show config |
| `log` | Tail `~/.tips/tips-log.md` |

## POC status

Working today:

- Multi-repo frecency + mandated directory selection  
- Auto tips from docs / git / stack (curated packs optional)  
- 1–2 line max formatting  
- Terminal + macOS (`osascript`) + JSON  
- Tip log under `~/.tips/`  

Not yet: packaged npm CLI, YAML packs, LLM-polished tips, capture-on-agent-correction.

## License

MIT (planned). Private repo for now.
