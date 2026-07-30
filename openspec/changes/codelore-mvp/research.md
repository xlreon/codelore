# Research notes — inspirations for CodeLore

*Gathered 2026-07-30. Inspirations only — do not clone product shape.*

## Problem space

- AI-assisted coding (Claude Code, Cursor, Grok, Copilot agents) produces large diffs quickly; developers lose the mental model of what changed and why.
- Project rules (`AGENTS.md`, `CLAUDE.md`) help **agents** more than **humans** — they are rarely re-read mid-week.
- Continuous onboarding research frames codebase understanding as a recurring loop, not a one-time hire event.

## Adjacent products

| Tool | Insight to take | What we don't copy |
|------|-----------------|--------------------|
| **Microsoft CodeTour** | Check-in-able guided knowledge; file/line anchors; primary tour for new joiners | IDE-only, opt-in playback, multi-step tours |
| **tldr / cheat.sh** | Extreme brevity; scannable "do this" form | Global command knowledge, not per-repo lore |
| **terminal-notifier + Claude Code hooks** | Session lifecycle is a natural notification seam on macOS | Today only "done" / "needs input" — empty of codebase knowledge |
| **fortune / tip-of-the-day** | Ambient drip is less fatiguing than docs dumps | Randomness without relevance |
| **CodeTour markers in gutter** | Discoverability near relevant code | Editor dependency |

## Delivery primitives (macOS)

- `terminal-notifier` — CLI → Notification Center (used by Claude Code users for Stop hooks).
- `alerter` — persistent alerts with actions (possible later for "snooze" / "open file").
- `osascript display notification` — zero-dep fallback.

## Unique wedge (positioning)

**CodeLore = ambient multi-source lore at AI session boundaries, terminal-native, team-shared via git.**

Not: IDE tour · not: static wiki · not: agent-only rules · not: generic life tips.

## Design principles from research

1. **Drip, don't dump** — one tip beats a 2k-line AGENTS.md re-read.
2. **Repo-local packs travel with code** — same mechanism as CodeTour files / AGENTS.md.
3. **Human channel first** — agent injection is optional; the bug is human context decay.
4. **Never auto-publish AI tips** — harvest → candidates → human approve (trust).
5. **Hooks must not block sessions** — quiet-fail always.
6. **Critical lore re-surfaces** — spaced repetition for invariants that prevent malpractice/outages.
