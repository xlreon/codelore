## Context

AI coding agents (Claude Code, Grok Build, Cursor agents) make developers **productive at a rate that outruns human context absorption**. The artifacts that *should* carry knowledge — `AGENTS.md`, PR descriptions, architecture notes, graphify/GitNexus indexes — are either too long to re-read or never surface at the moment of need.

**Landscape researched (inspirations only):**

| Source | What it does | Gap vs CodeLore |
|--------|----------------|-----------------|
| **Microsoft CodeTour** | IDE guided step-through of files | VS Code only; opt-in playback; not ambient; not session-coupled |
| **tldr / cheat.sh** | Short command cheatsheets | Generic tools, not *this* codebase |
| **terminal-notifier + Claude Code hooks** | Desktop ping on Stop/Notification | Status events only — no lore content |
| **AGENTS.md / CLAUDE.md** | Agent instruction dumps | Static, large, loaded into *agent* context not *human* attention |
| **Continuous onboarding research** | Structured re-learning loops | Process, not product |
| **fortune / tip-of-the-day** | Random fun tips | No repo awareness, no ranking, no team pack |

**CodeLore's unique wedge:** ambient, ranked, multi-source *codebase lore* delivered into the **human** channel (terminal + macOS Notification Center) at **AI session boundaries**, with team-shared tip packs that survive chat amnesia.

Primary stakeholder: local dogfooding on real monorepos; secondary: any AI-assisted team living in the terminal.

## Goals / Non-Goals

**Goals:**

- One high-signal tip per session start (configurable cadence) for the *active* git repo.
- Dual delivery: terminal (always works) + macOS Notification Center.
- Tip packs live in-repo (`.codelore/`) so lore travels with the code.
- Rank by: criticality, recency of related changes, unseen-by-user, topic diversity.
- Claude Code SessionStart hook works out of the box on macOS.
- Authoring path: human `codelore add` and optional AI-harvest candidates (never auto-publish).
- Seen-state is per-user local; packs are shared via git.

**Non-Goals (MVP):**

- Full IDE extension or CodeTour replacement.
- Windows/Linux native toasts (terminal works; OS toasts later).
- Cloud SaaS, multi-tenant tip marketplace.
- Auto-publishing unreviewed LLM-generated tips.
- Replacing AGENTS.md / RAG / knowledge graphs — we *surface* distilled lore, not index the whole repo.
- Real-time collaborative editing of tips.

## Decisions

### D1 — Language & packaging: TypeScript (Node 20+) CLI

- **Choice:** TypeScript, shipped as `codelore` via npm (`npx codelore` / global install). Optional later: Bun compile or Go rewrite for zero-Node install.
- **Why:** Claude Code hooks are shell commands; TS is fast to iterate, YAML/JSON parsing is trivial, Sid's harness is already Node-heavy. Avoid premature single-binary optimization.
- **Alternatives:** Go (great binary, slower product iteration); Python (uv-friendly but heavier runtime for shell hooks); pure shell (unmaintainable ranking logic).

### D2 — Architecture: thin CLI + pure library core (no long-running daemon in MVP)

```
┌─────────────────────────────────────────────────────────┐
│  Triggers                                                │
│  • Claude Code SessionStart hook                         │
│  • `codelore tip` (manual)                               │
│  • shell cd hook (optional)                              │
│  • launchd timer (optional "idle tip")                   │
└───────────────┬─────────────────────────────────────────┘
                │
                v
┌─────────────────────────────────────────────────────────┐
│  codelore CLI                                            │
│  resolve-repo → load packs → rank → pick → deliver       │
└───────────────┬─────────────────────────────────────────┘
                │
     ┌──────────┼──────────┐
     v          v          v
 Terminal    macOS NC    JSON stdout
 (default)   (opt-in)   (for hooks/agents)
```

- **Why no daemon MVP:** SessionStart already is the right moment; a daemon adds lifecycle complexity (permissions, battery) without value until we need idle/scheduled tips.
- **Later:** optional `codelore serve` or launchd agent for scheduled drip.

### D3 — Tip storage format: YAML in `.codelore/tips/*.yaml`

```yaml
# .codelore/tips/auth-gotchas.yaml
version: 1
tips:
  - id: acme-pii-split
    title: "PII redaction is split across two modules"
    body: |
      `core/pii_redactor.py` runs pre-LLM; ID-number patterns lived only in
      `pii_sanitizer.py` (logs). Never assume one module covers all PII.
    tier: critical
    tags: [security, dpdpa, backend]
    paths: [backend/app/core/pii_redactor.py]
    source: human
    created: 2026-07-20
    expires: null          # optional; changelog tips can expire
    links:
      - type: file
        value: backend/app/core/pii_redactor.py
      - type: pr
        value: "https://github.com/..."
```

- **Why YAML over JSON:** hand-editable, multi-line bodies, comments for authors.
- **Why multiple files under `tips/`:** teams can own domains (`auth.yaml`, `billing.yaml`) without merge hell.
- **Manifest:** `.codelore/config.yaml` for repo defaults (channels, cadence, path filters).

