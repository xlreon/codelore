# CodeLore

**Ambient codebase tips for AI-assisted developers** — Claude Code, Grok, Cursor agents, anyone living in the terminal.

When an AI coding session opens, CodeLore:

1. Detects which codebase you’re in (or the most-used repo under a multi-project parent)
2. Surfaces **one high-signal tip** from curated local packs and/or auto-extracted rules (CLAUDE.md, AGENTS.md, recent git)
3. Shows it as a **full-width terminal banner** plus a **desktop toast** (macOS floating panel · Windows Action Center top-right)
4. Writes `~/.tips/session-tip.md` for agent IDEs (Grok ignores SessionStart stdout) and logs every tip to `~/.tips/tips-log.md`

Tip **data stays local** (your packs, your history). This package ships the tool only.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Why

AI agents ship large diffs faster than humans re-absorb tribal knowledge. `AGENTS.md` is long; chat transcripts die; gotchas live in three people’s heads. CodeLore drips one landmine at session boundaries — peripheral attention, not another wiki.

## Quick start

```bash
git clone https://github.com/xlreon/codelore.git
cd codelore

# One-time: choose which codebases under ~/code get tips
node poc/codelore.mjs select --cwd ~/code --all

# Tip for current directory
node poc/codelore.mjs tip --cwd "$PWD" --force

# Terminal + desktop toast (macOS panel / Windows Action Center)
node poc/codelore.mjs tip --cwd "$PWD" --channel both --notify toast --force

# History
node poc/codelore.mjs log
```

### Desktop toast

**macOS** (optional floating panel with ×):

```bash
bash poc/macos/build.sh   # requires Xcode CLI tools / swiftc
```

Produces `poc/bin/codelore-toast` — non-activating top-right panel.

**Windows** (built-in, no build step): `poc/windows/show-toast.ps1` shows an Action Center toast (top-right). Allow notifications for PowerShell/Terminal if nothing appears. See [docs/grok-windows.md](docs/grok-windows.md).

## Claude Code SessionStart

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "node /ABSOLUTE/PATH/TO/codelore/poc/codelore.mjs tip --reason session-start --channel both --notify toast --cwd \"$PWD\"",
        "timeout": 20
      }]
    }]
  }
}
```

Hooks quiet-fail so a broken install never blocks a session.

## Grok Build SessionStart (Windows / cross-platform)

Grok does **not** render SessionStart stdout in a corner widget. Use desktop toast + the session tip file:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "node C:\\\\ABSOLUTE\\\\PATH\\\\TO\\\\codelore\\\\poc\\\\codelore.mjs tip --reason session-start --channel both --cwd \"%CD%\"",
        "timeout": 20
      }]
    }]
  }
}
```

Place under `~/.grok/hooks/codelore-session-start.json`. Full Windows setup: [docs/grok-windows.md](docs/grok-windows.md).

## Local files (never shipped in this repo)

| Path | Purpose |
|------|---------|
| `~/.tips/config.json` | Watch list (`all` or selected dirs) |
| `~/.tips/tips-log.md` | Append-only log of every tip shown |
| `~/.tips/session-tip.md` | Last tip for agent IDEs (Grok/Cursor) |
| `~/.codelore/state/` | Per-repo seen / cooldown |
| `<your-repo>/.codelore/tips/*.json` | **Your** curated tip packs (private) |

See [docs/tip-pack-format.md](docs/tip-pack-format.md) for the JSON shape.

## Timing

| Timer | Default | Configure |
|-------|---------|-----------|
| Gap between tips (per repo) | **30 minutes** | `node poc/codelore.mjs interval 1h` · presets: `5m 15m 30m 1h 2h 6h 1d off` |
| One-shot override | — | `tip --interval 15m` |
| Bypass gap | — | `tip --force` |
| Toast on-screen | **8s** / **12s** / **16s** by tier | hover pauses; × dismisses |

Raw git commit subjects are **off by default** (they look random). Prefer curated `.codelore/tips/` or CLAUDE “Never Do” rules. Opt in with `--include-git-commits` if you want them.

## Status

Working POC:

- Multi-repo detection + mandated directory select  
- Curated packs + filtered auto tips (docs/git)  
- Terminal full-width banner + macOS toast + **Windows Action Center toast**  
- SessionStart integration (Claude + Grok) + `session-tip.md` for agents  
- UTF-8 BOM-safe config load (Windows PowerShell)  

Not yet: npm publish, YAML packs, harvest/approve CLI, full test suite.

## License

[MIT](LICENSE) © Sidharth Satapathy
