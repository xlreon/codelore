# Council Verdict — CodeLore OpenSpec (2026-07-30)

## Status

| Scope | Decision |
|-------|----------|
| **POC** | **APPROVED** — implemented at `poc/codelore.mjs`, smoke-tested |
| **Full MVP / 6-capability platform** | **CONDITIONAL — NOT approved for full implementation yet** |

## Verdict (Chairman)

Ship only the thin loop proven by the POC. Freeze the rest of the OpenSpec task list until real-session dogfood earns expansion.

CodeLore is an **attention product**, not a storage product. Specs over-invested in engine richness (ranking, harvest, dual channels, spaced critical) before proving content + non-mute absorption.

## Spec approval conditions (before full build)

1. Align proposal contradictions: no daemon in MVP; multi-file `tips/**` (not single `tips.yaml` only).
2. Document exit-code matrix: session-start always exit 0; manual may non-zero outside git.
3. Ranking weights as numeric defaults + one scenario matrix (testable).
4. Fingerprint rule: prefer origin URL when present, else toplevel path.
5. Empty-state UX: one-line “why empty?” when no tip (no pack / cooldown / all seen).
6. Cut from v1 build queue (keep as post-dogfood deltas in specs): harvest, AGENTS/git ephemeral, macOS as required path, spaced multi-interval critical, quiet hours, `--for-agent`, secret-lint theater until content works.
7. Optional reserved fields on tip schema for future capture (`triggers`, `source_ref`, `schemaVersion`) — document only.

## Success gate (unlock full MVP)

- Dogfood on daily repos with **hand-written tips only** (packs stay local).
- **≥3 of last 5** Claude/Grok sessions surface a tip that is **not immediately muted / hook removed**.
- At least **one** self-reported “that tip prevented a known mistake.”
- Fail either → rewrite tips or kill cadence; do **not** expand features.

## POC evidence

```
node poc/codelore.mjs tip --force              # terminal
node poc/codelore.mjs tip --channel both --force  # + osascript NC
node poc/codelore.mjs tip --channel json --force
# cooldown silent skip; session-start quiet-fail exit 0 outside git
# state: ~/.codelore/state/<fingerprint>.json
```

## Advisor summary

| Advisor | Vote | Key point |
|---------|------|-----------|
| Contrarian | CONDITIONAL | Wrong moment, critical monopolizes, silent empty product |
| First Principles | CONDITIONAL | Attention not storage; authoring is the product |
| Expansionist | CONDITIONAL | Capture-at-friction is real upside; freeze schema seams |
| Outsider | REJECT (as specified) | Sticky notes — put the note in the folder first |
| Executor | POC yes / full no | Metric before phases 1–8 |
| Peer review | E strongest | C blind (seams ≠ readiness) |
| Chairman | POC yes / full conditional | Outcome + redundancy blind spots |

## Dissent retained

Outsider’s null hypothesis: if 7 bullets in a single file nobody opens still fail, popups won’t save the product. Test content before architecture.
