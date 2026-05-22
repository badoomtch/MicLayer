# MicLayer — Roadmap

Milestones for v1. Each milestone has a goal, deliverables, the files/modules touched, acceptance criteria, and known risks.

A milestone is "done" only when its acceptance criteria are met on a real Windows 11 machine, not just CI.

---

## Milestone 0 — Research and design spike

**Status:** ✅ This documentation set is the deliverable.

**Goal:** Land a defensible plan before writing engine code.

**Deliverables:**
- This repository's `docs/` set.
- Profile JSON schema.
- Starter profiles in `profiles/`.
- Repo scaffold with stubs clearly marked.

**Risks resolved:**
- Tech stack chosen (Tauri 2 + Rust + React).
- Virtual mic approach chosen (VB-CABLE bridge for MVP, branded WDM driver for v1.0).
- DSP module list and parameters defined.
- Realistic estimate of where driver work fits.

---

## Milestone 1 — Desktop shell + UI scaffold

**Goal:** A blank, themable MicLayer window that opens, navigates between four sections, and exits cleanly. No audio yet.

**Tasks:**
1. Initialise Tauri 2 project under `apps/desktop/`.
2. Vite + React + TypeScript template.
3. Tailwind + design tokens for Dark / Medium / Light / System themes.
4. App shell layout: top bar, left rail, content area, footer Raw/Tuned + Mute (non-functional yet).
5. Stub pages for Dashboard, Tune, Profiles, Settings (empty cards).
6. Zustand store, ipc typed wrappers (no commands wired yet).
7. Tray icon + minimal tray menu (Open, Quit).
8. Window state persistence (size, position, last section).

**Files/modules touched:**
- `apps/desktop/` (new project)
- `apps/desktop/src-tauri/` (Tauri config, no audio engine code yet)
- `apps/desktop/src/theme/`, `apps/desktop/src/App.tsx`, all feature dirs

**Acceptance criteria:**
- `pnpm tauri dev` launches a window.
- All three themes render correctly; switching is instant.
- Tray icon appears; tray Quit exits cleanly.
- All four sections navigate.
- `pnpm tauri build` produces an MSI that installs and launches.

**Risks:**
- Tauri 2 plus pnpm workspace quirks on Windows — mitigation: pin versions in `package.json`.

---

## Milestone 2 — Input device capture and meters

**Goal:** Open the user's selected microphone, run a passthrough (no DSP), display real input meters.

**Tasks:**
1. Set up Rust workspace under `engine/` with crates `audio`, `dsp`, `devices`, `virtual-mic`.
2. `engine/devices/` — enumerate WASAPI capture devices via `cpal`; expose to UI.
3. `engine/audio/` — open selected device, run a no-op pipeline, push meter samples through a ring.
4. Tauri commands: `engine_list_devices`, `engine_select_input`, `engine_start`, `engine_stop`.
5. Tauri events: `engine.meters`, `engine.status`, `engine.device`.
6. UI: Dashboard `LevelMeter` shows real input.
7. Soak-test scaffold (`engine-soak` binary).

**Files/modules touched:**
- `engine/audio/`, `engine/devices/`, `engine/virtual-mic/` (sink trait, no implementations)
- `apps/desktop/src-tauri/src/` (command handlers)
- `apps/desktop/src/features/dashboard/`

**Acceptance criteria:**
- Selecting a mic and clicking "Start engine" shows live meters.
- Hotplugging a USB mic refreshes the device list.
- 5-minute soak: zero allocations on the audio thread (asserted by the soak binary).
- Engine survives unplug of the selected mic without crashing — UI shows clean error.

**Risks:**
- WASAPI sample-rate mismatches; resampler integration may slip into this milestone.

---

## Milestone 3 — DSP chain (no NS, no de-esser yet)

**Goal:** The full chain except noise suppression and de-esser, with simple-mode controls wired up.

**Tasks:**
1. Implement modules: `input_gain`, `high_pass`, `gate`, `eq`, `compressor`, `limiter`, `output_gain`.
2. Module params API with triple-buffered snapshots.
3. UI: Tune section module cards with simple + advanced controls.
4. Bypass per module, Raw/Tuned toggle.
5. Clip detection event.
6. Parameter smoothing tested via unit tests.

