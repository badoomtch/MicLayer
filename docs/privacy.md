# MicLayer — Privacy

MicLayer processes microphone audio. Trust matters more than any other product attribute. This document is the public, auditable commitment.

## 1. The short version

- All audio processing is **local**.
- **No account.** No login. No identifier.
- **No cloud upload.** Of audio. Of settings. Of anything.
- **No analytics.** No telemetry. Not even "anonymous".
- **No network calls** in normal operation. The only exception is an opt-in "Check for updates" feature that hits the GitHub Releases API and nothing else.
- **Test recordings are temporary.** They live in `%APPDATA%\MicLayer\recordings\` and are deleted on app quit unless you explicitly click "Save".
- **Diagnostic bundles never include audio** unless you explicitly tick the "Include last test recording" box per export.

## 2. What MicLayer does with your microphone audio

1. Captures it from the device you selected.
2. Runs it through the DSP chain.
3. Writes it to the virtual microphone backend so other apps can read it.

That's it.

No buffering for "improved AI in future updates." No background training. No "improving quality with our community" newsletters or opt-ins. We don't have a server. There's nothing to upload to.

## 3. What MicLayer stores on your machine

In `%APPDATA%\MicLayer\`:

| Path | What | When |
|---|---|---|
| `config.json` | App settings (theme, hotkeys, autostart) | Updated when you change settings |
| `profiles/<name>.json` | Profile DSP settings (no audio) | Updated when you create or edit a profile |
| `logs/miclayer-YYYY-MM-DD.log` | Engine status, errors, warnings — **no audio content** | Written continuously while running. Rolled daily. Keeps last 14 days. |
| `recordings/test-<uuid>.wav` | Audio you recorded via the in-app test recorder | While the recorder is active; auto-deleted on quit unless you save |
| `diagnostics/bundle-<timestamp>.zip` | Diagnostic ZIP, only when you click Export | Until you delete it |

Logs may include device names like "USB Microphone (Logitech)", sample rates, error codes. They do not include audio data.

## 4. Network

The MicLayer process opens **zero network sockets in normal operation.**

The two exceptions:

1. **Update check (opt-in, off by default).** When you toggle "Check for updates on startup", on each launch MicLayer makes a single HTTPS request to `https://api.github.com/repos/<org>/MicLayer/releases/latest`. It receives a small JSON object. It does not send any identifying data beyond the standard TLS/HTTP headers GitHub sees from any client. There is no "user ID."
2. **Virtual mic backend installer link (one-time, on demand).** In MVP, if VB-CABLE is missing, MicLayer offers to open the official VB-Audio download page in your default browser. MicLayer itself does not download or relay the installer. You install VB-CABLE yourself through your browser.

If you set your OS firewall to block MicLayer's process, both features fail gracefully — the core mic processing keeps working.

## 5. Telemetry

There is no telemetry.

We will not add telemetry. If you see a future PR adding telemetry, it should be rejected on principle.

## 6. Diagnostics

The "Export diagnostic bundle" button packages your logs, your current profile JSON, your config, and a Windows audio-stack probe into a single ZIP file in `%APPDATA%\MicLayer\diagnostics\`. **The ZIP is not sent anywhere.** It is up to you whether to attach it to a GitHub issue.

The default contents:

- Last 7 days of `logs/`
- `config.json`
- Active profile JSON
- Audio device enumeration report
- OS version and driver versions

A checkbox lets you optionally include the last test recording, but it is **off by default** and you must tick it each export. It is never sticky.

## 7. The MicLayer Microphone driver (v1.0+)

When the first-party WDM driver ships in v1.0, it does the following:

- Accepts processed audio from the MicLayer user-mode engine via a per-session shared-memory section.
- Hands that audio to Windows as a capture endpoint.

It does not:

- Log anywhere.
- Phone home.
- Inspect or transform the audio content.
- Persist anything beyond the bytes currently in the ring buffer.

The driver source code is in this repository. Any contributor can audit it.

## 8. Open-source dependencies

We list every dependency that ships in the binary, with its licence, in Settings → About → Open-source licences. The same list is in the repo's `THIRD_PARTY.md` (generated from `Cargo.lock` and `pnpm-lock.yaml` at release time).

We do not introduce dependencies that phone home, even if they have an opt-out, because audit fatigue is real.

## 9. Contact

There is no "privacy@" email because there is no company. Privacy questions go to GitHub issues. If a question is sensitive enough to warrant a private channel, open a private security advisory on the repository.

## 10. Audit

The entire source code is here. You don't have to trust this document — read the code. Specific things worth verifying yourself:

- `apps/desktop/src-tauri/tauri.conf.json` denies the `http` / `https` / `shell.execute` allow-lists by default; the only exceptions are the update check (gated behind a setting) and opening the VB-CABLE download URL (one-shot, user-initiated).
- The engine has no network code anywhere — search for `reqwest`, `ureq`, `hyper`, `tokio::net`. There should be no hits.
- Logs are constructed in plain text with no marshalling to anywhere external.

If you find anything in this repo that contradicts this document, that's a bug. File it.
