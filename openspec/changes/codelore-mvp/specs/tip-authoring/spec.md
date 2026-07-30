## ADDED Requirements

### Requirement: Tip schema validation
The system SHALL validate tip documents against a published schema requiring unique `id`, non-empty `title`, non-empty `body`, and a valid `tier` for each tip.

#### Scenario: Valid tip file
- **WHEN** a YAML tip file meets the schema
- **THEN** `codelore validate` exits 0 and reports the tip count

#### Scenario: Missing id
- **WHEN** a tip entry lacks `id`
- **THEN** `codelore validate` exits non-zero and reports the file and field error

### Requirement: Interactive add
The system SHALL provide `codelore add` to create or append a tip into `.codelore/tips/` with prompted or flagged fields (title, body, tier, tags, paths).

#### Scenario: Add gotcha from CLI flags
- **WHEN** a user runs `codelore add --title "..." --body "..." --tier gotcha --tags security`
- **THEN** a tip with a generated unique id is written under `.codelore/tips/` and is immediately eligible for ranking

### Requirement: Secret linting
The system SHALL refuse to write or shall fail validation when tip bodies appear to contain secrets (API keys, private tokens, high-entropy credential-like strings).

#### Scenario: Accidental secret in body
- **WHEN** a tip body contains a string matching secret heuristics (e.g. `sk-`/`ghp_` prefixes or high-entropy tokens)
- **THEN** validation fails with a clear remediation message

### Requirement: Path existence check
The system SHALL optionally warn when tip `paths` do not exist in the current tree (soft-fail by default) so lore stays tied to real files.

#### Scenario: Stale path after refactor
- **WHEN** a tip references `paths: [old/module.py]` and the file is missing
- **THEN** `codelore validate` emits a warning for that tip id

### Requirement: Candidate approval workflow
The system SHALL support a `candidates/` staging area under `.codelore/` for unapproved tips (e.g. from harvest or AI suggestion) and `codelore approve <id>` that moves a candidate into the live tips pack.

#### Scenario: Approve candidate
- **WHEN** a candidate tip exists in `.codelore/candidates/` and the user runs `codelore approve <id>`
- **THEN** the tip is moved into `.codelore/tips/` and removed from candidates

#### Scenario: Candidates not shown by default
- **WHEN** tip selection runs with default config
- **THEN** tips still in `candidates/` are not eligible for delivery

### Requirement: Bootstrap pack
The system SHALL provide `codelore init` to create `.codelore/` scaffolding (`config.yaml`, `tips/.gitkeep`, example tip) in a repo that lacks it.

#### Scenario: Fresh repo init
- **WHEN** a user runs `codelore init` in a git repo without `.codelore`
- **THEN** the directory structure and an example tip file are created

### Requirement: Harvest stub
The system SHALL provide `codelore harvest` that, in MVP, generates candidate tips from recent git history and/or AGENTS.md sections into `.codelore/candidates/` without auto-publishing to live tips.

#### Scenario: Harvest from git log
- **WHEN** the user runs `codelore harvest --from git`
- **THEN** one or more candidate YAML tips are written under `.codelore/candidates/` for human review
