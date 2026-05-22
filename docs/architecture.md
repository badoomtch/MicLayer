# MicLayer — Technical Architecture

This document is the authoritative source for *how* MicLayer is built. The product *why* lives in [`product-spec.md`](product-spec.md).

## 1. Top-level shape

```
+----------------------------------------------------------+
|                    MicLayer (single binary)              |
|                                                          |
|  +------------------+        +-------------------------+ |
|  | UI process       |        | Audio engine            | |
|  | Tauri 2 + WebView|<------>| Rust, in-process thread | |
|  | React + TS       |  IPC   | Real-time DSP graph     | |
|  +------------------+        +-------------------------+ |
|         ^                              |                 |
|         |                              v                 |
|         |                     +----------------+         |
|         |                     | VirtualMicSink |         |
|         |                     | (trait + impl) |         |
|         |                     +----------------+         |
|         |                              |                 |
+---------|------------------------------|-----------------+
          |                              |
   Tray + hotkeys              MVP: VB-CABLE backend
   (Windows shell APIs)        v1:  MicLayer WDM driver
```

The UI and audio engine live in the same process. The UI runs on the JS thread inside the Tauri WebView; the audio engine runs on dedicated Rust threads, including one real-time-priority audio callback thread per active stream. They communicate via Tauri's command/event IPC for control messages and via lock-free SPSC ring buffers for high-frequency data (meters, level events).

This is deliberate. A separate "service" process would add complexity (IPC over named pipes, install-time service registration, UAC for service control) for no real isolation benefit, because the heaviest real-time work is already on a kernel-scheduled thread.

## 2. Process and thread model

| Thread | Owner | Priority | Allocations? | Locks? |
|---|---|---|---|---|
| UI main | Tauri / WebView | Normal | yes | yes |
| Tauri command handler | Tauri | Normal | yes | yes |
| Audio capture callback | cpal / WASAPI | Real-time (Pro Audio) | **no** | **no** |
| Audio render callback | cpal / WASAPI (for sink) | Real-time | **no** | **no** |
| Engine control | Rust | Normal | yes | yes |
| Meter / log drain | Rust | Low | yes | yes |
| Tray / hotkey | Windows shell | Normal | yes | yes |

**Rule:** any code that may run on an audio-callback thread must not allocate, lock, log, or panic. See [`audio-engine.md`](audio-engine.md) §3.

## 3. Stack choice

### 3.1 UI shell — Tauri 2

