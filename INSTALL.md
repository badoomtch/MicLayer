# Installing MicLayer

Pre-alpha MSI. Works on Windows 11 (x64) and Windows 10 (x64, recent builds).

## What you need

- **Windows 10/11 x64** (Windows 11 is the primary target).
- **Microsoft WebView2 runtime.** Pre-installed on Windows 11. On Windows 10 install from Microsoft if missing.
- **Internet connection on first run** (so MicLayer can download VB-CABLE for you — see below).

That's it. No manual VB-CABLE download, no separate installers, no environment setup.

## Install

1. Double-click `MicLayer_0.0.0_x64_en-US.msi`.
2. Windows SmartScreen will show **"Windows protected your PC"** because this MSI isn't code-signed. Click **More info** → **Run anyway**. (A signed installer arrives with v1.0 — signing requires a $300–500/year certificate the project doesn't have yet.)
3. The MSI drops the MicLayer binary and a Start Menu shortcut. Default location: `C:\Program Files\MicLayer\`.
4. Launch MicLayer from the Start Menu.

## First-run setup

The first time MicLayer launches it checks whether VB-CABLE (a free virtual audio cable that lets MicLayer's processed mic reach Discord/OBS/Zoom/etc.) is installed.

If it isn't:

1. A **Welcome to MicLayer** dialog appears with an **"Install VB-CABLE for me"** button.
2. Click it. MicLayer downloads the official VB-CABLE installer from VB-Audio's CDN (we don't redistribute their files — we orchestrate the download to your machine).
3. Windows asks for administrator permission to install the driver. Click **Yes**.
4. When the installer finishes, MicLayer prompts you to restart Windows. Restart.
5. After reboot, MicLayer is ready. Done.

(If you prefer, the Welcome dialog also offers a "Skip for now" button and a manual-download link — but the one-click install is the recommended path.)

## Using MicLayer

1. **Pick your microphone** in the Dashboard's device dropdown.
2. **Click "Start engine"** — input + output meters should respond when you speak.
3. **In Discord / OBS / Zoom / your browser** — set the microphone to **CABLE Output (VB-Audio Virtual Cable)**. They'll receive your tuned mic.
4. **(Optional) Pick a profile** from the top bar — Streaming, Discord, Podcast, Voiceover, etc.

## Default hotkeys

- `Ctrl+Shift+M` — Mute toggle
- `Ctrl+Shift+R` — Raw / Tuned toggle
- `Ctrl+Shift+]` — Next profile
- `Ctrl+Shift+[` — Previous profile
- `Ctrl+Shift+L` — Show / hide MicLayer window

Rebind in Settings → Hotkeys.

## Uninstall

Windows Settings → Apps → MicLayer → Uninstall. Removes the binary; leaves your profiles + config in `%APPDATA%\app.miclayer.desktop\` so they survive a reinstall. Delete that folder manually for a clean wipe.

VB-CABLE is uninstalled separately via Windows Settings → Apps → "VB-CABLE Driver Pack".

## What's missing (pre-alpha)

- **Noise suppression and de-esser** are no-op stubs. The toggles in Tune do nothing yet. Real cleanup arrives with the `nnnoiseless` integration (Milestone 7).
- **`MicLayer Microphone` branded device** — the Windows-facing device is currently `CABLE Output` (the VB-CABLE relabel). A first-party signed driver replaces the bridge in v1.0.
- **Auto-update** is not wired up. New versions need to be installed manually until the updater ships.
- **Code signing** is not in place. SmartScreen warning on every install until we get a cert.
- **Generic icon.** Real branding comes with v0.5.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Windows protected your PC" on install | Click More info → Run anyway. MSI is unsigned. |
| VB-CABLE auto-install fails | Check internet connection; or use the "Manual download" button to install VB-CABLE yourself from vb-audio.com. |
| "Another app is using your microphone" | Close OBS / Discord / Zoom / anything holding the mic in exclusive mode, then retry. |
| Meters move but Discord doesn't hear me | Confirm Discord's mic is **CABLE Output (VB-Audio Virtual Cable)**, not your physical mic. |
| MicLayer says "VB-CABLE isn't installed" after I installed it | Restart Windows so the driver loads, then restart MicLayer's engine. |
| App won't launch | Run from PowerShell to see the error: `& "C:\Program Files\MicLayer\miclayer-tauri.exe"` |

## Privacy

- All audio processing is local. Your voice doesn't leave your computer.
- No accounts, no telemetry, no analytics.
- The first-run installer makes **one network request** to VB-Audio to fetch the official VB-CABLE installer. After that, MicLayer's only network usage is an opt-in "Check for updates" feature.

See [`docs/privacy.md`](docs/privacy.md) for the full statement.
