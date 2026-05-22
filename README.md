# MicLayer

**A clean, free, open-source microphone tuning app for Windows.**

MicLayer replaces only the mic-processing part of apps like GoXLR software and SteelSeries Sonar. It is not a mixer, not a soundboard, not a voice changer, not a stream deck, and not a full audio routing platform.

The product is one thing:

> **Physical microphone → real-time tuning chain → branded virtual microphone (`MicLayer Microphone`)**

You select `MicLayer Microphone` in Discord, OBS, Zoom, Teams, your browser, your games, or any recording app — and they receive the tuned signal.

---

## Status

**Pre-alpha — installable MSI, usable end-to-end with VB-CABLE.**

A ~3 MB unsigned MSI installer is buildable via `pnpm tauri build`. After install, MicLayer captures from a real microphone, runs the full DSP chain (gain, high-pass, gate, EQ, compressor, limiter, output gain), pushes the processed signal into VB-CABLE, and other apps see `CABLE Output` as a mic carrying your tuned voice. Profiles load and switch live. The test recorder produces A/B WAVs.

**Install path:** see [`INSTALL.md`](INSTALL.md). MSI is unsigned for now — SmartScreen warning is expected.

Still missing for v1: noise suppression + de-esser (M7), branded `MicLayer Microphone` driver (M11 — would eliminate VB-CABLE), code signing. Files marked `SCAFFOLD:` flag the gaps; the per-milestone state lives in [`docs/roadmap.md`](docs/roadmap.md).

> **You need VB-CABLE installed** for audio to reach other apps. MicLayer detects it and links to the official VB-Audio download page on first run (Settings → Virtual microphone). A first-party signed `MicLayer Microphone` driver replaces the bridge in v1.0.

---

## Why this exists

Most good mic-cleanup tools on Windows are bundled into vendor suites you can't unbundle: GoXLR (hardware-locked), Sonar (SteelSeries-locked), NVIDIA Broadcast (GPU-locked), Krisp (subscription / cloud). The free alternatives are either heavyweight DAW patches (OBS filters, VoiceMeeter chains) or proprietary blobs.

MicLayer aims to give any Windows user — creator, streamer, podcaster, business caller, gamer, or grandparent on a video call — a one-app way to clean up their mic, locally, for free, with a UI that doesn't look like flight-sim software.

---

## Design principles

- **Local-first.** Audio never leaves your machine. No cloud, no accounts, no telemetry.
- **Focused.** Mic in, tuned mic out. Nothing else.
- **Honest.** No fake AI claims. No placeholder features pretending to work.
- **Premium feel, calm UI.** Creator studio, not gamer dashboard.
- **Open-source contributors first.** MIT-licensed, documented, modular.

See [`docs/privacy.md`](docs/privacy.md) for the full privacy commitment.

---

## What MicLayer does

- Captures your selected physical microphone
- Runs it through a modular DSP chain:
  `input gain → high-pass → noise suppression → gate → EQ → compressor → de-esser → limiter → output gain`
- Streams the processed audio to a branded virtual microphone called **`MicLayer Microphone`**
- Provides simple sliders for beginners and full parametric controls for power users
- Ships with curated starter profiles (Natural, Streaming, Podcast, Voiceover, Discord, Noisy Room, Late Night, Headset Rescue, Laptop Mic Rescue, Radio Style)
- Includes an auto-tune wizard that listens to your room and voice and proposes settings in plain English
- Lives in the system tray and keeps processing when the window is closed

## What MicLayer does **not** do

It is not a full audio router, mixer, soundboard, voice changer, stream deck, OBS replacement, music player, or game-chat-music separator. See [`docs/product-spec.md`](docs/product-spec.md) for the full non-goals list.

---

## Repository layout

