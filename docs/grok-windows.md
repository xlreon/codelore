# CodeLore + Grok Build (Windows)

Grok **does not** paint a custom top-corner tip widget inside the TUI. SessionStart **stdout is ignored**, so a terminal banner alone never appears as a corner toast in the Grok UI.

CodeLore’s Windows path therefore does two things:

1. **OS toast (top-right / Action Center)** — closest equivalent to the macOS floating panel  
2. **`~/.tips/session-tip.md`** — agent-readable file a Grok rule can surface in the first reply  

## Quick setup

```powershell
git clone https://github.com/xlreon/codelore.git
cd codelore

# Watch your repos (once)
node poc/codelore.mjs select --cwd $HOME\Code --all

# Manual tip with Windows toast + terminal banner
node poc/codelore.mjs tip --cwd $PWD --channel both --force
```

You should see:

- A full-width terminal banner (if the terminal is visible)
- A **Windows notification** (top-right / Action Center)
- Updated `~\.tips\session-tip.md`

### If no toast appears

1. **Windows Settings → System → Notifications** — allow for **PowerShell** / **Windows Terminal** / **Command Prompt**  
2. Focus Assist / Do Not Disturb off  
3. Test:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File poc\windows\show-toast.ps1 `
  -Title "CodeLore · test" -Message "If you see this, toast works" -Subtitle "gotcha"
```

## Grok SessionStart hook

Create `~/.grok/hooks/codelore-session-start.json` (or project `.grok/hooks/`):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:\\\\ABSOLUTE\\\\PATH\\\\TO\\\\codelore\\\\poc\\\\codelore.mjs\" tip --reason session-start --channel both --cwd \"%CD%\"",
            "timeout": 20
          }
        ]
      }
    ]
  }
}
```

On Windows, prefer absolute paths. `%CD%` / `$PWD` may be empty in some hosts — set `--cwd` from `GROK_WORKSPACE_ROOT` via a small wrapper if needed:

```powershell
# scripts/session-tip.mjs (in this repo) resolves GROK_WORKSPACE_ROOT and always quiet-exits
node C:\path\to\codelore\scripts\session-tip.mjs
```

Restart Grok and confirm under `/hooks` that SessionStart lists the command.

## Agent rule (in-chat tip)

Because Grok ignores SessionStart stdout, add a short global rule (e.g. `~/.grok/rules/01-codelore.md`):

- On first reply, if `~/.tips/session-tip.md` has a real tip under `## Tip`, quote it once as `**CodeLore:** …`
- If the file says “No tip this session”, skip silently

## Channels

| Channel | Behavior |
|---------|----------|
| `terminal` | Banner only |
| `windows` / `desktop` | OS toast only |
| `both` (default on win32) | Terminal + OS toast |
| `json` | Machine-readable tip (+ still writes `session-tip.md`) |

## Config note (Windows)

If you edit `~/.tips/config.json` with PowerShell `Set-Content -Encoding utf8`, strip the **UTF-8 BOM** or use Node to write the file. CodeLore strips BOM on load, but older versions failed open and looked like “no tips.”
