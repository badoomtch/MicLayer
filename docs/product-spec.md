# MicLayer — Product Specification

## 1. What MicLayer is

MicLayer is a free, open-source, Windows-only desktop application that takes a physical microphone, runs it through a real-time tuning chain, and exposes the cleaned-up signal as a single, branded virtual input device called `MicLayer Microphone`. Other applications — Discord, OBS, Zoom, Teams, browsers, games, recording tools — select `MicLayer Microphone` as their input and receive the tuned audio.

That is the entire product. Nothing else.

## 2. The problem

Good microphone cleanup on Windows is currently locked behind:

- **Hardware suites** (GoXLR, Elgato Wave Link) — requires their hardware, mostly closed.
- **Vendor-locked software** (SteelSeries Sonar, Razer Synapse audio) — bundled with bloated companion suites and tied to peripherals.
- **GPU/SaaS dependencies** (NVIDIA Broadcast — NVIDIA cards only; Krisp — subscription, cloud).
- **DAW-grade complexity** (VoiceMeeter, OBS filter chains) — powerful but intimidating, no first-run experience, no profiles a non-engineer would understand.

What's missing is a clean, focused, free, local, open-source utility that does the one thing — make your mic sound better, into one named device — and stops there.

That is MicLayer.

## 3. Target users

In rough order of priority:

1. **Streamers and content creators** on consumer-grade USB mics, headsets, or condensers who can't justify a GoXLR but want something better than raw Windows audio.
2. **Podcasters** recording on home setups.
3. **YouTubers** recording voiceover.
4. **Remote workers** in calls who want to sound clearer without "AI background noise removal" subscription fees.
5. **Gamers** in Discord/voice chat who want a clean voice without bundling into a peripheral vendor's ecosystem.
6. **General Windows users** on laptop mics or basic headsets who'd benefit from cleanup without needing to learn audio engineering.

Notably *not* the target: professional studio engineers (they use Pro Tools / Reaper / RX), live-sound engineers, audiophile mastering engineers.

## 4. Core problem statement

> "I want my microphone to sound noticeably better in every app I use, without learning a DAW, without paying a subscription, without trusting a cloud service with my voice, and without installing a vendor suite that fights for control of my audio."

## 5. Main user flows

### 5.1 First run

1. User installs MicLayer (and the virtual-mic backend it depends on).
2. App launches, runs a one-time setup:
   - Picks the user's physical mic (defaults to current Windows default, but lets the user override).
   - Confirms the virtual mic backend is installed and healthy.
   - Offers to run the auto-tune wizard immediately.
3. Wizard records (locally, temporarily) three short samples — silence, normal speech, loud speech — plus an optional reading phrase.
4. Wizard creates a suggested profile and explains in plain English what it did and why.
5. User can now toggle Raw / Tuned and record a comparison clip.
6. User selects `MicLayer Microphone` in their app of choice (Discord, OBS, etc.) and is done.

### 5.2 Day-to-day

- App lives in the system tray; processing runs continuously.
- User can switch profiles from the tray menu or hotkeys.
- User can mute / push-to-mute / push-to-talk via hotkeys.
- Closing the window minimises to tray; processing continues.
- Quitting (explicit tray action) stops processing cleanly.

### 5.3 Re-tuning

- Mic changed, room changed, voice cold? User re-runs the wizard or duplicates an existing profile and tweaks.
- A/B compare slot lets them quickly toggle current profile vs previous to make sure they didn't make it worse.

### 5.4 Sharing

- User exports a profile as JSON and shares it.
- Another user imports it.
- No accounts, no marketplace, no cloud.

## 6. Feature set (v1)

### Must-have (MVP)

- Input device selection
- Real-time DSP chain: input gain, high-pass, gate, EQ, compressor, limiter, output gain
- Output to virtual microphone backend (VB-CABLE bridge in MVP; see [`virtual-microphone.md`](virtual-microphone.md))
- Profile system: create, duplicate, rename, delete, import/export, default, switch from tray and hotkeys
- 10 starter profiles
- Raw / Tuned toggle
- Test recorder with A/B playback
- Input and output meters, clipping warning, noise floor indicator
- System tray with quick controls
- Global hotkeys (mute, raw/tuned, next/prev profile, push-to-mute, show/hide)
- Themes: Dark / Medium / Light / System
- Settings: start with Windows, start minimised, default input, buffer size, diagnostics
- Diagnostics page with exportable bundle (no audio unless opted-in)
- Honest error messages

### v1 (post-MVP, same release)

- Noise suppression (RNNoise via nnnoiseless)
- De-esser
- Auto-tune wizard with plain-English explanations
- Compare-current-vs-previous-profile playback
- Visual EQ curve
- Reinstall / repair virtual mic from inside the app

### v1.x (later, still v1)

- Branded `MicLayer Microphone` driver (replacing the VB-CABLE bridge)
- Installer-level driver install / repair / uninstall

## 7. Non-goals (v1)

Explicitly **not** built, and explicitly **not** accepted as PRs:

- System-wide audio routing
- Game / chat / music mixers (Sonar-style)
- Soundboard
- Voice changer / pitch shift / character effects
- Stream deck functionality
- Cloud accounts, subscriptions, paid tiers, marketplace
- Team / multi-user features
- Mobile companion app
- macOS or Linux ports
- Per-application output routing
- Music playback / virtual studio
- Cloud AI processing of any kind
- Telemetry, even "anonymous"

These are not "future features." They are explicit limits. The product survives by being focused.

## 8. v1 scope summary

The v1 release is "everything in §6 Must-have + v1 + v1.x", in three shipped milestones:

- **0.1 — Honest MVP.** Working DSP chain, profiles, tray, hotkeys, themes, VB-CABLE bridge. Branded driver is documented as missing.
- **0.5 — Feature-complete.** Adds noise suppression, de-esser, auto-tune wizard, A/B comparison, polished UI.
- **1.0 — Branded driver.** Replaces the VB-CABLE bridge with a first-party WDM/AVStream driver exposing `MicLayer Microphone`. Installer handles driver install/repair/uninstall.

## 9. Roadmap beyond v1

Tentative. Not commitments.

- Per-profile DSP routing for different output scenarios (e.g. "podcast loud" vs "Discord quiet")
- Optional offline transcript-based de-clutter (remove "um"s on recordings, not on live audio)
- ARM64 support if Windows on ARM adoption grows
- Linux port via PipeWire if the audio engine factors cleanly

Items deliberately *not* on the roadmap: voice changers, mixers, accounts, marketplaces, cloud AI. If those become important to a contributor, the project's design doc has failed and the right answer is a fork, not a feature.

## 10. Success criteria

MicLayer v1 is successful if:

1. A first-time user with a $50 USB mic in a noisy room can install MicLayer, run the wizard, and hear a clear improvement in under five minutes.
2. The CPU cost on a 2020-era 4-core laptop is below 5% with the full chain active.
3. Latency from mic to virtual-mic output stays at or below 20 ms on a default setup.
4. No crash, dropout, or stuck-mute requires more than one app restart to clear.
5. No user has to read documentation to select `MicLayer Microphone` in Discord.
6. Zero audio data ever leaves the machine, by design and by audit.
