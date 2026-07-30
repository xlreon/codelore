## ADDED Requirements

### Requirement: Ranked tip selection
The system SHALL select exactly one tip (or zero if no eligible tips exist) for a given repo context, user state, and trigger reason by applying a deterministic ranking function over all eligible candidates.

#### Scenario: Session start with multiple candidates
- **WHEN** a user triggers tip selection for a repo that has multiple unseen tips
- **THEN** the system returns the single highest-scoring eligible tip according to the ranking rules

#### Scenario: No eligible tips
- **WHEN** all tips are snoozed, expired, or filtered out
- **THEN** the system returns no tip and exits successfully without error noise

### Requirement: Tip tiers
The system SHALL support tip tiers `critical`, `gotcha`, `convention`, `changelog`, and `onboarding`, each with a distinct ranking weight where `critical` outranks all others by default.

#### Scenario: Critical beats convention
- **WHEN** an unseen `critical` tip and an unseen `convention` tip both match the repo
- **THEN** the system selects the `critical` tip unless the critical tip is snoozed or outside its spaced-repetition window

### Requirement: Path-aware relevance
When the current working directory is a subdirectory of the repo root, the system SHALL boost tips whose `paths` or `tags` relate to that subdirectory.

#### Scenario: Backend cwd boosts backend tips
- **WHEN** the cwd is under `backend/` and tips exist with paths under `backend/` and under `frontend/`
- **THEN** tips with matching backend paths receive a higher relevance score than unrelated UI-only tips

### Requirement: Recency boost from git
The system SHALL boost tips whose related `paths` appear in recent commits (configurable window, default last 20 commits) so changelog-relevant lore surfaces after heavy AI-assisted merges.

#### Scenario: Files changed recently
- **WHEN** a tip lists `paths: [app/core/auth.py]` and that path was modified in the last 20 commits
- **THEN** that tip receives a recency boost relative to tips with no recent path activity

### Requirement: Diversity across successive tips
The system SHALL apply a diversity penalty so the same primary tag is not shown on consecutive session tips when alternative eligible tips exist.

#### Scenario: Avoid back-to-back same tag
- **WHEN** the last shown tip had tag `security` and multiple non-security tips are eligible
- **THEN** the system prefers a non-`security` tip unless only `security` tips remain eligible

### Requirement: Deterministic tie-break
When two tips have equal scores, the system SHALL break ties using a stable hash of tip `id` so repeated runs do not flicker between tips.

#### Scenario: Equal scores
- **WHEN** two tips compute the same numeric score
- **THEN** the same tip is selected on repeated invocations with unchanged inputs
