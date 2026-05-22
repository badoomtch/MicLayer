# MicLayer — Profile Format

Profiles are versioned JSON files. They are the unit of sharing. They must be human-readable enough that you can open one in a text editor and reason about it, but strict enough that we can evolve the schema without breaking imports.

The authoritative machine-readable schema is [`/packages/shared/schemas/profile.schema.json`](../packages/shared/schemas/profile.schema.json). This document explains the *why* of each field.

## 1. File extension and discovery

- On-disk extension: `.json`.
- Recommended exported filename: `<profile-name>.miclayer.json`.
- When importing, MicLayer accepts any `.json` and validates against the schema; if it parses cleanly and `schemaVersion` is known, it's accepted.

## 2. Top-level structure

```jsonc
{
  "schemaVersion": 1,
  "id": "ddba0e7d-4f0a-4a14-9d68-3fefb5c2ab27",
  "name": "Streaming",
  "author": "MicLayer",
  "kind": "builtin",
  "notes": "For Twitch / YouTube live with a condenser mic.",
  "createdAt": "2026-05-01T00:00:00Z",
  "updatedAt": "2026-05-22T00:00:00Z",

  "modules": {
    "inputGain":         { "enabled": true,  "params": { "gainDb": 0 } },
    "highPass":          { "enabled": true,  "params": { "mode": "medium", "cutoffHz": 80, "order": 2 } },
    "noiseSuppression":  { "enabled": true,  "params": { "amount": 0.65, "voiceFloorDb": -45 } },
    "gate":              { "enabled": true,  "params": { "thresholdDb": -50, "rangeDb": -30, "attackMs": 5, "holdMs": 150, "releaseMs": 250, "hysteresisDb": 3 } },
    "eq":                { "enabled": true,  "params": { "bands": [ ... ] } },
    "compressor":        { "enabled": true,  "params": { "thresholdDb": -22, "ratio": 3, "attackMs": 12, "releaseMs": 150, "kneeDb": 6, "makeupDb": 0, "autoMakeup": true, "detectorMs": 10 } },
    "deEsser":           { "enabled": false, "params": { "targetHz": 7000, "thresholdDb": -26, "amountDb": 6, "q": 1.5 } },
    "limiter":           { "enabled": true,  "params": { "ceilingDb": -1, "releaseMs": 50, "lookaheadMs": 2 } },
    "outputGain":        { "enabled": true,  "params": { "gainDb": 0 } }
  }
}
```

## 3. Field reference

| Field | Required | Notes |
|---|---|---|
| `schemaVersion` | yes | Integer. Bumped when the schema changes incompatibly. MicLayer migrates on load. |
| `id` | yes | UUIDv4. Stable across renames. |
| `name` | yes | Display name. 1-64 chars. Unicode allowed. |
| `author` | no | Free text. Defaults to "Unknown" if omitted. |
| `kind` | yes | `"builtin"` or `"user"`. Built-ins are read-only in the UI; you can duplicate to make a user copy. Imported profiles always come in as `"user"` regardless of the JSON value. |
| `notes` | no | Free text. Markdown is **not** rendered — plain text only. |
| `createdAt` / `updatedAt` | no | ISO-8601 UTC timestamps. Optional but populated by the app. |
| `modules` | yes | Object keyed by module name. Each entry has `enabled: bool` and `params: object`. Missing modules use schema defaults. |

## 4. Module-by-module

### 4.1 `inputGain`

```json
{ "enabled": true, "params": { "gainDb": 0 } }
```

- `gainDb`: number, -24 to +24.

### 4.2 `highPass`

```json
{ "enabled": true, "params": { "mode": "medium", "cutoffHz": 80, "order": 2 } }
```

- `mode`: `"off" | "low" | "medium" | "strong" | "custom"`. When not `"custom"`, the simple-mode preset values override the explicit `cutoffHz` and `order`.
- `cutoffHz`: 20-300.
- `order`: 2 or 4.

### 4.3 `noiseSuppression`

```json
{ "enabled": true, "params": { "amount": 0.65, "voiceFloorDb": -45 } }
```

- `amount`: 0.0-1.0 wet/dry mix.
- `voiceFloorDb`: -60 to -20.

### 4.4 `gate`

```json
{ "enabled": true, "params": { "thresholdDb": -50, "rangeDb": -30, "attackMs": 5, "holdMs": 150, "releaseMs": 250, "hysteresisDb": 3 } }
```

### 4.5 `eq`

```json
{
  "enabled": true,
  "params": {
    "bands": [
      { "type": "low_shelf",  "frequencyHz": 200,   "gainDb": 1.5, "q": 0.7, "enabled": true },
      { "type": "peak",       "frequencyHz": 250,   "gainDb": -2,  "q": 1.0, "enabled": true },
      { "type": "peak",       "frequencyHz": 3000,  "gainDb": 2,   "q": 1.0, "enabled": true },
      { "type": "peak",       "frequencyHz": 5000,  "gainDb": 1.5, "q": 1.2, "enabled": true },
      { "type": "high_shelf", "frequencyHz": 10000, "gainDb": 2,   "q": 0.7, "enabled": true }
    ]
  }
}
```

- Exactly 5 bands. Adding more is a future schema bump.
- `type`: `"low_shelf" | "peak" | "high_shelf" | "high_pass" | "low_pass"`.
- `gainDb`: -24 to +24.
- `q`: 0.1 - 10.
- Order is the cascade order; band index 0 runs first.

### 4.6 `compressor`

```json
{
  "enabled": true,
  "params": {
    "thresholdDb": -22, "ratio": 3, "attackMs": 12, "releaseMs": 150,
    "kneeDb": 6, "makeupDb": 0, "autoMakeup": true, "detectorMs": 10
  }
}
```

### 4.7 `deEsser`

```json
{ "enabled": false, "params": { "targetHz": 7000, "thresholdDb": -26, "amountDb": 6, "q": 1.5 } }
```

### 4.8 `limiter`

```json
{ "enabled": true, "params": { "ceilingDb": -1, "releaseMs": 50, "lookaheadMs": 2 } }
```

### 4.9 `outputGain`

```json
{ "enabled": true, "params": { "gainDb": 0 } }
```

## 5. Validation rules

On load:

1. JSON parses.
2. `schemaVersion` is recognised (currently `1`).
3. Required fields present.
4. Numeric ranges within bounds (clamped + warning logged if not).
5. EQ has exactly 5 bands.

If validation fails, the import is **rejected** with the offending path and reason, not silently truncated.

## 6. Schema versioning and migration

When we bump `schemaVersion`, we ship a pure-function migration `v1 -> v2` in `packages/shared/migrations/`. The app applies all migrations from the file's version to the current version in order, then saves the migrated profile. The original is moved to `profiles/.backup/<id>-v1-<ts>.json`.

Migrations never delete user data without surfacing what changed; the UI shows a one-line "Profile updated from v1 to v2" toast.

## 7. Conventions for new params

- New params **must** have a default. Code reads them with serde `default = "..."`; old profiles continue to load.
- Removing a param: leave it in the schema deprecated, and have the engine ignore it. Don't break old files.
- Renaming a param: write a migration. Don't break old files.

## 8. Sharing

Profiles are safe to share publicly: they describe DSP settings only. They do not encode:

- Device names.
- Hotkeys.
- Theme preferences.
- The user's voice.
- Anything about the user's machine.

The export dialog explicitly displays this assurance.
