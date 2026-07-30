## ADDED Requirements

### Requirement: Terminal channel
The system SHALL render the selected tip to stdout (or stderr when stdout is reserved for JSON) as a concise, scannable block including tier, repo name, title, body, and optional path/link references.

#### Scenario: Default terminal delivery
- **WHEN** `codelore tip` runs with default settings and a tip is selected
- **THEN** a human-readable tip block appears in the terminal without requiring interactive confirmation

#### Scenario: Plain mode
- **WHEN** `--plain` is set (or `NO_COLOR` is set)
- **THEN** the tip is printed without ANSI styling

### Requirement: macOS Notification Center channel
On macOS, when the channel includes `macos` or `both`, the system SHALL deliver a native notification with title containing the product name and repo, and a message derived from the tip title (and optional subtitle for tier).

#### Scenario: Successful macOS notification
- **WHEN** the user runs with `--channel macos` on macOS and `terminal-notifier` or `osascript` is available
- **THEN** a Notification Center banner appears for the selected tip

#### Scenario: Notifier missing
- **WHEN** macOS channel is requested but no notifier backend works
- **THEN** the system falls back to terminal delivery and warns once

### Requirement: Channel selection
The system SHALL accept channel values `terminal`, `macos`, `both`, and `json`, via CLI flag or config, with default `terminal`.

#### Scenario: Both channels
- **WHEN** `--channel both` is set on macOS
- **THEN** the tip is shown in the terminal and a native notification is sent

### Requirement: JSON output format
When `--format json` or `--channel json` is used, the system SHALL emit a single JSON object matching the tip payload schema on stdout suitable for machine consumption by hooks or agents.

#### Scenario: Machine-readable tip
- **WHEN** `codelore tip --format json` selects a tip
- **THEN** stdout is valid JSON containing at least `id`, `title`, `body`, `tier`, and `repo`

### Requirement: Length constraints for native banners
For macOS notifications, the system SHALL truncate title and message to platform-friendly lengths while keeping the full body available in the terminal rendering.

#### Scenario: Long body tip
- **WHEN** a tip body exceeds 200 characters and macOS channel is used
- **THEN** the notification message uses a shortened form and the terminal (if also used) shows the full body

### Requirement: Non-blocking delivery
Delivery SHALL NOT block waiting for user interaction; notifications and terminal output complete without requiring keypress.

#### Scenario: Hook-friendly
- **WHEN** the CLI is invoked from a Claude Code SessionStart hook
- **THEN** the process exits after delivery without waiting for user input