**Chosen because:**
- Tiny binary footprint (a Tauri release build is ~5-15 MB vs 100+ MB for Electron).
- Native Rust on the backend integrates naturally with the audio engine — no FFI gymnastics.
- WebView2 (Edge Chromium) is shipped with Windows 10/11, so no Chromium runtime bundling.
- Sandboxed FE talking to a small allow-list of Tauri commands is a much smaller attack surface than full Node-in-renderer (Electron's history).

**Rejected alternatives:**
- **Electron:** Too big, JS-based audio plumbing would be wrong, full Node exposure is overkill.
- **WinUI 3 / .NET MAUI:** First-class on Windows but locks contributors to C#/XAML; harder to attract OSS contributors than React/TS.
- **Qt:** Strong native UI but C++ build complexity is hostile to drive-by contributors, and Qt's licensing is permissive only under LGPL with dynamic linking — fine but adds friction.
- **Native Rust GUI (egui, iced):** Audio-engineer-vibes UI is hard to achieve here; component libraries are immature; designers can't contribute.

### 3.2 Frontend — React + TypeScript + Vite

Standard, contributor-friendly, fast HMR. Vite is the build tool; no Next.js / SSR shenanigans because this is a desktop app.

State: Zustand for UI state, Tauri events for engine-driven state. No Redux.

Styling: Tailwind CSS with a small custom design tokens layer for the three themes (Dark / Medium / Light). No Material UI — too opinionated; we want a calm custom look. Icons: lucide-react.

### 3.3 Audio engine — Rust

Real-time-safe audio in a managed language (C#, JS) is possible but constantly fighting the GC. Rust gives us:
- No GC stalls.
- Compile-time guarantees about ownership in the audio thread.
- Mature audio ecosystem (`cpal`, `nnnoiseless`, `biquad`, `rtrb`, `realtime-channel`).
- Tauri-native.

**Rejected: C++.** Would work, but Rust's memory safety in a kernel-scheduled thread that's hard to debug is a real advantage, and Tauri's Rust backend means no FFI boundary to maintain.

### 3.4 Audio I/O — cpal with WASAPI backend

`cpal` is a cross-platform audio I/O crate; on Windows it backends to WASAPI. WASAPI supports both shared mode (works alongside other apps, ~10-20 ms latency) and exclusive mode (locks the device, ~3-5 ms). We use shared mode by default and offer exclusive mode in the advanced settings.

**Rejected: ASIO.** ASIO is the lowest-latency option on Windows but requires Steinberg licensing for redistribution and is overkill for the use case. WASAPI shared mode is sufficient for a target latency of ≤20 ms.

### 3.5 DSP libraries

- `biquad` (MIT) — robust biquad filter primitives for the high-pass and parametric EQ.
- `nnnoiseless` (BSD-3) — pure-Rust port of Xiph's RNNoise neural noise suppressor. Local, ~10 ms lookahead, ~48 kHz internal. Fits the "no cloud, no GPU" constraint.
- Custom hand-rolled DSP for gate, compressor, de-esser, limiter (see [`dsp-chain.md`](dsp-chain.md)). All MIT.

All chosen for permissive licences and pure-Rust implementations to keep the build simple.

## 4. IPC between UI and engine

The boundary is intentionally narrow. Three traffic classes:

### 4.1 Commands (UI → Engine)

Tauri commands, JSON-serialised, validated against typed schemas in `packages/shared`. Examples:

```
engine_select_input_device({ device_id: "..." })
engine_set_profile({ profile: { ... } })
engine_set_module_params({ module: "compressor", params: {...} })
engine_toggle_raw_tuned({ raw: bool })
engine_start_test_recording()
engine_stop_test_recording() -> { wav_path: "..." }
engine_run_autotune({ phase: "silence" | "normal" | "loud" })
```

Commands return success/error and may trigger one or more events.

### 4.2 Events (Engine → UI)

Tauri events, JSON-serialised, fired at varying rates:

- `engine.status` — engine state machine transitions (low frequency).
- `engine.device` — device add/remove/change (low frequency).
- `engine.error` — recoverable engine error (low frequency).
- `engine.meters` — input/output peak + RMS, ~30 Hz (∼every 33 ms).
- `engine.gate` — gate open/closed state (event-driven, low rate).
- `engine.clip` — clipping detected (rate-limited to ~5 Hz).

The audio callback never directly fires events. It writes into a lock-free SPSC ring buffer; a low-priority drain thread reads the ring at ~30 Hz, aggregates, and emits Tauri events.

### 4.3 Real-time data (Engine internal)

Lock-free ring buffers (`rtrb`) carry:

- Captured audio frames from the input callback into the processing thread (if we choose a separate processing thread; the default is to process inside the input callback for lower latency).
- Processed frames from the processing/input callback into the sink thread.
- Meter and event samples from the audio thread to the drain thread.

## 5. The processing graph

```
[Input capture]
      |
      v
[Format normalisation]    -- mono / stereo decision, sample-rate conversion to 48 kHz f32
      |
      v
[Input gain]
      |
      v
[High-pass filter]
      |
      v
[Noise suppression]       -- nnnoiseless / RNNoise (v0.5+)
      |
      v
[Gate / expander]
      |
      v
[EQ — parametric, 5 bands]
      |
      v
[Compressor]
      |
      v
[De-esser]                -- (v0.5+)
      |
      v
[Limiter]
      |
      v
[Output gain]
      |
      v
[Meters / clip detector tap]
      |
      v
[Format conversion to sink format]
      |
      v
[VirtualMicSink: write()]
```

Each module exposes:
- `bypass: bool` — when true, returns input unchanged.
- `process(&mut self, in_buf: &mut [f32], n_channels, sample_rate)` — in-place, no allocation, no panic.
- `set_params(&mut self, p: ModuleParams)` — called from the engine control thread; uses double-buffered params so the audio thread reads a consistent snapshot without locking.

Full DSP details: [`dsp-chain.md`](dsp-chain.md). Engine internals: [`audio-engine.md`](audio-engine.md).

## 6. Virtual microphone strategy

The engine doesn't know about VB-CABLE, drivers, or anything Windows-specific. It writes processed frames into a `VirtualMicSink` trait:

```rust
pub trait VirtualMicSink: Send {
    fn name(&self) -> &str;
    fn capabilities(&self) -> SinkCapabilities;
    fn open(&mut self, format: AudioFormat) -> Result<(), SinkError>;
    fn write(&mut self, frames: &[f32]) -> Result<(), SinkError>;
    fn close(&mut self) -> Result<(), SinkError>;
}
```

MVP ships one implementation: `VbCableSink`, which opens VB-CABLE as a WASAPI render device and writes into it. The Windows-facing input device is `CABLE Output` (VB-CABLE's microphone half), which other apps select. We document this clearly; we do not pretend it's our own device.

v1.0 adds `MicLayerWdmSink`, a first-party WDM/AVStream driver that exposes `MicLayer Microphone`. The trait stays the same; the engine doesn't change.

Full feasibility, signing, install, and licensing analysis: [`virtual-microphone.md`](virtual-microphone.md) and [`windows-driver-notes.md`](windows-driver-notes.md).

## 7. Profile and settings storage

### 7.1 Locations

```
%APPDATA%\MicLayer\
  config.json            -- app settings (theme, startup, hotkeys, default device)
  profiles\
    natural.json         -- shipped profile (read-only in UI; can be duplicated)
    streaming.json
    ...
    user-<uuid>.json     -- user-created profiles
  logs\
    miclayer-YYYY-MM-DD.log
  diagnostics\
    bundle-YYYYMMDD-HHMMSS.zip   (only when user clicks Export)
  recordings\
    test-<uuid>.wav      -- temporary test recordings, auto-deleted on quit unless saved
```

### 7.2 Profile format

Versioned JSON, schema in [`/packages/shared/schemas/profile.schema.json`](../packages/shared/schemas/profile.schema.json), documented in [`profile-format.md`](profile-format.md).

### 7.3 Settings format

A separate `config.json` keeps user-level settings out of profiles. Profiles travel between machines; settings are local-machine.

### 7.4 Migrations

On load, if `schemaVersion < current`, the profile is migrated in memory using a chain of pure migration functions (`v1 -> v2 -> v3 ...`) and persisted on first save. Original is backed up to `profiles/.backup-<timestamp>/`.

## 8. Tray, hotkeys, autostart

| Concern | Implementation |
|---|---|
| Tray icon and menu | Tauri's `tauri-plugin-positioner` + native tray APIs |
| Global hotkeys | `tauri-plugin-global-shortcut` (winapi `RegisterHotKey` under the hood) |
| Start with Windows | Registry `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` via `tauri-plugin-autostart`. No service install. |
| Minimise to tray | Intercept window-close, hide window, keep engine running |
| Quit | Explicit tray "Quit" — stops engine, releases device, removes tray icon |

All hotkey state is stored in `config.json` so it survives upgrades. Conflicts are surfaced as a UI warning, never silently overridden.

## 9. Installer

WiX Toolset v4 produces an MSI. Stages:

1. **App files** — Tauri binary, frontend assets, default profiles, README.
2. **Virtual-mic backend** — depending on which backend is selected at install time:
   - MVP: detect VB-CABLE; if missing, offer to download and run the official VB-CABLE installer (with the user's explicit consent — we don't redistribute it).
   - v1.0+: install the bundled `MicLayer Microphone` WDM driver via `pnputil` or `DevCon`. Requires admin elevation. Sets a registry mark so the uninstaller can clean up cleanly.
3. **Start menu / autostart** — shortcut, optional autostart toggle.
4. **Uninstall** — remove app files, uninstall driver if installed, ask whether to keep `%APPDATA%\MicLayer\` profiles.

We do **not** require a reboot for the app itself. Driver install may require a reboot in worst cases; the installer surfaces this honestly.

## 10. Diagnostics

A `Diagnostics` page in Settings shows live engine state and lets the user click `Export diagnostic bundle`. The bundle is a ZIP of:

- Last 7 days of `logs/`
- `config.json` (with hotkeys and device names; hotkeys may include user-chosen keys, but no PII)
- The active profile JSON
- A device probe report (input devices enumerated, sample rates supported, exclusive-mode availability)
- A platform report (Windows build, CPU, RAM, audio driver versions)

The bundle **never includes audio** unless the user has explicitly ticked "Include last test recording". This is enforced in code, not by convention.

Full diagnostics spec: [`diagnostics.md`](diagnostics.md).

## 11. Error handling philosophy

Errors are classified once at the engine boundary into one of:

- **Transient** — the user can usually retry (device busy, exclusive-mode contention). UI shows a non-modal toast.
- **User-fixable** — needs the user to do something (no mic selected, exclusive lock by another app, virtual mic missing). UI shows a clear inline state with a primary action button.
- **Engine-fatal** — engine has stopped and needs restart. UI shows a banner, the tray shows "Engine stopped — click to restart".

Every error displayed to the user is written in plain English with a recommended next action. Hex error codes from Windows are translated; the raw code is logged but never the first thing the user sees. See [`error-handling.md`](error-handling.md).

## 12. Performance budgets

| Target | Budget |
|---|---|
| End-to-end mic-to-virtual-mic latency | ≤ 20 ms (shared mode), ≤ 8 ms (exclusive mode) |
| CPU on a 2020-era 4-core laptop, full chain | ≤ 5% one-core equivalent |
| UI idle CPU | ≤ 1% |
| Memory resident, idle | ≤ 150 MB |
| Cold start to first audio frame | ≤ 1.5 s |
| Allocations per audio callback | **0** (verified via `rtrb` and absence of `Vec::push` etc.) |
| Drop-out tolerance | 0 dropouts in a 60-minute soak test on the target laptop |

CI runs a soak test on Windows runners that verifies dropout-free operation; details in `docs/audio-engine.md` §7.

## 13. Security model

- No network access, full stop. The Tauri allow-list deny-lists `http`, `https`, `shell.execute` (except for the VB-CABLE installer step, gated behind a one-time prompt).
- No file access outside `%APPDATA%\MicLayer\` and the user's selected export folder.
- The frontend can call only the explicit `engine_*` commands; no general FS or process API.
- The audio driver, when shipped, is the highest-risk surface — see [`windows-driver-notes.md`](windows-driver-notes.md) for the threat model and signing posture.
- No native crash reporter that sends crashes anywhere. Crashes log locally; the user chooses whether to attach the log to an issue.

## 14. Build and release

- `pnpm tauri dev` for dev.
- `pnpm tauri build` for release MSI (after WiX is wired up).
- GitHub Actions on Windows runners builds the MSI on tag pushes and attaches it to a Release.
- Auto-updater: Tauri's built-in updater, pointing at the GitHub Releases endpoint. Update checks are off by default; opt-in via Settings. When enabled, the only request made is a HEAD-style check to GitHub. No analytics.

## 15. What this architecture deliberately *cannot* do

- Route audio between arbitrary apps.
- Process more than one input mic into more than one virtual mic.
- Mix two input devices.
- Output to anything other than the configured virtual-mic backend.

Each of those would require breaking the single-pipeline assumption that keeps the codebase small. We're not building them.
