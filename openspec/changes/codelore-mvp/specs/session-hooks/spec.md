## ADDED Requirements

### Requirement: Session-start command
The system SHALL provide a CLI entrypoint (`codelore tip`) that is safe to invoke from AI-agent session-start hooks, with optional `--reason session-start` for analytics/state.

#### Scenario: Claude Code SessionStart hook
- **WHEN** Claude Code fires SessionStart and runs `codelore tip --channel both --reason session-start`
- **THEN** at most one tip is delivered for the session workspace cwd and the process exits 0 on success or empty result

### Requirement: Throttle by reason
The system SHALL throttle tip delivery per repo so that repeated SessionStart / shell events within a configurable cooldown (default 30 minutes) do not spam the user, except when `--force` is passed.

#### Scenario: Rapid restarts
- **WHEN** two session-start tip requests for the same repo occur within the cooldown window
- **THEN** the second request skips delivery (exit 0) unless `--force` is set

#### Scenario: Force bypass
- **WHEN** `--force` is passed within the cooldown window
- **THEN** tip selection and delivery proceed normally

### Requirement: Install helper for Claude Code
The system SHALL provide `codelore init hooks` (or equivalent) that prints or merges a recommended Claude Code hooks snippet for SessionStart without overwriting unrelated hook configuration without confirmation.

#### Scenario: Generate hook snippet
- **WHEN** the user runs the hooks install helper
- **THEN** the system outputs a valid hooks JSON fragment referencing the `codelore tip` command

### Requirement: Optional agent dual-output
The system SHALL support `--for-agent` which emits a one-paragraph plain-text tip summary suitable for inclusion in agent context, without replacing human delivery when combined with terminal/macos channels.

#### Scenario: Human plus agent
- **WHEN** `codelore tip --channel terminal --for-agent` is run
- **THEN** a human tip is shown and an agent-oriented summary is written to a designated stream or file path if configured

### Requirement: Working directory passthrough
The system SHALL honor `CODELORE_CWD`, `--cwd`, or the parent process cwd so hooks launched from a tool host still target the user's project directory.

#### Scenario: Hook with explicit cwd
- **WHEN** the hook invokes `codelore tip --cwd /path/to/project`
- **THEN** repo resolution uses `/path/to/project` regardless of the hook host's own cwd

### Requirement: Quiet failure mode for hooks
When `--quiet-fail` is set (default on for `--reason session-start`), unexpected errors SHALL log a one-line warning and exit 0 so a broken CodeLore install cannot block AI session startup.

#### Scenario: Broken install does not block session
- **WHEN** tip selection throws unexpectedly during session-start with quiet-fail enabled
- **THEN** the process exits 0 after a brief stderr warning
