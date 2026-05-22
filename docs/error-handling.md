# MicLayer — Error Handling

Audio apps are hard to troubleshoot. The wrong error message can leave a user blaming the wrong thing for hours. This doc defines the rules.

## 1. Three rules

1. **Plain English first, code second.** The first line is what's wrong in human terms. The error code, if any, is in a "Show details" expander.
2. **Always include a next action.** What can the user *do*? If nothing, say so honestly.
3. **Never panic-and-die in the audio thread.** All errors are recoverable to at least the level of "engine stopped, click to retry".

## 2. Error categories

| Severity | Surface | Example |
|---|---|---|
| `info` | Toast (3 s, auto-dismiss) | "Profile imported successfully." |
| `transient` | Toast (5 s, auto-dismiss) | "Couldn't write to virtual mic — retrying." |
| `user-fixable` | Inline banner that stays until resolved | "No microphone selected — pick one to start." |
| `engine-fatal` | Full-width banner + tray icon turns red | "Audio engine stopped. Click to restart." |

The UI never shows a modal dialog for an error. Modals stop work; the user should be able to keep navigating MicLayer to find the fix.

## 3. The error catalogue

Every engine error has a stable identifier (used in logs), a human title, a one-sentence explanation, and a suggested action.

### `engine.input.no_device`

- **Severity:** user-fixable
- **Title:** "No microphone selected"
- **Explanation:** "MicLayer needs a microphone to process. Pick one from the device list."
- **Action:** Show the device picker. Button label: "Pick a microphone".

### `engine.input.device_missing`

- **Severity:** user-fixable
- **Title:** "Your microphone isn't connected"
- **Explanation:** "We can't find the device you had selected (\"`{device_name}`\"). Plug it back in or choose a different mic."
- **Action:** "Choose another microphone" → device picker.

### `engine.input.device_busy_exclusive`

- **Severity:** user-fixable
- **Title:** "Another app is using your microphone exclusively"
- **Explanation:** "MicLayer can't share the mic right now because another app has locked it. Close that app, or change its audio mode to shared, and try again."
- **Action:** "Try again" → retry engine start.

### `engine.input.permission_denied`

- **Severity:** user-fixable
- **Title:** "Microphone access is blocked"
- **Explanation:** "Windows is blocking apps from using the microphone. Open Settings → Privacy & security → Microphone and allow it."
- **Action:** "Open Windows mic settings" → `ms-settings:privacy-microphone`.

### `engine.input.sample_rate_mismatch`

- **Severity:** transient (recoverable by negotiation)
- **Title:** "Your mic uses an unusual sample rate"
- **Explanation:** "We're converting between `{device_rate}` Hz and 48 kHz to keep things working. This adds a tiny bit of latency."
- **Action:** None (informational; appears once per session).

### `engine.sink.missing`

- **Severity:** user-fixable
- **Title:** "Virtual microphone isn't installed"
- **Explanation:** "MicLayer sends your tuned mic to other apps through a virtual microphone backend. Install it to continue."
- **Action:** "Open install instructions" → Settings → Virtual Microphone.

### `engine.sink.write_failure`

- **Severity:** transient → engine-fatal after N consecutive failures
- **Title:** "Couldn't write to the virtual microphone"
- **Explanation:** "The virtual mic stopped accepting audio. We'll keep trying."
- **Action:** Auto-retry; if 50 callbacks in a row fail, escalate to engine-fatal "Audio engine stopped — try Repair."

### `engine.sink.format_unsupported`

- **Severity:** user-fixable
- **Title:** "Virtual mic format isn't supported"
- **Explanation:** "Our backend opened at a format MicLayer can't drive (`{detail}`). Try repairing the backend."
- **Action:** "Repair backend" → Settings → Virtual Microphone → Repair.

### `engine.dsp.panic`

- **Severity:** engine-fatal
- **Title:** "Audio engine stopped unexpectedly"
- **Explanation:** "A DSP module crashed (`{module}`). Click below to restart the engine. If this keeps happening, please file a diagnostic bundle."
- **Action:** "Restart engine" + "Export diagnostic bundle".

### `engine.config.profile_corrupt`

- **Severity:** user-fixable
- **Title:** "Couldn't read your active profile"
- **Explanation:** "Your profile file `{path}` looks damaged. We've reverted to the Natural profile so you can keep working."
- **Action:** "View original" (opens file location); "Restore a backup" if backups exist.

### `engine.hotkey.conflict`

- **Severity:** user-fixable
- **Title:** "Hotkey is already in use"
- **Explanation:** "Another app has registered `{combo}`. Pick a different combination."
- **Action:** Highlights the offending hotkey row.

### `app.settings.write_failure`

- **Severity:** transient
- **Title:** "Couldn't save your settings"
- **Explanation:** "We weren't able to write `{path}`. Your changes are kept in memory; we'll keep trying."
- **Action:** Auto-retry on next change.

### `app.update_check.failure`

- **Severity:** info (only when the user clicked "Check now")
- **Title:** "Couldn't check for updates"
- **Explanation:** "GitHub didn't answer. Check your connection and try again."
- **Action:** "Retry".

## 4. Translation of Windows error codes

Where engine errors wrap a Windows `HRESULT`, we translate to friendly forms:

| Code | Friendly |
|---|---|
| `0x80070005 E_ACCESSDENIED` | Microphone access blocked (`engine.input.permission_denied`) |
| `0x88890008 AUDCLNT_E_UNSUPPORTED_FORMAT` | Sample rate or format unsupported (`engine.input.sample_rate_mismatch` or `engine.sink.format_unsupported`) |
| `0x8889000A AUDCLNT_E_DEVICE_IN_USE` | Device locked by another app (`engine.input.device_busy_exclusive`) |
| `0x88890004 AUDCLNT_E_DEVICE_INVALIDATED` | Device gone (`engine.input.device_missing`) |

We always log the raw hex code; we never lead with it.

## 5. The "Details" expander

Each banner has a "▾ Show details" link that reveals:

- Stable error ID (e.g. `engine.input.device_busy_exclusive`)
- Raw error message or code from the underlying API
- Timestamp
- "Copy" button (for pasting into a GitHub issue)

This is for tech-savvy users and bug reports. It is never the first thing shown.

## 6. Logging policy

Every error is logged with: stable ID, raw code, module, device context (name + format), and a single-line message. Logs are written via `tracing` to a file in `%APPDATA%\MicLayer\logs\miclayer-YYYY-MM-DD.log`. Audio content is never logged.

## 7. Testing

A `cargo test -p engine-errors` suite asserts:

- Every error variant has a registered catalogue entry.
- Catalogue entries have non-empty title and explanation.
- Every catalogue entry's "action" is one of `{none, picker, retry, open_url, repair_sink, export_bundle, settings_focus}`.