**Files/modules touched:**
- `engine/dsp/` (all module files)
- `apps/desktop/src/features/tune/`

**Acceptance criteria:**
- Each module passes its acceptance criteria in `dsp-chain.md`.
- Toggling Raw/Tuned switches between dry and wet without click.
- CPU budget hit: full chain (no NS) at ≤ 2% one-core on the reference laptop.
- Soak test passes with the full chain enabled.

**Risks:**
- Compressor envelope tuning is iterative; the wizard may force revisits later.

---

## Milestone 4 — Profiles

**Goal:** Full profile lifecycle.

**Tasks:**
1. Profile schema validation in Rust + TypeScript.
2. 10 starter profiles loaded from `profiles/` at build time and copied to `%APPDATA%\MicLayer\profiles\` on first run.
3. UI: Profiles section (list, details, duplicate, rename, delete, import, export).
4. Default profile persistence.
5. Tray menu: profile submenu.
6. Profile switching applies all module params atomically.

**Files/modules touched:**
- `packages/shared/`
- `apps/desktop/src/features/profiles/`
- `apps/desktop/src-tauri/src/profiles.rs`

**Acceptance criteria:**
- 10 starter profiles present and switchable.
- Export → import round trip preserves all settings.
- Built-in profiles cannot be deleted or edited (only duplicated).
- Profile schema migrations work (round-trip of a v1 file with v2 schema).

**Risks:**
- Versioning early matters; schema design must accommodate new DSP params.

---

## Milestone 5 — Test recorder + A/B comparison

**Goal:** Record a short clip and compare raw vs processed.

**Tasks:**
1. Engine side-tap for raw + processed, ≤30 s capture.
2. WAV writer (background thread, no real-time impact).
3. UI: Record Test modal with two waveform previews and play/pause.
4. Auto-delete recordings on quit unless saved.

**Files/modules touched:**
- `engine/audio/recorder.rs`
- `apps/desktop/src/features/recorder/`

**Acceptance criteria:**
- Recording 30 s of raw + processed produces two playable WAVs.
- Recordings are deleted on app quit unless saved.
- Recordings are stored in `%APPDATA%\MicLayer\recordings\` and never elsewhere.

**Risks:**
- WAV writing on a separate thread + back-pressure — well-trodden ground.

---

## Milestone 6 — Tray menu + hotkeys

**Goal:** Complete tray and global hotkey functionality.

**Tasks:**
1. Tray submenu for profile switching (built dynamically from current profiles).
2. Global hotkeys: mute, push-to-mute, raw/tuned, next/prev profile, show/hide.
3. Hotkey settings UI with conflict warnings.
4. "Start with Windows" + "Start minimised" working end-to-end.

**Files/modules touched:**
- `apps/desktop/src-tauri/src/tray.rs`
- `apps/desktop/src-tauri/src/hotkeys.rs`
- `apps/desktop/src/features/settings/sections/HotkeysSection.tsx`

**Acceptance criteria:**
- All default hotkeys work even when the window is hidden.
- Conflicting hotkey is rejected with a clear message.
- Push-to-mute releases on key-up reliably.
- Autostart toggle survives reboot.

**Risks:**
- Push-to-mute on Windows requires low-level key hook; `tauri-plugin-global-shortcut` may not support hold-style. Fallback to `winapi::winuser::SetWindowsHookExW` if needed; document in PR.

---

## Milestone 7 — Noise suppression, de-esser, auto-tune wizard

**Goal:** Round out the audio quality story.

**Tasks:**
1. Integrate `nnnoiseless` as the `noise_suppression` module.
2. Implement `de_esser` module.
3. Engine: `engine_run_autotune` API with three (or four) sample-capture phases.
4. UI: Auto-tune wizard with plain-English suggestions.
5. UI: First-run flow incorporating the wizard as an optional step.

**Files/modules touched:**
- `engine/dsp/noise_suppression.rs`
- `engine/dsp/de_esser.rs`
- `engine/audio/autotune.rs`
- `apps/desktop/src/features/wizard/`
- `apps/desktop/src/features/onboarding/`

**Acceptance criteria:**
- NS at `amount = 1.0` cleans up fan-noise samples without obvious artefacts.
- De-esser tames sibilance without affecting non-sibilant speech.
- Wizard produces sensible profiles for at least three different mic/room setups.

**Risks:**
- `nnnoiseless` CPU cost on older laptops — may need to default to Medium rather than High.

---

## Milestone 8 — Virtual mic backend (VB-CABLE bridge)

**Goal:** Processed audio actually reaches other apps.

**Tasks:**
1. `engine/virtual-mic/vb_cable.rs` — detect VB-CABLE, open it as a render device, write processed frames.
2. First-run detection + the "install VB-CABLE" onboarding step.
3. Settings → Virtual Microphone section: status, reinstall/repair (opens VB-Audio page), set as default communications input.
4. Honest UI labelling ("Apps will see this as CABLE Output").

**Files/modules touched:**
- `engine/virtual-mic/vb_cable.rs`
- `apps/desktop/src/features/onboarding/`
- `apps/desktop/src/features/settings/sections/VirtualMicSection.tsx`

**Acceptance criteria:**
- Discord, OBS, and Zoom can all receive the processed signal via VB-CABLE Output.
- VB-CABLE missing → clear UI banner with the action.
- Engine cleanly handles VB-CABLE being uninstalled at runtime.

**Risks:**
- VB-CABLE format negotiation (it sometimes opens at 44.1 kHz, sometimes 48). Resampler must handle this.

---

## Milestone 9 — Installer + diagnostics + polish

**Goal:** Shippable 0.1.

**Tasks:**
1. WiX 4 MSI builder with shortcut + autostart toggles.
2. Diagnostics page with exportable bundle.
3. Plain-English error mapping for every engine error variant.
4. Open-source licences page.
5. Privacy page in-app.
6. README polish + screenshots.

**Files/modules touched:**
- `installer/`
- `apps/desktop/src/features/settings/sections/DiagnosticsSection.tsx`
- `apps/desktop/src/features/settings/sections/AboutSection.tsx`

**Acceptance criteria:**
- MSI installs and uninstalls cleanly on a fresh Windows 11 VM.
- Diagnostic bundle is < 5 MB and contains no audio unless opted in.
- Every error variant has a written explanation displayed in the UI.

**Risks:**
- WiX learning curve. Mitigation: borrow patterns from other Tauri-MSI projects.

---

## Milestone 10 (= v0.5) — Public beta hardening

**Goal:** Spend a release cycle on bug reports, performance, edge devices.

**Tasks:**
1. Triage real-world bugs from the 0.1 release.
2. Bluetooth mic handling (sample-rate weirdness, drop-outs).
3. Exclusive-mode WASAPI when requested.
4. Better device-busy diagnostics.
5. Wider profile tweaks based on user feedback.

---

## Milestone 11 (= v1.0) — Branded driver

**Goal:** Replace the VB-CABLE bridge with our own signed WDM driver exposing `MicLayer Microphone`.

**Tasks:**
1. Fork SYSVAD; cut it down; rebrand.
2. User-kernel shared-memory data path.
3. EV cert + Partner Center attestation flow.
4. Installer: bundle the signed driver, install/repair/uninstall.
5. UI: rename the backend everywhere.
6. Regression matrix across Windows 10 latest and Windows 11 latest two.

**See:** [`virtual-microphone.md`](virtual-microphone.md), [`windows-driver-notes.md`](windows-driver-notes.md).

---

## After v1

Tentative, not commitments. See [`product-spec.md`](product-spec.md) §9.

- Per-profile DSP routing
- Optional offline transcript-based de-clutter for *recordings only*
- ARM64 support
- Linux port via PipeWire

Explicitly not on the roadmap: voice changers, mixers, accounts, cloud AI, marketplaces.

---

## Cadence

No fixed cadence in v1. Release milestones when their acceptance criteria are honestly met. Don't ship 0.1 with a fake "Working" virtual mic indicator just to claim it works — that's the failure mode we're avoiding.