### D4 — Ranking algorithm (v1, deterministic)

Score each candidate tip:

```
score = tier_weight(tier)
      + recency_boost(related_paths changed in last N commits)
      + unseen_boost(user has never seen id)
      + diversity_penalty(same tag as last K shown)
      - snooze_block
```

Pick highest score; break ties by `id` hash for stability. Critical tips re-surface via spaced intervals (1d, 3d, 7d, 14d) even if seen.

### D5 — Delivery payload (channel-agnostic)

```ts
type TipPayload = {
  id: string
  title: string          // ≤ 60 chars for macOS title
  body: string           // ≤ 200 chars for banner; full in terminal
  tier: TipTier
  repo: string           // basename or remote name
  paths?: string[]
  deepLink?: string      // codelore://tip/<id> or file URL
}
```

- Terminal: chalk/ansi box, optional `--plain` for CI.
- macOS: `terminal-notifier -title "CodeLore · <repo>" -message "<title>" -subtitle "<tier>" -open <deepLink>` with fallback to `osascript display notification`.
- JSON: `--format json` for hooks that inject into agent context (optional dual-use: human *and* agent).

### D6 — Session integration pattern

**Claude Code** (`~/.claude/settings.json` or project settings):

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "codelore tip --channel both --reason session-start"
      }]
    }]
  }
}
```

**Grok / generic terminal:** `codelore tip` in prompt preamble or zsh `chpwd` (throttled: max 1 tip / 30 min / repo).

**Optional agent-context mode:** `codelore tip --format json --for-agent` prints a one-liner the session can include without replacing human delivery.

### D7 — Tip sources pipeline

| Priority | Source | MVP? |
|----------|--------|------|
| 1 | `.codelore/tips/**/*.yaml` curated | Yes |
| 2 | Distilled bullets from `AGENTS.md` / `CLAUDE.md` (heuristic section extract: "Gotchas", "Critical", "Never") | Yes (read-only extract → ephemeral tips, not written unless approved) |
| 3 | Git recent merges: subject + files → changelog-tier candidates | Yes (ephemeral) |
| 4 | AI harvest (`codelore harvest`) proposing new YAML entries | Post-MVP-core; scaffold CLI stub that writes `candidates/` for human `codelore approve` |

Ephemeral tips (2–3) never auto-commit; they only compete in ranking for the current session.

### D8 — Seen-state location

`~/.codelore/state/<repo-fingerprint>.json` where fingerprint = `git rev-parse --show-toplevel` hash or remote `origin` URL hash.

```json
{
  "seen": { "tip-id": { "count": 2, "lastAt": "..." } },
  "snoozed": { "tip-id": "2026-08-01T00:00:00Z" },
  "lastShownAt": "...",
  "lastShownId": "..."
}
```

No PII; no tip body stored in state.

### D9 — Privacy & safety

- Local-only I/O in MVP.
- Never send tip content or file paths to network.
- Harvest (when built) runs user-selected model / local only by default.
- Tips must not embed secrets; `codelore validate` lints for high-entropy strings and common secret patterns.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Notification fatigue → user disables everything | Default: 1 tip / session; critical-only mode; snooze; quiet hours in config |
| Stale tips after refactors | `paths:` + `codelore validate` checks path existence; `expires`; CI action later |
| Empty pack on new repo | Ship bootstrap: extract from AGENTS.md + recent git so day-1 is never empty |
| Hook latency slows session start | Budget: tip selection < 200ms cold, < 50ms warm; no network; cache parsed packs |
| Competing with agent context window | Human channel is primary; agent format is opt-in and one short paragraph |
| Team ignores authoring | `codelore add` from PR template / stop hook suggestion; harvest lowers friction |
| macOS permission dialogs | Document Notification Center allow-list; graceful fall back to terminal |

## Migration Plan

1. Scaffold package, ship `codelore tip` + YAML schema + seen-state.
2. Install global CLI; wire Claude Code SessionStart for Sid.
3. Dogfood: seed consumer `.codelore/tips/` with 15–30 high-value tips (security, architecture, AI agent gotchas).
4. Add macOS channel once terminal loop feels good.
5. Add harvest/approve loop once authoring pain is real.
6. Rollback: remove hook entry; uninstall package; `.codelore/` stays as harmless docs.

## Open Questions

1. **Product name final:** CodeLore vs shorter `lore` CLI binary? (Lean: package `codelore`, binary `codelore`, short alias `lore`.)
2. **Should session-start tip also inject into Claude context automatically?** Powerful but can pollute context; propose opt-in `--for-agent` only.
3. **Monorepo path awareness:** when cwd is `acme/backend`, prefer tips tagged `backend` / paths under that tree — yes for v1 ranking.
4. **Share tip packs across forks without git?** Out of MVP; later `codelore pack pull`.
5. **Graphify / GitNexus integration** for ranking "important symbols"? Valuable later; keep MVP free of those deps.
