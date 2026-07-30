## ADDED Requirements

### Requirement: Record tip impressions
After successfully delivering a tip, the system SHALL record an impression for that tip id in the user's local seen-state for the repo fingerprint, including timestamp and incrementing view count.

#### Scenario: First view
- **WHEN** a tip is delivered and the user has never seen it
- **THEN** seen-state contains that tip id with count 1 and a last-seen timestamp

#### Scenario: Repeat view
- **WHEN** the same tip is delivered again later
- **THEN** the view count increments and last-seen updates

### Requirement: Prefer unseen tips
All else equal, the system SHALL prefer tips the user has never seen over tips already seen.

#### Scenario: Unseen available
- **WHEN** both seen and unseen tips are eligible with similar base scores
- **THEN** an unseen tip is selected

### Requirement: Spaced re-surface for critical tips
The system SHALL re-surface `critical` tips on a spaced schedule (default intervals: 1 day, 3 days, 7 days, 14 days after prior views) even if previously seen, until a maximum re-surface count is reached (default 4).

#### Scenario: Critical reappears after interval
- **WHEN** a critical tip was last seen more than the next spaced interval ago and re-surface count is below max
- **THEN** the tip is eligible again despite being previously seen

#### Scenario: Non-critical stays down
- **WHEN** a `convention` tip was already seen and other unseen tips exist
- **THEN** the convention tip is not selected solely for spaced repetition

### Requirement: Snooze
The system SHALL support snoozing a tip id for a duration (`codelore snooze <id> --for 7d`), during which the tip is ineligible for selection.

#### Scenario: Snoozed tip skipped
- **WHEN** tip `abc` is snoozed until a future date
- **THEN** ranking excludes `abc` until the snooze expires

### Requirement: Local-only storage
Seen-state SHALL be stored only on the local filesystem under `~/.codelore/state/` (or `CODELORE_HOME`) and MUST NOT include tip bodies or file contents.

#### Scenario: State file shape
- **WHEN** impressions are recorded
- **THEN** the state file contains tip ids, counts, timestamps, and snooze metadata without tip body text

### Requirement: Mute / quiet hours
The system SHALL respect global or repo quiet hours and a mute flag that suppress delivery while still allowing `codelore tip --force` for manual use.

#### Scenario: Quiet hours
- **WHEN** current local time falls within configured quiet hours and reason is `session-start`
- **THEN** no tip is delivered (exit 0)

### Requirement: List history
The system SHALL provide `codelore history` to list recently shown tip ids and titles for the current repo to help users recall what they already saw.

#### Scenario: Show recent
- **WHEN** the user runs `codelore history`
- **THEN** recently delivered tips for the current repo are listed in reverse chronological order
