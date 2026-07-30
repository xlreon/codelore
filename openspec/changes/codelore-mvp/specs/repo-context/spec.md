## ADDED Requirements

### Requirement: Resolve active repository
The system SHALL resolve the active codebase as the git repository root containing the process cwd (or an explicit `--cwd` / `--repo` path), and SHALL fail clearly if no git root is found.

#### Scenario: Inside a monorepo subdirectory
- **WHEN** the cwd is `/code/acme/backend/app`
- **THEN** the system resolves the repo root to `/code/acme` (or the actual git toplevel) and records the relative cwd for path-aware ranking

#### Scenario: Not a git repository
- **WHEN** the cwd is not inside any git work tree
- **THEN** the system prints a short error to stderr and exits non-zero without sending a notification

### Requirement: Load tip packs from .codelore
The system SHALL load all tip documents from `<repo>/.codelore/tips/**/*.{yaml,yml}` and merge them into a single candidate set, ignoring malformed files with a warning rather than aborting the whole run.

#### Scenario: Multiple tip files
- **WHEN** `.codelore/tips/auth.yaml` and `.codelore/tips/billing.yaml` both exist with valid tips
- **THEN** candidates from both files are available for ranking

#### Scenario: One malformed file
- **WHEN** one tip file fails schema validation and another is valid
- **THEN** valid tips still load and a warning names the bad file

### Requirement: Repo config
The system SHALL read optional `<repo>/.codelore/config.yaml` for defaults (channels, quiet hours, commit window, enabled sources) and SHALL apply user global config (`~/.codelore/config.yaml`) as lower-priority defaults.

#### Scenario: Repo overrides global
- **WHEN** global config sets `channel: terminal` and repo config sets `channel: both`
- **THEN** the effective channel for that repo is `both`

### Requirement: Agent instruction extraction
The system SHALL optionally extract ephemeral tip candidates from well-known agent instruction files (`AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`) by scanning for sections whose headings match configured patterns (default: gotcha, critical, never, important, warning).

#### Scenario: Gotchas section present
- **WHEN** `AGENTS.md` contains a section titled `## Gotchas` with bullet items
- **THEN** each bullet MAY become an ephemeral onboarding/gotcha-tier candidate for ranking (not written to disk unless approved)

### Requirement: Git changelog signals
The system SHALL optionally generate ephemeral changelog-tier candidates from recent commit subjects and touched paths (default last 20 commits), excluding merge noise and trivial chore commits when detectable.

#### Scenario: Recent feature merge
- **WHEN** a recent commit subject is `feat(auth): require double consent` and touches auth files
- **THEN** an ephemeral changelog tip candidate is available for ranking

### Requirement: Repo fingerprint
The system SHALL compute a stable repo fingerprint from git toplevel path and, when available, the `origin` remote URL for seen-state isolation across projects.

#### Scenario: Two different clones of different projects
- **WHEN** the user works in project A then project B
- **THEN** seen-state for tips in A does not mark tips in B as seen
