# Tip pack format (local only)

Tip **data** is not shipped with this package. Each consumer repo keeps packs privately:

```
your-repo/
  .codelore/
    config.yaml          # optional
    tips/
      my-domain.json     # local / private
```

## JSON shape

```json
{
  "version": 1,
  "tips": [
    {
      "id": "unique-kebab-id",
      "title": "Short headline",
      "body": "Full tip the user can read completely — action-first.",
      "tier": "critical",
      "tags": ["security"],
      "paths": ["src/auth/"],
      "source": "human",
      "created": "2026-07-31"
    }
  ]
}
```

`tier`: `critical` | `gotcha` | `convention` | `changelog` | `onboarding` | `stack` | `structure`

User history: `~/.tips/tips-log.md` and `~/.tips/config.json` (never in git).