```
/apps/desktop          Tauri + React UI shell
/engine                Rust audio engine workspace
  /audio                 device capture, output, runtime
  /dsp                   DSP modules (filters, gate, EQ, compressor, etc.)
  /devices               Windows device enumeration
  /virtual-mic           VirtualMicSink abstraction + backends
/packages/shared       Profile schema, IPC types, shared TypeScript
/profiles              Starter profile JSONs shipped with the app
/installer             Wix/NSIS scripts and driver packaging
/docs                  Architecture, specs, plans, research
/scripts               Dev/build helpers
```

Full architecture in [`docs/architecture.md`](docs/architecture.md).

---

## Virtual microphone strategy

MVP ships with a `VirtualMicSink` trait inside the audio engine and **one initial backend: VB-CABLE bridge**. VB-CABLE is a free, widely installed Windows virtual audio cable. If the user has it (or installs it via our first-run helper), MicLayer pipes processed audio into it and renames the Windows-facing label so that in apps it surfaces as `MicLayer Microphone (via VB-CABLE)`.

Stage 2 is a properly branded WDM/AVStream driver that exposes `MicLayer Microphone` as a real Windows input device with no bridge. This requires an EV code-signing certificate, Windows kernel work, and Microsoft attestation signing. The trait boundary means we can drop in the branded driver later without rewriting the engine.

Full feasibility analysis: [`docs/virtual-microphone.md`](docs/virtual-microphone.md) and [`docs/windows-driver-notes.md`](docs/windows-driver-notes.md).

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI shell | Tauri 2.x | Native window + small binary + sandboxed FE, far lighter than Electron |
| Frontend | React + TypeScript + Vite | Familiar, fast, mature |
| Audio engine | Rust | Memory safety in a real-time loop, mature audio crates, no GC |
| Audio I/O | `cpal` + WASAPI backend | First-class Windows audio, low-latency shared/exclusive modes |
| DSP filters | `biquad`, hand-rolled | Small, audited, no GPL contamination |
| Noise suppression | `nnnoiseless` (Rust port of RNNoise, BSD-3) | Local, real-time, no cloud, OSS-compatible |
| IPC | Tauri commands + events, lock-free ring buffers for meters | UI thread never blocks audio thread |
| Profiles | JSON, versioned schema | Human-readable, diff-able, importable/exportable |
| Installer | WiX 4 | Standard Windows MSI, supports driver install hooks |

Tauri was chosen over Electron, Qt, .NET MAUI, and WinUI 3 after weighing binary size, audio thread isolation, and contributor familiarity. Rationale and rejected alternatives are in [`docs/architecture.md`](docs/architecture.md).

---

## Building

The desktop shell is runnable (Milestone 1). See [`BUILDING.md`](BUILDING.md) for the full prerequisites list and walkthrough. Short version:

```powershell
# Prerequisites: Windows 10/11, Node 20+, pnpm 9+, Rust 1.78+, MSVC build tools
pnpm install
pnpm tauri dev
```

What runs today: window, sidebar navigation, theme switcher (Dark/Medium/Light/System), tray icon with Open/Quit, close-to-tray. The audio engine, DSP, virtual mic, and profile import/export are stubs — milestones in [`docs/roadmap.md`](docs/roadmap.md).

---

## Licence

MicLayer is released under the **MIT License** — see [`LICENSE`](LICENSE).

Third-party components retain their own licences. Notable: `nnnoiseless` is BSD-3-Clause, `cpal` is Apache-2.0/MIT, `biquad` is MIT. No GPL/AGPL dependencies are pulled into the engine. The virtual microphone driver, when implemented, will be either MIT-licensed first-party code or a permissively-licensed integration; a copyleft driver is explicitly out of scope.

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Audio-engine contributors should read [`docs/audio-engine.md`](docs/audio-engine.md) first; UI contributors should read [`docs/ui-plan.md`](docs/ui-plan.md).

---

## Privacy

- All audio processing is local.
- No account.
- No cloud upload.
- No analytics or telemetry.
- Test recordings are temporary unless you explicitly save them.
- Diagnostic bundles never include microphone audio unless you opt in per export.

Full statement: [`docs/privacy.md`](docs/privacy.md).
